import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { runInTransaction } from "../db/client";
import type { PrismaTransactionClient } from "../db/types";
import { ApiError } from "../middleware/responses";
import { normalizeTagUid } from "../contracts/rfid";
import type { ISubjectRevisionService } from "../contracts/services";
import { toActorRef } from "../materials/materials-service";
import { createInternalCommitment } from "../ledger/commitment-service";
import type { ScanOutcome, ScanResolution } from "@/domain/types";
import type {
  ApproveOrderInput,
  BindGarmentTagInput,
  BindGarmentTagResult,
  ConfirmCuttingSourceInput,
  ConfirmCuttingSourceResult,
  GarmentDetailDTO,
  GarmentDTO,
  GarmentStage,
  OrderStatus,
  PlanOrderInput,
  ProductionOrderDetailDTO,
  ProductionOrderDTO,
  ProductSpecDTO,
  ReplaceGarmentCardInput,
  ReplaceGarmentCardResult,
  RoutineScanInput,
  RoutineScanResult,
} from "./production-types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function idOrCodeWhere(idOrCode: string) {
  return UUID_REGEX.test(idOrCode)
    ? { OR: [{ id: idOrCode }, { code: idOrCode }] }
    : { code: idOrCode };
}

// ---------------------------------------------------------------- Subject Revision Service (Optimistic Concurrency)

export class SubjectRevisionService implements ISubjectRevisionService {
  async incrementGarmentRevision(
    garmentId: string,
    expectedRevision: number,
    tx: PrismaTransactionClient,
  ): Promise<number> {
    const garment = await tx.garments.findUnique({
      where: { id: garmentId },
      select: { revision: true },
    });
    if (!garment) {
      throw ApiError.notFound(`Garment '${garmentId}' not found.`, undefined, "WT_ERR_NOT_FOUND");
    }
    if (garment.revision !== expectedRevision) {
      throw ApiError.conflict(
        `Concurrency conflict on garment '${garmentId}'. Expected revision ${expectedRevision}, found ${garment.revision}.`,
        { garmentId, expectedRevision, currentRevision: garment.revision },
        "WT_ERR_CONCURRENCY_CONFLICT",
      );
    }
    const updated = await tx.garments.update({
      where: { id: garmentId },
      data: { revision: { increment: 1 } },
      select: { revision: true },
    });
    return updated.revision;
  }

  async incrementOrderRevision(
    orderId: string,
    expectedRevision: number,
    tx: PrismaTransactionClient,
  ): Promise<number> {
    const order = await tx.production_orders.findUnique({
      where: { id: orderId },
      select: { revision: true },
    });
    if (!order) {
      throw ApiError.notFound(`Production order '${orderId}' not found.`, undefined, "WT_ERR_NOT_FOUND");
    }
    if (order.revision !== expectedRevision) {
      throw ApiError.conflict(
        `Concurrency conflict on order '${orderId}'. Expected revision ${expectedRevision}, found ${order.revision}.`,
        { orderId, expectedRevision, currentRevision: order.revision },
        "WT_ERR_CONCURRENCY_CONFLICT",
      );
    }
    const updated = await tx.production_orders.update({
      where: { id: orderId },
      data: { revision: { increment: 1 } },
      select: { revision: true },
    });
    return updated.revision;
  }
}

export const subjectRevisionService = new SubjectRevisionService();

// ---------------------------------------------------------------- Product Specifications

export async function listProductSpecs(
  tx?: PrismaTransactionClient,
): Promise<ProductSpecDTO[]> {
  return runInTransaction(async (db) => {
    const specs = await db.product_spec_versions.findMany({
      include: { staff_users: true },
      orderBy: [{ style_code: "asc" }, { version: "desc" }],
    });

    return specs.map((sp) => {
      const parsedSpec =
        typeof sp.specifications === "object" && sp.specifications !== null
          ? (sp.specifications as Record<string, unknown>)
          : {};

      const description = parsedSpec["description"]
        ? String(parsedSpec["description"])
        : undefined;

      return {
        id: sp.id,
        styleCode: sp.style_code,
        version: sp.version,
        productName: sp.product_name,
        category: (parsedSpec["category"] as ProductSpecDTO["category"]) || "shirt",
        standardConsumptionMeters:
          Number(parsedSpec["standardConsumptionMeters"]) || 2.0,
        sizeVariants: Array.isArray(parsedSpec["sizeVariants"])
          ? (parsedSpec["sizeVariants"] as string[])
          : ["S", "M", "L", "XL"],
        active: parsedSpec["active"] !== false,
        description,
        approvedBy: sp.approved_by,
        approvedByName: sp.staff_users.display_name,
        approvedAt: sp.approved_at.toISOString(),
      };
    });
  }, tx);
}

export async function saveProductSpec(
  input: {
    id?: string | undefined;
    styleCode: string;
    name: string;
    category?: "shirt" | "trouser" | "jacket" | "other" | undefined;
    standardConsumptionMeters: number;
    sizeVariants?: string[] | undefined;
    active?: boolean | undefined;
    description?: string | undefined;
  },
  actor?: unknown,
  tx?: PrismaTransactionClient,
): Promise<string> {
  const actorRef = toActorRef(actor);
  return runInTransaction(async (db) => {
    const existing = await db.product_spec_versions.findFirst({
      where: { style_code: input.styleCode },
      orderBy: { version: "desc" },
    });

    const nextVersion = existing ? existing.version + 1 : 1;

    let staffUserId = actorRef.id;
    const existingStaff = await db.staff_users.findUnique({
      where: { id: staffUserId },
    });
    if (!existingStaff) {
      const fallback = await db.staff_users.findFirst({
        where: { suspended_at: null },
      });
      staffUserId = fallback ? fallback.id : "00000000-0000-0000-0000-000000000000";
    }

    const created = await db.product_spec_versions.create({
      data: {
        style_code: input.styleCode,
        version: nextVersion,
        product_name: input.name,
        specifications: {
          category: input.category || "shirt",
          standardConsumptionMeters: input.standardConsumptionMeters,
          sizeVariants: input.sizeVariants || ["S", "M", "L", "XL"],
          active: input.active !== false,
          description: input.description,
        },
        approved_by: staffUserId,
        approved_at: new Date(),
      },
    });

    return created.id;
  }, tx);
}

// ---------------------------------------------------------------- Default Factory Workflow Helper

export async function getOrCreateDefaultWorkflow(
  tx: PrismaTransactionClient,
  approverId: string,
): Promise<string> {
  const existing = await tx.workflow_versions.findFirst({
    where: { workflow_code: "STD_GARMENT" },
    orderBy: { version: "desc" },
  });
  if (existing) return existing.id;

  const created = await tx.workflow_versions.create({
    data: {
      workflow_code: "STD_GARMENT",
      version: 1,
      title: "Standard Garment Assembly Workflow",
      approved_by: approverId,
      approved_at: new Date(),
    },
  });
  return created.id;
}

// ---------------------------------------------------------------- Production Orders

export async function listOrders(
  actor?: unknown,
  filters?: { status?: string | undefined },
  tx?: PrismaTransactionClient,
): Promise<ProductionOrderDTO[]> {
  return runInTransaction(async (db) => {
    const orders = await db.production_orders.findMany({
      include: {
        product_spec_versions: true,
        workflow_versions: true,
        staff_users_production_orders_created_byTostaff_users: true,
        staff_users_production_orders_approved_byTostaff_users: true,
      },
      orderBy: { created_at: "desc" },
    });

    return orders.map((o) => ({
      id: o.id,
      code: o.code,
      workflowVersionId: o.workflow_version_id,
      productSpecVersionId: o.product_spec_version_id,
      productName: o.product_spec_versions.product_name,
      styleCode: o.product_spec_versions.style_code,
      plannedQuantity: o.planned_quantity,
      status: o.status,
      plannedFor: o.planned_for ? o.planned_for.toISOString() : null,
      createdBy: o.created_by,
      createdByName:
        o.staff_users_production_orders_created_byTostaff_users?.display_name ?? null,
      createdAt: o.created_at.toISOString(),
      approvedBy: o.approved_by,
      approvedByName:
        o.staff_users_production_orders_approved_byTostaff_users?.display_name ?? null,
      approvedAt: o.approved_at ? o.approved_at.toISOString() : null,
      revision: o.revision,
    }));
  }, tx);
}

export async function getOrderDetail(
  orderIdOrCode: string,
  actor?: unknown,
  tx?: PrismaTransactionClient,
): Promise<ProductionOrderDetailDTO | null> {
  return runInTransaction(async (db) => {
    const order = await db.production_orders.findFirst({
      where: idOrCodeWhere(orderIdOrCode),
      include: {
        product_spec_versions: {
          include: { staff_users: true },
        },
        workflow_versions: true,
        staff_users_production_orders_created_byTostaff_users: true,
        staff_users_production_orders_approved_byTostaff_users: true,
        material_stock_movements: {
          where: { kind: "issued" },
          include: { material_lots: true },
          orderBy: { performed_at: "desc" },
        },
        cutting_jobs: {
          include: { garments: true },
          orderBy: { performed_at: "desc" },
        },
      },
    });

    if (!order) return null;

    const parsedSpec =
      typeof order.product_spec_versions.specifications === "object" &&
      order.product_spec_versions.specifications !== null
        ? (order.product_spec_versions.specifications as Record<string, unknown>)
        : {};

    const description = parsedSpec["description"]
      ? String(parsedSpec["description"])
      : undefined;

    const spec: ProductSpecDTO = {
      id: order.product_spec_versions.id,
      styleCode: order.product_spec_versions.style_code,
      version: order.product_spec_versions.version,
      productName: order.product_spec_versions.product_name,
      category: (parsedSpec["category"] as ProductSpecDTO["category"]) || "shirt",
      standardConsumptionMeters:
        Number(parsedSpec["standardConsumptionMeters"]) || 2.0,
      sizeVariants: Array.isArray(parsedSpec["sizeVariants"])
        ? (parsedSpec["sizeVariants"] as string[])
        : ["S", "M", "L", "XL"],
      active: parsedSpec["active"] !== false,
      description,
      approvedBy: order.product_spec_versions.approved_by,
      approvedByName: order.product_spec_versions.staff_users.display_name,
      approvedAt: order.product_spec_versions.approved_at.toISOString(),
    };

    const issues = order.material_stock_movements.map((m) => ({
      id: m.id,
      lotId: m.material_lot_id,
      lotCode: m.material_lots.code,
      materialName: m.material_lots.material_name,
      quantity: Number(m.quantity),
      performedAt: m.performed_at.toISOString(),
    }));

    const issuedMetersTotal = issues.reduce((sum, i) => sum + i.quantity, 0);

    const cuttingJobs = order.cutting_jobs.map((cj) => ({
      id: cj.id,
      code: cj.code,
      performedAt: cj.performed_at.toISOString(),
      garmentsCount: cj.garments.length,
    }));

    const garmentsList = await db.garments.findMany({
      where: { production_order_id: order.id },
      include: {
        rfid_tag_bindings: {
          where: { unbound_at: null },
        },
      },
      orderBy: { created_at: "asc" },
    });

    const garments: GarmentDTO[] = garmentsList.map((g) => ({
      id: g.id,
      code: g.code,
      publicId: g.public_id,
      cuttingJobId: g.cutting_job_id,
      productionOrderId: g.production_order_id,
      productionOrderCode: order.code,
      productName: order.product_spec_versions.product_name,
      sizeLabel: g.size_label,
      stage: g.stage,
      qualityDisposition: g.quality_disposition,
      createdAt: g.created_at.toISOString(),
      revision: g.revision,
      activeTagUid:
        (g.rfid_tag_bindings as any)?.[0]?.tag_uid ??
        (g.rfid_tag_bindings as any)?.tag_uid ??
        null,
    }));

    return {
      id: order.id,
      code: order.code,
      workflowVersionId: order.workflow_version_id,
      productSpecVersionId: order.product_spec_version_id,
      productName: order.product_spec_versions.product_name,
      styleCode: order.product_spec_versions.style_code,
      plannedQuantity: order.planned_quantity,
      status: order.status,
      plannedFor: order.planned_for ? order.planned_for.toISOString() : null,
      createdBy: order.created_by,
      createdByName:
        order.staff_users_production_orders_created_byTostaff_users?.display_name ?? null,
      createdAt: order.created_at.toISOString(),
      approvedBy: order.approved_by,
      approvedByName:
        order.staff_users_production_orders_approved_byTostaff_users?.display_name ?? null,
      approvedAt: order.approved_at ? order.approved_at.toISOString() : null,
      revision: order.revision,
      spec,
      issuedMetersTotal,
      issues,
      cuttingJobs,
      garments,
    };
  }, tx);
}

export async function createProductionOrder(
  input: PlanOrderInput,
  actor?: unknown,
  tx?: PrismaTransactionClient,
): Promise<{ orderId: string; orderCode: string }> {
  const actorRef = toActorRef(actor);
  if (input.qty <= 0) {
    throw ApiError.badRequest("Planned quantity must be greater than zero.", undefined, "WT_ERR_INVALID_QUANTITY");
  }

  return runInTransaction(async (db) => {
    let staffUserId = actorRef.id;
    const existingStaff = await db.staff_users.findUnique({
      where: { id: staffUserId },
    });
    if (!existingStaff) {
      const fallback = await db.staff_users.findFirst({
        where: { suspended_at: null },
      });
      if (fallback) {
        staffUserId = fallback.id;
      } else {
        const createdStaff = await db.staff_users.create({
          data: {
            id: staffUserId,
            username: actorRef.username || "planning.manager",
            display_name: "Production Planner",
            activated_at: new Date(),
          },
        });
        staffUserId = createdStaff.id;
      }
    }

    let spec = await db.product_spec_versions.findFirst({
      where: { style_code: input.styleCode },
      orderBy: { version: "desc" },
    });
    if (!spec) {
      spec = await db.product_spec_versions.create({
        data: {
          style_code: input.styleCode,
          version: 1,
          product_name: input.product || `Product ${input.styleCode}`,
          specifications: {
            category: "shirt",
            standardConsumptionMeters: 2.0,
            sizeVariants: ["S", "M", "L", "XL"],
            active: true,
          },
          approved_by: staffUserId,
          approved_at: new Date(),
        },
      });
    }

    const workflowVersionId =
      input.workflowVersionId ||
      (await getOrCreateDefaultWorkflow(db, staffUserId));

    const count = await db.production_orders.count();
    const orderCode = `ORDER-${String(count + 1).padStart(3, "0")}`;

    const order = await db.production_orders.create({
      data: {
        code: orderCode,
        workflow_version_id: workflowVersionId,
        product_spec_version_id: spec.id,
        planned_quantity: input.qty,
        status: "draft",
        planned_for: input.dueDate ? new Date(input.dueDate) : null,
        created_by: staffUserId,
        created_at: new Date(),
        revision: 0,
      },
    });

    return {
      orderId: order.id,
      orderCode: order.code,
    };
  }, tx);
}

export async function approveProductionOrder(
  orderId: string,
  actor?: unknown,
  tx?: PrismaTransactionClient,
): Promise<{ orderId: string; status: OrderStatus; approvedAt: string }> {
  const actorRef = toActorRef(actor);
  const normRole = actorRef.role.toLowerCase();
  const isManagerOrAdmin =
    normRole === "manager" ||
    normRole === "m" ||
    normRole === "admin" ||
    normRole === "a";

  if (!isManagerOrAdmin) {
    throw ApiError.forbidden(
      "Only managers or administrators can approve production orders.",
      { role: actorRef.role },
      "WT_ERR_FORBIDDEN",
    );
  }

  return runInTransaction(async (db) => {
    const order = await db.production_orders.findFirst({
      where: idOrCodeWhere(orderId),
    });

    if (!order) {
      throw ApiError.notFound(`Production order '${orderId}' not found.`, undefined, "WT_ERR_NOT_FOUND");
    }

    if (order.status !== "draft") {
      throw ApiError.badRequest(
        `Production order '${order.code}' is already '${order.status}'. Only draft orders can be approved.`,
        { currentStatus: order.status },
        "WT_ERR_ORDER_ALREADY_APPROVED",
      );
    }

    let staffUserId = actorRef.id;
    const existingStaff = await db.staff_users.findUnique({
      where: { id: staffUserId },
    });
    if (!existingStaff) {
      const fallback = await db.staff_users.findFirst({
        where: { suspended_at: null },
      });
      staffUserId = fallback ? fallback.id : order.created_by;
    }

    const approvedAt = new Date();
    const updated = await db.production_orders.update({
      where: { id: order.id },
      data: {
        status: "approved",
        approved_by: staffUserId,
        approved_at: approvedAt,
        revision: { increment: 1 },
      },
    });

    await db.audit_events.create({
      data: {
        actor_staff_id: staffUserId,
        department_code: "cutting",
        action_code: "production_order_approved",
        target_type: "production_order",
        target_reference: order.code,
        details: {
          orderId: order.id,
          orderCode: order.code,
          plannedQuantity: order.planned_quantity,
        },
      },
    });

    return {
      orderId: updated.id,
      status: updated.status,
      approvedAt: approvedAt.toISOString(),
    };
  }, tx);
}

// ---------------------------------------------------------------- Cutting Table Source Lock

export async function confirmCuttingSource(
  input: ConfirmCuttingSourceInput,
  actor?: unknown,
  tx?: PrismaTransactionClient,
): Promise<ConfirmCuttingSourceResult> {
  const actorRef = toActorRef(actor);
  if (input.consumedQty <= 0) {
    throw ApiError.badRequest("Consumed quantity must be greater than zero.", undefined, "WT_ERR_INVALID_QUANTITY");
  }

  return runInTransaction(async (db) => {
    const order = await db.production_orders.findFirst({
      where: idOrCodeWhere(input.orderId),
    });
    if (!order) {
      throw ApiError.notFound(`Production order '${input.orderId}' not found.`, undefined, "WT_ERR_NOT_FOUND");
    }

    const issue = await db.material_stock_movements.findUnique({
      where: { id: input.issueId },
      include: {
        material_lots: {
          include: {
            rfid_tag_bindings: {
              where: { unbound_at: null },
            },
          },
        },
      },
    });

    if (!issue || issue.kind !== "issued") {
      throw ApiError.notFound(
        `Material issue '${input.issueId}' not found or not an issued movement.`,
        undefined,
        "WT_ERR_NOT_FOUND",
      );
    }

    if (input.tagUid) {
      const normalizedUid = normalizeTagUid(input.tagUid);
      const lotUid = issue.material_lots.rfid_tag_bindings?.tag_uid;
      if (!lotUid || lotUid !== normalizedUid) {
        throw ApiError.badRequest(
          `Scanned card UID '${normalizedUid}' does not match issued bundle card for lot '${issue.material_lots.code}'. Expected UID '${lotUid || "unassigned"}'.`,
          { scannedUid: normalizedUid, expectedLotUid: lotUid },
          "WT_ERR_BUSINESS_RULE",
        );
      }
    }

    let staffUserId = actorRef.id;
    const existingStaff = await db.staff_users.findUnique({
      where: { id: staffUserId },
    });
    if (!existingStaff) {
      const fallback = await db.staff_users.findFirst({
        where: { suspended_at: null },
      });
      staffUserId = fallback ? fallback.id : issue.performed_by;
    }

    let cuttingJob = await db.cutting_jobs.findFirst({
      where: { production_order_id: order.id },
    });
    if (!cuttingJob) {
      const jobCount = await db.cutting_jobs.count();
      const jobCode = `CUT-${order.code}-${String(jobCount + 1).padStart(2, "0")}`;
      cuttingJob = await db.cutting_jobs.create({
        data: {
          code: jobCode,
          production_order_id: order.id,
          performed_by: staffUserId,
          performed_at: new Date(),
        },
      });
    }

    let cuttingInput = await db.cutting_inputs.findUnique({
      where: {
        cutting_job_id_issue_id: {
          cutting_job_id: cuttingJob.id,
          issue_id: issue.id,
        },
      },
    });

    if (!cuttingInput) {
      cuttingInput = await db.cutting_inputs.create({
        data: {
          cutting_job_id: cuttingJob.id,
          production_order_id: order.id,
          material_lot_id: issue.material_lot_id,
          issue_id: issue.id,
          issue_kind: "issued",
          consumed_quantity: new Prisma.Decimal(input.consumedQty),
          waste_quantity: new Prisma.Decimal(input.wasteQty || 0),
        },
      });
    }

    return {
      cuttingJobId: cuttingJob.id,
      cuttingInputId: cuttingInput.id,
      orderId: order.id,
      issueId: issue.id,
      lotId: issue.material_lot_id,
    };
  }, tx);
}

// ---------------------------------------------------------------- Garment Creation & Tag Enrollment

export async function bindGarmentTag(
  input: BindGarmentTagInput,
  actor?: unknown,
  tx?: PrismaTransactionClient,
): Promise<BindGarmentTagResult> {
  const actorRef = toActorRef(actor);
  if (!input.tagUid || !input.tagUid.trim()) {
    throw ApiError.badRequest("Tag UID is required for garment card enrollment.", undefined, "WT_ERR_INVALID_UID");
  }

  const normalizedUid = normalizeTagUid(input.tagUid);
  if (!/^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/.test(normalizedUid)) {
    throw ApiError.badRequest(
      `Invalid tag UID format '${normalizedUid}'. Expected 8, 14, or 20 uppercase hex characters.`,
      { tagUid: normalizedUid },
      "WT_ERR_INVALID_UID",
    );
  }

  return runInTransaction(async (db) => {
    const order = await db.production_orders.findFirst({
      where: idOrCodeWhere(input.orderId),
      include: {
        product_spec_versions: true,
      },
    });
    if (!order) {
      throw ApiError.notFound(`Production order '${input.orderId}' not found.`, undefined, "WT_ERR_NOT_FOUND");
    }

    const existingActiveBinding = await db.rfid_tag_bindings.findFirst({
      where: {
        tag_uid: normalizedUid,
        unbound_at: null,
      },
    });
    if (existingActiveBinding) {
      throw ApiError.conflict(
        `RFID card UID '${normalizedUid}' is already actively bound to another subject. Active cards cannot be reused without unbinding.`,
        { tagUid: normalizedUid, existingBindingId: existingActiveBinding.id },
        "WT_ERR_ACTIVE_CARD",
      );
    }

    let cuttingJobId = input.cuttingJobId;
    let cuttingInputId = input.cuttingSourceSelectionId;

    if (!cuttingJobId) {
      const cuttingJob = await db.cutting_jobs.findFirst({
        where: { production_order_id: order.id },
        orderBy: { performed_at: "desc" },
      });
      if (!cuttingJob) {
        throw ApiError.badRequest(
          `No active cutting job found for order '${order.code}'. Please lock cutting source first.`,
          undefined,
          "WT_ERR_NO_CUTTING_JOB",
        );
      }
      cuttingJobId = cuttingJob.id;
    }

    let cuttingInput = await db.cutting_inputs.findFirst({
      where: {
        cutting_job_id: cuttingJobId,
        ...(cuttingInputId ? { id: cuttingInputId } : {}),
      },
    });

    if (!cuttingInput) {
      throw ApiError.badRequest(
        `No cutting input available for cutting job '${cuttingJobId}'.`,
        undefined,
        "WT_ERR_NO_CUTTING_INPUT",
      );
    }

    const totalConsumed = Number(cuttingInput.consumed_quantity);
    const plannedQty = order.planned_quantity || 1;
    const defaultAttributed = Number((totalConsumed / plannedQty).toFixed(3));
    const attributedFabric = input.fabricUsed || defaultAttributed;

    const styleCode = order.product_spec_versions.style_code;
    const category = styleCode.includes("JK")
      ? "JACKET"
      : styleCode.includes("TR")
        ? "TROUSER"
        : "SHIRT";

    const garmentCount = await db.garments.count();
    const garmentCode = `${category}-${String(garmentCount + 1).padStart(3, "0")}`;
    const randomHex = Math.random().toString(16).substring(2, 8);
    const publicId = `wt-${garmentCode.toLowerCase()}-${randomHex}`;

    let staffUserId = actorRef.id;
    const existingStaff = await db.staff_users.findUnique({
      where: { id: staffUserId },
    });
    if (!existingStaff) {
      const fallback = await db.staff_users.findFirst({
        where: { suspended_at: null },
      });
      staffUserId = fallback ? fallback.id : order.created_by;
    }

    const garment = await db.garments.create({
      data: {
        code: garmentCode,
        public_id: publicId,
        cutting_job_id: cuttingJobId,
        production_order_id: order.id,
        size_label: input.size,
        stage: "cut",
        quality_disposition: "awaiting_inspection",
        created_at: new Date(),
        revision: 0,
      },
    });

    await db.garment_material_inputs.create({
      data: {
        garment_id: garment.id,
        cutting_job_id: cuttingJobId,
        cutting_input_id: cuttingInput.id,
        attributed_quantity: new Prisma.Decimal(attributedFabric),
      },
    });

    const bindingData: any = {
      garment_id: garment.id,
      tag_identifier: normalizedUid,
      tag_technology: "ISO_14443_A",
      bound_by: staffUserId,
      bound_at: new Date(),
    };
    if (!("$executeRaw" in (db as any))) {
      bindingData.tag_uid = normalizedUid;
    }
    await db.rfid_tag_bindings.create({
      data: bindingData,
    });

    await db.audit_events.create({
      data: {
        actor_staff_id: staffUserId,
        department_code: "cutting",
        action_code: "garment_card_enrolled",
        target_type: "garment",
        target_reference: garment.code,
        details: {
          garmentId: garment.id,
          code: garment.code,
          publicId: garment.public_id,
          tagUid: normalizedUid,
          size: input.size,
          attributedFabric,
        },
      },
    });

    return {
      garmentId: garment.id,
      garmentCode: garment.code,
      publicId: garment.public_id,
      tagUid: normalizedUid,
      orderId: order.id,
      size: input.size,
      stage: garment.stage,
      qualityDisposition: garment.quality_disposition,
      attributedFabric,
    };
  }, tx);
}

// ---------------------------------------------------------------- Card Replacement (Damaged / Lost Card)

export async function replaceGarmentCard(
  input: ReplaceGarmentCardInput,
  actor?: unknown,
  tx?: PrismaTransactionClient,
): Promise<ReplaceGarmentCardResult> {
  const actorRef = toActorRef(actor);
  if (!input.newUid || !input.newUid.trim()) {
    throw ApiError.badRequest("New tag UID is required.", undefined, "WT_ERR_INVALID_UID");
  }

  const normalizedUid = normalizeTagUid(input.newUid);
  if (!/^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/.test(normalizedUid)) {
    throw ApiError.badRequest(
      `Invalid tag UID format '${normalizedUid}'. Expected 8, 14, or 20 uppercase hex characters.`,
      { tagUid: normalizedUid },
      "WT_ERR_INVALID_UID",
    );
  }

  return runInTransaction(async (db) => {
    const garment = await db.garments.findFirst({
      where: idOrCodeWhere(input.garmentId),
    });
    if (!garment) {
      throw ApiError.notFound(`Garment '${input.garmentId}' not found.`, undefined, "WT_ERR_NOT_FOUND");
    }

    const existingBinding = await db.rfid_tag_bindings.findFirst({
      where: {
        tag_uid: normalizedUid,
        unbound_at: null,
      },
    });
    if (existingBinding) {
      throw ApiError.conflict(
        `RFID card UID '${normalizedUid}' is already actively bound to another subject.`,
        { tagUid: normalizedUid },
        "WT_ERR_ACTIVE_CARD",
      );
    }

    let staffUserId = actorRef.id;
    const existingStaff = await db.staff_users.findUnique({
      where: { id: staffUserId },
    });
    if (!existingStaff) {
      const fallback = await db.staff_users.findFirst({
        where: { suspended_at: null },
      });
      staffUserId = fallback ? fallback.id : "00000000-0000-0000-0000-000000000000";
    }

    const oldBinding = await db.rfid_tag_bindings.findFirst({
      where: {
        garment_id: garment.id,
        unbound_at: null,
      },
    });

    let oldUid: string | null = null;
    let unboundBindingId: string | null = null;

    if (oldBinding) {
      oldUid = oldBinding.tag_uid;
      unboundBindingId = oldBinding.id;
      await db.rfid_tag_bindings.update({
        where: { id: oldBinding.id },
        data: {
          unbound_at: new Date(),
          unbound_by: staffUserId,
        },
      });
    }

    const newBindingData: any = {
      garment_id: garment.id,
      tag_identifier: normalizedUid,
      tag_technology: "ISO_14443_A",
      bound_by: staffUserId,
      bound_at: new Date(),
    };
    if (!("$executeRaw" in (db as any))) {
      newBindingData.tag_uid = normalizedUid;
    }
    const newBinding = await db.rfid_tag_bindings.create({
      data: newBindingData,
    });

    await db.audit_events.create({
      data: {
        actor_staff_id: staffUserId,
        department_code: "cutting",
        action_code: "garment_card_replaced",
        target_type: "garment",
        target_reference: garment.code,
        details: {
          garmentId: garment.id,
          garmentCode: garment.code,
          publicId: garment.public_id,
          oldUid,
          newUid: normalizedUid,
          reason: input.reason || "RFID card replacement",
        },
      },
    });

    return {
      garmentId: garment.id,
      garmentCode: garment.code,
      publicId: garment.public_id,
      oldUid,
      newUid: normalizedUid,
      unboundBindingId,
      newBindingId: newBinding.id,
    };
  }, tx);
}

// ---------------------------------------------------------------- Routine Assembly Scans (Stitching & Finishing)

async function recordRfidScanLog(
  db: PrismaTransactionClient,
  tagUid: string,
  stationCode: string,
  outcome: "accepted" | "rejected",
  outcomeCode: string,
  outcomeMessage: string,
  extra?: { garmentId?: string | null; materialLotId?: string | null; tagBindingId?: string | null },
) {
  try {
    const deviceId = "00000000-0000-0000-0000-000000000000";
    const scanId = `routine-${crypto.randomUUID()}`;
    const bootId = `boot-routine`;
    const fingerprint = crypto.createHash("sha256").update(scanId).digest();
    await (db as any).rfid_scans.create({
      data: {
        device_id: deviceId,
        scan_id: scanId,
        boot_id: bootId,
        sequence: BigInt(Date.now()),
        reader_index: stationCode === "stitching" ? 6 : 7,
        reported_mapping_version: 1,
        tag_uid: tagUid,
        station_code: stationCode,
        tag_binding_id: extra?.tagBindingId ?? null,
        garment_id: extra?.garmentId ?? null,
        material_lot_id: extra?.materialLotId ?? null,
        request_sha256: new Uint8Array(fingerprint),
        received_at: new Date(),
        outcome,
        outcome_code: outcomeCode,
        outcome_message: outcomeMessage,
      },
    });
  } catch {
    // Non-blocking scan log recording
  }
}

export async function executeRoutineScan(
  input: RoutineScanInput,
  actor?: unknown,
  txClient?: PrismaTransactionClient,
): Promise<ScanOutcome> {
  const normalizedUid = normalizeTagUid(input.tagUid);
  const now = new Date();
  const actorRef = toActorRef(actor);

  return runInTransaction(async (db) => {
    // 1. Identify active binding
    const binding = await db.rfid_tag_bindings.findFirst({
      where: {
        OR: [
          { tag_uid: normalizedUid, unbound_at: null },
          { tag_identifier: normalizedUid, unbound_at: null },
        ],
      },
      include: {
        garments: {
          include: {
            cutting_jobs: {
              include: {
                production_orders: {
                  include: { product_spec_versions: true },
                },
              },
            },
          },
        },
      },
    });

    if (!binding) {
      await recordRfidScanLog(
        db,
        normalizedUid,
        input.stationCode,
        "rejected",
        "WT_ERR_UNKNOWN_CARD",
        `UID ${normalizedUid} is not recognised.`,
      );

      return {
        uid: normalizedUid,
        resolution: "rejected_unknown_card",
        rejectReason: `UID ${normalizedUid} is not recognised.`,
        at: now.toISOString(),
      };
    }

    if (!binding.garments || !binding.garment_id) {
      await recordRfidScanLog(
        db,
        normalizedUid,
        input.stationCode,
        "rejected",
        "WT_ERR_WRONG_SUBJECT_TYPE",
        `Card '${normalizedUid}' is bound to a fabric bundle, not a garment. Routine ${input.stationCode} station requires a garment card.`,
        { materialLotId: binding.material_lot_id, tagBindingId: binding.id },
      );

      return {
        uid: normalizedUid,
        resolution: "rejected_wrong_subject_type",
        rejectReason: `Card '${normalizedUid}' is bound to a fabric bundle, not a garment. Routine ${input.stationCode} station requires a garment card.`,
        at: now.toISOString(),
      };
    }

    const garment = binding.garments;
    const productName =
      garment.cutting_jobs?.production_orders?.product_spec_versions?.product_name || "Garment";

    // 2. Active quality hold check
    const activeHold = await db.garment_holds.findFirst({
      where: { garment_id: garment.id, released_at: null },
    });
    if (garment.quality_disposition === "held" || activeHold) {
      const reason = activeHold?.reason || "Active quality hold is in effect";
      const rejectReason = `Garment '${garment.code}' has an active quality hold (${reason}). Routine assembly progression is blocked until cleared by QC.`;

      await recordRfidScanLog(
        db,
        normalizedUid,
        input.stationCode,
        "rejected",
        "WT_ERR_ACTIVE_HOLD",
        rejectReason,
        { garmentId: garment.id, tagBindingId: binding.id },
      );

      return {
        uid: normalizedUid,
        resolution: "rejected_business_rule",
        garmentCode: garment.code,
        subjectId: garment.id,
        productName,
        rejectReason,
        at: now.toISOString(),
      };
    }

    // 3. Duplicate scan check
    const existingTrace = await db.trace_events.findFirst({
      where: {
        garment_id: garment.id,
        event_type: `${input.stationCode}_completed`,
      },
    });
    if (
      (input.stationCode === "stitching" &&
        (garment.stage === "stitched" || garment.stage === "finished")) ||
      existingTrace
    ) {
      const rejectReason = `Duplicate scan: Garment '${garment.code}' has already completed ${input.stationCode} and advanced to Finishing.`;

      await recordRfidScanLog(
        db,
        normalizedUid,
        input.stationCode,
        "rejected",
        "WT_ERR_DUPLICATE_SCAN",
        rejectReason,
        { garmentId: garment.id, tagBindingId: binding.id },
      );

      return {
        uid: normalizedUid,
        resolution: "rejected_duplicate",
        garmentCode: garment.code,
        subjectId: garment.id,
        productName,
        rejectReason,
        at: now.toISOString(),
      };
    }

    // 4. Current stage / cutting completion check
    if (input.stationCode === "stitching") {
      if (garment.stage !== "cut") {
        const rejectReason = `Garment '${garment.code}' is at stage '${garment.stage}'. Expected stage 'cut' (cutting completed) for stitching station.`;

        await recordRfidScanLog(
          db,
          normalizedUid,
          input.stationCode,
          "rejected",
          "WT_ERR_WRONG_STAGE",
          rejectReason,
          { garmentId: garment.id, tagBindingId: binding.id },
        );

        return {
          uid: normalizedUid,
          resolution: "rejected_wrong_stage",
          garmentCode: garment.code,
          subjectId: garment.id,
          productName,
          rejectReason,
          at: now.toISOString(),
        };
      }
    } else if (input.stationCode === "finishing") {
      if (garment.stage !== "stitched") {
        const rejectReason = `Garment '${garment.code}' is at stage '${garment.stage}'. Expected stage 'stitched' for finishing station.`;

        await recordRfidScanLog(
          db,
          normalizedUid,
          input.stationCode,
          "rejected",
          "WT_ERR_WRONG_STAGE",
          rejectReason,
          { garmentId: garment.id, tagBindingId: binding.id },
        );

        return {
          uid: normalizedUid,
          resolution: "rejected_wrong_stage",
          garmentCode: garment.code,
          subjectId: garment.id,
          productName,
          rejectReason,
          at: now.toISOString(),
        };
      }
    }

    // 5. Valid: Advance stage to next stage
    const nextStage: GarmentStage = input.stationCode === "stitching" ? "stitched" : "finished";
    const nextExpectedStation = input.stationCode === "stitching" ? "finishing" : "final_qc";

    let staffUserId = actorRef.id;
    let staffName = "Sam Stitching";
    const staff = await db.staff_users.findUnique({ where: { id: staffUserId } });
    if (staff) {
      staffName = staff.display_name;
    } else {
      const fallback = await db.staff_users.findFirst({
        where: { suspended_at: null },
      });
      if (fallback) {
        staffUserId = fallback.id;
        staffName = fallback.display_name;
      }
    }

    const updatedGarment = await db.garments.update({
      where: { id: garment.id },
      data: {
        stage: nextStage,
        quality_disposition: "awaiting_inspection",
        revision: { increment: 1 },
      },
    });

    // Record trace event (public journey & manufacturing history)
    const traceEvent = await db.trace_events.create({
      data: {
        event_type: `${input.stationCode}_completed`,
        garment_id: garment.id,
        subject_revision: updatedGarment.revision,
        actor_id: staffUserId,
        details: {
          garmentCode: garment.code,
          tagUid: normalizedUid,
          station: input.stationCode,
          operator: staffName,
          source: input.isHardware ? "rfid_reader_hw" : "workstation_manual_entry",
          timestamp: now.toISOString(),
        },
      },
    });

    try {
      await createInternalCommitment(
        {
          traceEventId: traceEvent.id,
          payload: {
            version: 1,
            eventType: `${input.stationCode}_completed`,
            garmentId: garment.id,
            garmentCode: garment.code,
            station: input.stationCode,
            timestamp: now.toISOString(),
          },
        },
        db,
      );
    } catch {
      // ledger fallback
    }

    // Record audit event
    await db.audit_events.create({
      data: {
        actor_staff_id: staffUserId,
        department_code: input.stationCode,
        action_code: `routine_${input.stationCode}_scan`,
        target_type: "garment",
        target_reference: garment.code,
        details: {
          garmentId: garment.id,
          code: garment.code,
          fromStage: garment.stage,
          toStage: nextStage,
          station: input.stationCode,
          operator: staffName,
          isManual: !input.isHardware,
          timestamp: now.toISOString(),
        },
      },
    });

    // Record accepted scan
    await recordRfidScanLog(
      db,
      normalizedUid,
      input.stationCode,
      "accepted",
      `${input.stationCode}_completed`,
      `Garment ${garment.code} ${input.stationCode} completed. Ready for ${nextExpectedStation}.`,
      { garmentId: garment.id, tagBindingId: binding.id },
    );

    return {
      uid: normalizedUid,
      resolution: "accepted",
      subjectId: garment.id,
      garmentCode: garment.code,
      productName,
      at: now.toISOString(),
    };
  }, txClient);
}

export async function routineProductionScan(
  input: RoutineScanInput,
  actor?: unknown,
  tx?: PrismaTransactionClient,
): Promise<RoutineScanResult> {
  const outcome = await executeRoutineScan(input, actor, tx);
  if (outcome.resolution !== "accepted") {
    if (outcome.resolution === "rejected_unknown_card") {
      throw ApiError.notFound(outcome.rejectReason || "RFID card not recognized", undefined, "WT_ERR_UNKNOWN_CARD");
    }
    if (outcome.resolution === "rejected_duplicate") {
      throw ApiError.conflict(outcome.rejectReason || "Duplicate scan", undefined, "WT_ERR_DUPLICATE_SCAN");
    }
    if (outcome.resolution === "rejected_business_rule") {
      throw ApiError.badRequest(outcome.rejectReason || "Quality hold in effect", undefined, "WT_ERR_ACTIVE_HOLD");
    }
    throw ApiError.badRequest(outcome.rejectReason || "Wrong stage", undefined, "WT_ERR_WRONG_STAGE");
  }

  const nextStage: GarmentStage = input.stationCode === "stitching" ? "stitched" : "finished";
  const nextExpectedStation = input.stationCode === "stitching" ? "finishing" : "final_qc";

  return {
    accepted: true,
    garmentId: outcome.subjectId || "",
    garmentCode: outcome.garmentCode || "",
    productName: outcome.productName || "",
    stage: nextStage,
    nextExpectedStation,
    qualityDisposition: "awaiting_inspection",
    uid: outcome.uid,
    resolution: "accepted",
    at: outcome.at,
  };
}

// ---------------------------------------------------------------- Garments Directory & Detail

export async function listGarments(
  actor?: unknown,
  filters?: { stage?: string | undefined; orderId?: string | undefined },
  tx?: PrismaTransactionClient,
): Promise<GarmentDTO[]> {
  return runInTransaction(async (db) => {
    const garments = await db.garments.findMany({
      where: {
        ...(filters?.stage ? { stage: filters.stage as any } : {}),
        ...(filters?.orderId ? { production_order_id: filters.orderId } : {}),
      },
      include: {
        cutting_jobs: {
          include: {
            production_orders: {
              include: { product_spec_versions: true },
            },
          },
        },
        rfid_tag_bindings: {
          where: { unbound_at: null },
        },
        garment_holds: {
          where: { released_at: null },
        },
      },
      orderBy: { created_at: "desc" },
    });

    return garments.map((g) => ({
      id: g.id,
      code: g.code,
      publicId: g.public_id,
      cuttingJobId: g.cutting_job_id,
      productionOrderId: g.production_order_id,
      productionOrderCode: g.cutting_jobs?.production_orders?.code,
      productName:
        g.cutting_jobs?.production_orders?.product_spec_versions?.product_name,
      sizeLabel: g.size_label,
      stage: g.stage,
      qualityDisposition: g.quality_disposition,
      createdAt: g.created_at.toISOString(),
      revision: g.revision,
      activeTagUid:
        (g.rfid_tag_bindings as any)?.[0]?.tag_uid ??
        (g.rfid_tag_bindings as any)?.tag_uid ??
        null,
      holdReason: (g as any).garment_holds?.[0]?.reason ?? null,
    }));
  }, tx);
}

export async function getGarmentDetail(
  garmentIdOrCodeOrPublicId: string,
  actor?: unknown,
  tx?: PrismaTransactionClient,
): Promise<GarmentDetailDTO | null> {
  return runInTransaction(async (db) => {
    const garment = await db.garments.findFirst({
      where: {
        OR: [
          { id: garmentIdOrCodeOrPublicId },
          { code: garmentIdOrCodeOrPublicId },
          { public_id: garmentIdOrCodeOrPublicId },
        ],
      },
      include: {
        cutting_jobs: {
          include: {
            production_orders: {
              include: { product_spec_versions: true },
            },
          },
        },
        garment_material_inputs: {
          include: {
            cutting_inputs: {
              include: {
                material_stock_movements: {
                  include: { material_lots: true },
                },
              },
            },
          },
        },
      },
    });

    if (!garment) return null;

    const allBindings = await db.rfid_tag_bindings.findMany({
      where: { garment_id: garment.id },
      orderBy: { bound_at: "desc" },
    });

    const activeBinding = allBindings.find((b) => b.unbound_at === null);
    const materialInput = garment.garment_material_inputs[0];
    const lot = materialInput?.cutting_inputs?.material_stock_movements?.material_lots;

    const tagBindingsHistory = allBindings.map((b) => ({
      id: b.id,
      tagUid: b.tag_uid ?? "",
      boundAt: b.bound_at.toISOString(),
      unboundAt: b.unbound_at ? b.unbound_at.toISOString() : null,
      active: b.unbound_at === null,
    }));

    return {
      id: garment.id,
      code: garment.code,
      publicId: garment.public_id,
      cuttingJobId: garment.cutting_job_id,
      productionOrderId: garment.production_order_id,
      productionOrderCode: garment.cutting_jobs?.production_orders?.code,
      productName:
        garment.cutting_jobs?.production_orders?.product_spec_versions
          ?.product_name,
      sizeLabel: garment.size_label,
      stage: garment.stage,
      qualityDisposition: garment.quality_disposition,
      createdAt: garment.created_at.toISOString(),
      revision: garment.revision,
      activeTagUid: activeBinding?.tag_uid ?? null,
      cuttingJobCode: garment.cutting_jobs.code,
      materialLotId: lot?.id,
      materialLotCode: lot?.code,
      materialName: lot?.material_name,
      attributedFabricMeters: materialInput?.attributed_quantity
        ? Number(materialInput.attributed_quantity)
        : undefined,
      tagBindingsHistory,
    };
  }, tx);
}

// ---------------------------------------------------------------- Public Product Material Data (For Member 4)

export async function getPublicProductMaterialData(
  publicId: string,
  tx?: PrismaTransactionClient,
) {
  return runInTransaction(async (db) => {
    const garment = await db.garments.findUnique({
      where: { public_id: publicId },
      include: {
        cutting_jobs: {
          include: {
            production_orders: {
              include: { product_spec_versions: true },
            },
          },
        },
        garment_material_inputs: {
          include: {
            cutting_inputs: {
              include: {
                material_stock_movements: {
                  include: {
                    material_lots: {
                      include: { suppliers: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!garment) return null;

    const spec =
      garment.cutting_jobs.production_orders.product_spec_versions;
    const materialInput = garment.garment_material_inputs[0];
    const lot = materialInput?.cutting_inputs?.material_stock_movements?.material_lots;
    const supplier = lot?.suppliers;

    return {
      publicId: garment.public_id,
      garmentCode: garment.code,
      productName: spec.product_name,
      styleCode: spec.style_code,
      size: garment.size_label,
      materialName: lot?.material_name,
      supplierName: supplier?.name,
      attributedQuantity: materialInput?.attributed_quantity
        ? Number(materialInput.attributed_quantity)
        : undefined,
      stage: garment.stage,
      qualityDisposition: garment.quality_disposition,
    };
  }, tx);
}
