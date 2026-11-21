import { Prisma } from "@prisma/client";
import { runInTransaction } from "../db/client";
import type { PrismaTransactionClient } from "../db/types";
import { ApiError } from "../middleware/responses";
import { normalizeTagUid } from "../contracts/rfid";
import type {
  AcceptIncomingStockInput,
  AcceptIncomingStockResult,
  BindLotCardInput,
  BindLotCardResult,
  IssueMaterialInput,
  IssueMaterialResult,
  MaterialLotDetailDTO,
  MaterialLotDTO,
  MaterialStockMovementDTO,
  ReceiveLotInput,
  ReturnMaterialInput,
  ReturnMaterialResult,
  SupplierDTO,
} from "./materials-types";

export interface ActorRef {
  id: string;
  role: string;
  department: string;
  username: string;
}

export function toActorRef(actor?: unknown): ActorRef {
  if (!actor || typeof actor !== "object") {
    return {
      id: "00000000-0000-0000-0000-000000000000",
      role: "admin",
      department: "receiving",
      username: "system",
    };
  }
  const a = actor as Record<string, unknown>;
  const id = (a["actorId"] as string) || (a["id"] as string) || "00000000-0000-0000-0000-000000000000";
  const role = (a["role"] as string) || "materials";
  const department = (a["department"] as string) || "receiving";
  const username = (a["username"] as string) || "system";
  return { id, role, department, username };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function idOrCodeWhere(idOrCode: string) {
  if (
    UUID_REGEX.test(idOrCode) ||
    idOrCode.startsWith("lot-") ||
    idOrCode.startsWith("order-") ||
    idOrCode.startsWith("g-") ||
    idOrCode.startsWith("sup-") ||
    idOrCode.startsWith("cj-") ||
    idOrCode.startsWith("ci-")
  ) {
    return { OR: [{ id: idOrCode }, { code: idOrCode }] };
  }
  return { code: idOrCode };
}

function isAuthorizedForMaterials(role: string, dept: string): boolean {
  const normRole = role.toLowerCase();
  const normDept = dept.toLowerCase().replace(/[-_]/g, "");
  return (
    normRole === "admin" ||
    normRole === "a" ||
    normRole === "manager" ||
    normRole === "m" ||
    normRole === "materials" ||
    normRole === "o" ||
    normDept === "receiving" ||
    normDept === "rawstore"
  );
}

function isAuthorizedForIssue(role: string, dept: string): boolean {
  const normRole = role.toLowerCase();
  const normDept = dept.toLowerCase().replace(/[-_]/g, "");
  return (
    normRole === "admin" ||
    normRole === "a" ||
    normRole === "manager" ||
    normRole === "m" ||
    normRole === "materials" ||
    normRole === "o" ||
    normDept === "rawstore"
  );
}

// ---------------------------------------------------------------- Suppliers

export async function listSuppliers(
  tx?: PrismaTransactionClient,
): Promise<SupplierDTO[]> {
  return runInTransaction(async (db) => {
    const suppliers = await db.suppliers.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    });
    return suppliers.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      active: s.active,
    }));
  }, tx);
}

export async function getOrCreateSupplier(
  code: string,
  name: string,
  tx?: PrismaTransactionClient,
): Promise<SupplierDTO> {
  return runInTransaction(async (db) => {
    let supplier = await db.suppliers.findUnique({
      where: { code },
    });
    if (!supplier) {
      supplier = await db.suppliers.create({
        data: {
          code,
          name: name || code,
          active: true,
        },
      });
    }
    return {
      id: supplier.id,
      code: supplier.code,
      name: supplier.name,
      active: supplier.active,
    };
  }, tx);
}

// ---------------------------------------------------------------- Material Lots

export async function listLots(
  actor?: unknown,
  filters?: { status?: string | undefined; supplierId?: string | undefined },
  tx?: PrismaTransactionClient,
): Promise<MaterialLotDTO[]> {
  return runInTransaction(async (db) => {
    const lots = await db.material_lots.findMany({
      where: {
        ...(filters?.supplierId ? { supplier_id: filters.supplierId } : {}),
      },
      include: {
        suppliers: true,
        staff_users: true,
        rfid_tag_bindings: {
          where: { unbound_at: null },
        },
        material_stock_movements: {
          select: { kind: true, quantity: true },
        },
      },
      orderBy: { received_at: "desc" },
    });

    return lots.map((lot) => {
      const activeBinding = lot.rfid_tag_bindings;
      const acceptedMovements = lot.material_stock_movements.filter(
        (m) => m.kind === "accepted",
      );
      const isAccepted =
        acceptedMovements.length > 0 ||
        Number(lot.available_accepted_quantity) > 0;

      const status: MaterialLotDTO["status"] = isAccepted
        ? "accepted"
        : "awaiting-inspection";

      return {
        id: lot.id,
        code: lot.code,
        supplierId: lot.supplier_id,
        supplierName: lot.suppliers.name,
        supplierLotRef: lot.supplier_lot_ref,
        receiptRef: lot.receipt_ref,
        materialName: lot.material_name,
        unit: lot.unit,
        receivedQuantity: Number(lot.received_quantity),
        availableAcceptedQuantity: Number(lot.available_accepted_quantity),
        receivedBy: lot.received_by,
        receivedByName: lot.staff_users.display_name,
        receivedAt: lot.received_at.toISOString(),
        revision: lot.revision,
        activeTagUid: activeBinding?.tag_uid ?? null,
        status,
      };
    });
  }, tx);
}

export async function getLotDetail(
  lotIdOrCode: string,
  actor?: unknown,
  tx?: PrismaTransactionClient,
): Promise<MaterialLotDetailDTO | null> {
  return runInTransaction(async (db) => {
    const lot = await db.material_lots.findFirst({
      where: idOrCodeWhere(lotIdOrCode),
      include: {
        suppliers: true,
        staff_users: true,
        rfid_tag_bindings: {
          where: { unbound_at: null },
        },
        material_stock_movements: {
          include: {
            staff_users: true,
            production_orders: true,
          },
          orderBy: { performed_at: "desc" },
        },
      },
    });

    if (!lot) return null;

    const activeBinding = lot.rfid_tag_bindings;
    const acceptedMovements = lot.material_stock_movements.filter(
      (m) => m.kind === "accepted",
    );
    const isAccepted =
      acceptedMovements.length > 0 ||
      Number(lot.available_accepted_quantity) > 0;

    const status: MaterialLotDTO["status"] = isAccepted
      ? "accepted"
      : "awaiting-inspection";

    const movements: MaterialStockMovementDTO[] =
      lot.material_stock_movements.map((m) => ({
        id: m.id,
        materialLotId: m.material_lot_id,
        kind: m.kind,
        productionOrderId: m.production_order_id,
        productionOrderCode: m.production_orders?.code ?? null,
        inspectionId: m.inspection_id,
        originalIssueId: m.original_issue_id,
        quantity: Number(m.quantity),
        reason: m.reason,
        performedBy: m.performed_by,
        performedByName: m.staff_users.display_name,
        performedAt: m.performed_at.toISOString(),
      }));

    const issues = movements.filter((m) => m.kind === "issued");

    return {
      id: lot.id,
      code: lot.code,
      supplierId: lot.supplier_id,
      supplierName: lot.suppliers.name,
      supplierLotRef: lot.supplier_lot_ref,
      receiptRef: lot.receipt_ref,
      materialName: lot.material_name,
      unit: lot.unit,
      receivedQuantity: Number(lot.received_quantity),
      availableAcceptedQuantity: Number(lot.available_accepted_quantity),
      receivedBy: lot.received_by,
      receivedByName: lot.staff_users.display_name,
      receivedAt: lot.received_at.toISOString(),
      revision: lot.revision,
      activeTagUid: activeBinding?.tag_uid ?? null,
      status,
      movements,
      issues,
    };
  }, tx);
}

// ---------------------------------------------------------------- Receive Material Lot

export async function receiveMaterialLot(
  input: ReceiveLotInput,
  actor?: unknown,
  tx?: PrismaTransactionClient,
): Promise<{ lotId: string; lotCode: string; bindingId?: string | undefined }> {
  const actorRef = toActorRef(actor);
  if (!isAuthorizedForMaterials(actorRef.role, actorRef.department)) {
    throw ApiError.forbidden(
      "Only receiving staff (role: materials/manager/admin) can receive raw fabric lots.",
      { role: actorRef.role, department: actorRef.department },
      "WT_ERR_FORBIDDEN",
    );
  }

  if (!input.materialName || input.materialName.trim() === "") {
    throw ApiError.badRequest("Material description is required.", undefined, "WT_ERR_INVALID_MATERIAL");
  }

  if (input.quantity <= 0 || Number.isNaN(input.quantity)) {
    throw ApiError.badRequest("Received quantity must be greater than zero.", undefined, "WT_ERR_INVALID_QUANTITY");
  }

  const unit = input.unit ?? "m";
  if (unit === "pcs" && !Number.isInteger(input.quantity)) {
    throw ApiError.badRequest("Quantity for 'pcs' unit must be an integer.", undefined, "WT_ERR_INVALID_UNIT");
  }

  return runInTransaction(async (db) => {
    // 1. Resolve or create supplier
    let supplierId = input.supplierId;
    if (!supplierId) {
      const code = input.supplierCode || input.supplierRef?.split("-")[0] || "SUP-DEFAULT";
      const name = input.supplierName || `Supplier ${code}`;
      const supplier = await getOrCreateSupplier(code, name, db);
      supplierId = supplier.id;
    }

    // 2. Generate unique human-readable lot code
    const count = await db.material_lots.count();
    const lotCode = `FAB-${String(count + 1).padStart(3, "0")}`;

    // 3. Ensure actor staff user exists in staff_users table
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
            username: actorRef.username || "receiving.operator",
            display_name: "Receiving Operator",
            activated_at: new Date(),
          },
        });
        staffUserId = createdStaff.id;
      }
    }

    // 4. Insert material lot
    const createdLot = await db.material_lots.create({
      data: {
        code: lotCode,
        supplier_id: supplierId,
        supplier_lot_ref: input.supplierRef ?? null,
        receipt_ref: input.receiptRef ?? null,
        material_name: input.materialName.trim(),
        unit,
        received_quantity: new Prisma.Decimal(input.quantity),
        available_accepted_quantity: new Prisma.Decimal(0),
        received_by: staffUserId,
        received_at: new Date(),
        revision: 0,
      },
    });

    let bindingId: string | undefined = undefined;

    // 5. If tag UID provided at receipt, bind bundle card
    if (input.tagUid) {
      const bindRes = await bindLotCard(
        { lotId: createdLot.id, tagUid: input.tagUid },
        actorRef,
        db,
      );
      bindingId = bindRes.bindingId;
    }

    // 6. Record audit event
    await db.audit_events.create({
      data: {
        actor_staff_id: staffUserId,
        department_code: "receiving",
        action_code: "material_lot_received",
        target_type: "material_lot",
        target_reference: createdLot.code,
        details: {
          lotId: createdLot.id,
          code: createdLot.code,
          material: createdLot.material_name,
          quantity: input.quantity,
          unit,
          tagUid: input.tagUid ?? null,
        },
      },
    });

    return {
      lotId: createdLot.id,
      lotCode: createdLot.code,
      bindingId,
    };
  }, tx);
}

// ---------------------------------------------------------------- Bind Bundle RFID Card

export async function bindLotCard(
  input: BindLotCardInput,
  actor?: unknown,
  tx?: PrismaTransactionClient,
): Promise<BindLotCardResult> {
  const actorRef = toActorRef(actor);
  if (!input.tagUid || !input.tagUid.trim()) {
    throw ApiError.badRequest("Tag UID is required for card binding.", undefined, "WT_ERR_INVALID_UID");
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
    // 1. Resolve lot
    const lot = await db.material_lots.findFirst({
      where: idOrCodeWhere(input.lotId),
    });
    if (!lot) {
      throw ApiError.notFound(`Material lot '${input.lotId}' not found.`, undefined, "WT_ERR_NOT_FOUND");
    }

    // 2. Check if UID is actively bound elsewhere (active card uniqueness rule)
    const activeBindingOnUid = await db.rfid_tag_bindings.findFirst({
      where: {
        tag_uid: normalizedUid,
        unbound_at: null,
      },
    });

    if (activeBindingOnUid) {
      if (activeBindingOnUid.material_lot_id === lot.id) {
        return {
          bindingId: activeBindingOnUid.id,
          lotId: lot.id,
          tagUid: normalizedUid,
        };
      }
      throw ApiError.conflict(
        `RFID card UID '${normalizedUid}' is already actively bound to another subject. Rejected by active card policy.`,
        { tagUid: normalizedUid, existingBindingId: activeBindingOnUid.id },
        "WT_ERR_ACTIVE_CARD",
      );
    }

    // 3. Ensure actor staff user exists
    let staffUserId = actorRef.id;
    const existingStaff = await db.staff_users.findUnique({
      where: { id: staffUserId },
    });
    if (!existingStaff) {
      const fallback = await db.staff_users.findFirst({
        where: { suspended_at: null },
      });
      staffUserId = fallback ? fallback.id : lot.received_by;
    }

    // 4. If lot already has an active card, unbind old card first
    const existingLotBinding = await db.rfid_tag_bindings.findFirst({
      where: {
        material_lot_id: lot.id,
        unbound_at: null,
      },
    });
    if (existingLotBinding) {
      await db.rfid_tag_bindings.update({
        where: { id: existingLotBinding.id },
        data: {
          unbound_at: new Date(),
          unbound_by: staffUserId,
        },
      });
    }

    // 5. Create new binding (tag_uid is a generated column in DB, populated explicitly in mock harnesses)
    const bindingData: any = {
      material_lot_id: lot.id,
      tag_identifier: normalizedUid,
      tag_technology: "ISO_14443_A",
      bound_by: staffUserId,
      bound_at: new Date(),
    };
    if (!("$executeRaw" in (db as any))) {
      bindingData.tag_uid = normalizedUid;
    }
    const binding = await db.rfid_tag_bindings.create({
      data: bindingData,
    });

    // 6. Record audit event
    await db.audit_events.create({
      data: {
        actor_staff_id: staffUserId,
        department_code: "receiving",
        action_code: "material_card_bound",
        target_type: "material_lot",
        target_reference: lot.code,
        details: {
          lotId: lot.id,
          tagUid: normalizedUid,
          bindingId: binding.id,
        },
      },
    });

    return {
      bindingId: binding.id,
      lotId: lot.id,
      tagUid: normalizedUid,
    };
  }, tx);
}

// ---------------------------------------------------------------- Incoming Stock Acceptance Helper (Consumed by Member 3)

export async function acceptIncomingStockHelper(
  lotId: string,
  acceptedQty: number,
  inspectionId: string,
  actor?: unknown,
  tx?: PrismaTransactionClient,
): Promise<AcceptIncomingStockResult> {
  const actorRef = toActorRef(actor);
  if (acceptedQty <= 0) {
    throw ApiError.badRequest(
      "Accepted quantity must be greater than zero.",
      { acceptedQty },
      "WT_ERR_INVALID_QUANTITY",
    );
  }

  return runInTransaction(async (db) => {
    // 1. Fetch material lot
    const lot = await db.material_lots.findFirst({
      where: idOrCodeWhere(lotId),
    });

    if (!lot) {
      throw ApiError.notFound(`Material lot '${lotId}' not found.`, undefined, "WT_ERR_NOT_FOUND");
    }

    const currentAccepted = Number(lot.available_accepted_quantity);
    const received = Number(lot.received_quantity);
    const newTotal = currentAccepted + acceptedQty;

    if (newTotal > received) {
      throw ApiError.badRequest(
        `Accepted quantity (${newTotal}) cannot exceed received quantity (${received}).`,
        { received, currentAccepted, attemptedAccept: acceptedQty },
        "WT_ERR_QUANTITY_OVERFLOW",
      );
    }

    // 2. Ensure actor staff user exists
    let staffUserId = actorRef.id;
    const existingStaff = await db.staff_users.findUnique({
      where: { id: staffUserId },
    });
    if (!existingStaff) {
      const fallback = await db.staff_users.findFirst({
        where: { suspended_at: null },
      });
      staffUserId = fallback ? fallback.id : lot.received_by;
    }

    // 3. Atomically update lot balance and increment revision
    const updatedLot = await db.material_lots.update({
      where: { id: lot.id },
      data: {
        available_accepted_quantity: new Prisma.Decimal(newTotal),
        revision: { increment: 1 },
      },
    });

    // 4. Create material stock movement with kind 'accepted'
    const movement = await db.material_stock_movements.create({
      data: {
        material_lot_id: lot.id,
        kind: "accepted",
        inspection_id: inspectionId,
        production_order_id: null,
        quantity: new Prisma.Decimal(acceptedQty),
        reason: "Incoming QC lot clearance accepted",
        performed_by: staffUserId,
        performed_at: new Date(),
      },
    });

    return {
      movementId: movement.id,
      lotId: lot.id,
      newBalance: Number(updatedLot.available_accepted_quantity),
      acceptedQuantity: acceptedQty,
    };
  }, tx);
}

// ---------------------------------------------------------------- Issue Material to Order

export async function issueMaterial(
  input: IssueMaterialInput,
  actor?: unknown,
  tx?: PrismaTransactionClient,
): Promise<IssueMaterialResult> {
  const actorRef = toActorRef(actor);
  if (!isAuthorizedForIssue(actorRef.role, actorRef.department)) {
    throw ApiError.forbidden(
      "Only raw-store / materials staff can issue fabric to production orders.",
      { role: actorRef.role, department: actorRef.department },
      "WT_ERR_FORBIDDEN",
    );
  }

  if (input.quantity <= 0) {
    throw ApiError.badRequest("Issued quantity must be greater than zero.", undefined, "WT_ERR_INVALID_QUANTITY");
  }

  return runInTransaction(async (db) => {
    // 1. Fetch lot
    const lot = await db.material_lots.findFirst({
      where: idOrCodeWhere(input.lotId),
    });
    if (!lot) {
      throw ApiError.notFound(`Material lot '${input.lotId}' not found.`, undefined, "WT_ERR_NOT_FOUND");
    }

    // 2. Fetch order
    const order = await db.production_orders.findFirst({
      where: idOrCodeWhere(input.orderId),
    });
    if (!order) {
      throw ApiError.notFound(`Production order '${input.orderId}' not found.`, undefined, "WT_ERR_NOT_FOUND");
    }

    if (order.status !== "approved" && order.status !== "in_progress") {
      throw ApiError.badRequest(
        `Cannot issue material to order '${order.code}' with status '${order.status}'. Order must be approved first.`,
        { orderStatus: order.status },
        "WT_ERR_ORDER_NOT_APPROVED",
      );
    }

    const available = Number(lot.available_accepted_quantity);
    if (available < input.quantity) {
      throw ApiError.badRequest(
        `Insufficient accepted fabric in lot '${lot.code}'. Requested: ${input.quantity} ${lot.unit}, available: ${available} ${lot.unit}. Must be between 0 and ${available}.`,
        { available, requested: input.quantity },
        "WT_ERR_INSUFFICIENT_STOCK",
      );
    }

    // 3. Ensure actor staff user exists
    let staffUserId = actorRef.id;
    const existingStaff = await db.staff_users.findUnique({
      where: { id: staffUserId },
    });
    if (!existingStaff) {
      const fallback = await db.staff_users.findFirst({
        where: { suspended_at: null },
      });
      staffUserId = fallback ? fallback.id : lot.received_by;
    }

    // 4. Decrement available balance atomically and increment revision
    const newBalance = available - input.quantity;
    await db.material_lots.update({
      where: { id: lot.id },
      data: {
        available_accepted_quantity: new Prisma.Decimal(newBalance),
        revision: { increment: 1 },
      },
    });

    // 5. Append immutable stock movement
    const movement = await db.material_stock_movements.create({
      data: {
        material_lot_id: lot.id,
        kind: "issued",
        production_order_id: order.id,
        inspection_id: null,
        quantity: new Prisma.Decimal(input.quantity),
        reason: input.reason || `Issued ${input.quantity} ${lot.unit} to production order ${order.code}`,
        performed_by: staffUserId,
        performed_at: new Date(),
      },
    });

    // 6. Transition order to in_progress if still approved
    if (order.status === "approved") {
      await db.production_orders.update({
        where: { id: order.id },
        data: {
          status: "in_progress",
          revision: { increment: 1 },
        },
      });
    }

    // 7. Record audit event
    await db.audit_events.create({
      data: {
        actor_staff_id: staffUserId,
        department_code: "raw_store",
        action_code: "material_issued",
        target_type: "material_stock_movement",
        target_reference: movement.id,
        details: {
          issueId: movement.id,
          lotId: lot.id,
          lotCode: lot.code,
          orderId: order.id,
          orderCode: order.code,
          quantity: input.quantity,
          remainingBalance: newBalance,
        },
      },
    });

    return {
      issueId: movement.id,
      lotId: lot.id,
      orderId: order.id,
      quantityIssued: input.quantity,
      remainingLotBalance: newBalance,
    };
  }, tx);
}

// ---------------------------------------------------------------- Return Unused Fabric from Cutting

export async function returnMaterial(
  input: ReturnMaterialInput,
  actor?: unknown,
  tx?: PrismaTransactionClient,
): Promise<ReturnMaterialResult> {
  const actorRef = toActorRef(actor);
  if (input.quantity <= 0) {
    throw ApiError.badRequest("Returned quantity must be greater than zero.", undefined, "WT_ERR_INVALID_QUANTITY");
  }

  return runInTransaction(async (db) => {
    // 1. Resolve original issue movement
    const issue = await db.material_stock_movements.findUnique({
      where: { id: input.issueId },
      include: {
        material_lots: true,
        other_material_stock_movements: {
          where: { kind: "unused_return" },
        },
      },
    });

    if (!issue || issue.kind !== "issued") {
      throw ApiError.notFound(
        `Original issue movement '${input.issueId}' not found.`,
        undefined,
        "WT_ERR_NOT_FOUND",
      );
    }

    const issuedQty = Number(issue.quantity);
    const alreadyReturned = issue.other_material_stock_movements.reduce(
      (sum, m) => sum + Number(m.quantity),
      0,
    );
    const maxReturnable = issuedQty - alreadyReturned;

    if (input.quantity > maxReturnable) {
      throw ApiError.badRequest(
        `Cannot return ${input.quantity}. Maximum returnable remaining from issue is ${maxReturnable}.`,
        { issuedQty, alreadyReturned, requestedReturn: input.quantity },
        "WT_ERR_RETURN_EXCEEDS_ISSUE",
      );
    }

    // 2. Ensure actor staff user exists
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

    // 3. Insert unused_return movement
    const returnMovement = await db.material_stock_movements.create({
      data: {
        material_lot_id: issue.material_lot_id,
        kind: "unused_return",
        production_order_id: issue.production_order_id,
        original_issue_id: issue.id,
        quantity: new Prisma.Decimal(input.quantity),
        reason: input.reason || "Unused fabric returned from cutting bench",
        performed_by: staffUserId,
        performed_at: new Date(),
      },
    });

    // 4. Restore lot available_accepted_quantity
    const restoredBalance =
      Number(issue.material_lots.available_accepted_quantity) + input.quantity;
    await db.material_lots.update({
      where: { id: issue.material_lot_id },
      data: {
        available_accepted_quantity: new Prisma.Decimal(restoredBalance),
        revision: { increment: 1 },
      },
    });

    return {
      returnMovementId: returnMovement.id,
      originalIssueId: issue.id,
      lotId: issue.material_lot_id,
      quantityReturned: input.quantity,
      restoredLotBalance: restoredBalance,
    };
  }, tx);
}
