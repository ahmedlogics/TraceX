import { describe, it, expect, beforeEach } from "vitest";
import type { PrismaTransactionClient } from "../server/db/types";
import {
  listSuppliers,
  getOrCreateSupplier,
  listLots,
  getLotDetail,
  receiveMaterialLot,
  bindLotCard,
  acceptIncomingStockHelper,
  issueMaterial,
  returnMaterial,
} from "../server/materials/materials-service";
import {
  listProductSpecs,
  saveProductSpec,
  listOrders,
  getOrderDetail,
  createProductionOrder,
  approveProductionOrder,
  confirmCuttingSource,
  bindGarmentTag,
  replaceGarmentCard,
  routineProductionScan,
  listGarments,
  getGarmentDetail,
  getPublicProductMaterialData,
  subjectRevisionService,
} from "../server/production/production-service";
import {
  listTasks,
  claimTask,
  assignTask,
} from "../server/tasks/tasks-service";
import {
  FabricReceivingScanHandler,
  FabricIssueScanHandler,
  CuttingScanHandler,
  StitchingScanHandler,
  FinishingScanHandler,
} from "../server/rfid/domain-handlers";
import { createExpressApp } from "../server/app";
import type { VersionedScanEnvelope } from "../server/contracts/rfid";
import { ApiError } from "../server/middleware/responses";
import type { StaffRole, Department } from "../server/contracts/actor";

// ---------------------------------------------------------------- In-Memory Database Harness

interface MockDbState {
  suppliers: any[];
  material_lots: any[];
  material_stock_movements: any[];
  production_orders: any[];
  product_spec_versions: any[];
  workflow_versions: any[];
  cutting_jobs: any[];
  cutting_inputs: any[];
  garments: any[];
  garment_material_inputs: any[];
  rfid_tag_bindings: any[];
  work_tasks: any[];
  staff_users: any[];
  audit_events: any[];
  rfid_action_contexts: any[];
  trace_events: any[];
}

function createMockDb(): { db: PrismaTransactionClient; state: MockDbState } {
  const state: MockDbState = {
    suppliers: [
      { id: "sup-001", code: "SUP-GOTS", name: "GOTS Certified Organic Mills", active: true },
      { id: "sup-002", code: "SUP-LINEN", name: "Pure European Flax Ltd", active: true },
    ],
    material_lots: [],
    material_stock_movements: [],
    production_orders: [],
    product_spec_versions: [
      {
        id: "spec-001",
        style_code: "WT-SH-100",
        version: 1,
        product_name: "Organic Oxford Shirt",
        specifications: {
          category: "shirt",
          standardConsumptionMeters: 2.0,
          sizeVariants: ["S", "M", "L", "XL"],
          active: true,
        },
        approved_by: "u-manager",
        approved_at: new Date("2026-10-01"),
      },
      {
        id: "spec-002",
        style_code: "WT-TR-200",
        version: 1,
        product_name: "Tailored Linen Trouser",
        specifications: {
          category: "trouser",
          standardConsumptionMeters: 2.5,
          sizeVariants: ["30", "32", "34"],
          active: true,
        },
        approved_by: "u-manager",
        approved_at: new Date("2026-10-01"),
      },
    ],
    workflow_versions: [
      {
        id: "wf-001",
        workflow_code: "STD_GARMENT",
        version: 1,
        title: "Standard Garment Assembly Workflow",
        approved_by: "u-manager",
        approved_at: new Date("2026-10-01"),
      },
    ],
    cutting_jobs: [],
    cutting_inputs: [],
    garments: [],
    garment_material_inputs: [],
    rfid_tag_bindings: [],
    work_tasks: [],
    staff_users: [
      { id: "u-receiving", username: "receiving.demo", display_name: "Receiving Operator", suspended_at: null },
      { id: "u-store", username: "rawstore.demo", display_name: "Raw Store Staff", suspended_at: null },
      { id: "u-cutting", username: "cutting.demo", display_name: "Cutting Table Lead", suspended_at: null },
      { id: "u-stitching", username: "stitching.demo", display_name: "Stitching Specialist", suspended_at: null },
      { id: "u-finishing", username: "finishing.demo", display_name: "Finishing Specialist", suspended_at: null },
      { id: "u-qc", username: "quality.demo", display_name: "Senior Quality Inspector", suspended_at: null },
      { id: "u-manager", username: "manager.demo", display_name: "Production Manager", suspended_at: null },
    ],
    audit_events: [],
    rfid_action_contexts: [],
    trace_events: [],
  };

  const getFullCuttingJob = (cjId: string) => {
    const job = state.cutting_jobs.find((j) => j.id === cjId);
    if (!job) return null;
    const order = state.production_orders.find((o) => o.id === job.production_order_id);
    const spec = order ? state.product_spec_versions.find((s) => s.id === order.product_spec_version_id) : null;
    return {
      ...job,
      production_orders: order
        ? {
            ...order,
            product_spec_versions: spec || { product_name: "Shirt", style_code: "WT-SH-100" },
          }
        : null,
    };
  };

  const getFullGarment = (g: any) => {
    const cj = getFullCuttingJob(g.cutting_job_id);
    const gmi = state.garment_material_inputs.filter((x) => x.garment_id === g.id).map((x) => {
      const ci = state.cutting_inputs.find((c) => c.id === x.cutting_input_id);
      const mov = ci ? state.material_stock_movements.find((m) => m.id === ci.issue_id) : null;
      const lot = mov ? state.material_lots.find((l) => l.id === mov.material_lot_id) : null;
      const sup = lot ? state.suppliers.find((s) => s.id === lot.supplier_id) : null;
      return {
        ...x,
        cutting_inputs: ci
          ? {
              ...ci,
              material_stock_movements: mov
                ? {
                    ...mov,
                    material_lots: lot ? { ...lot, suppliers: sup } : null,
                  }
                : null,
            }
          : null,
      };
    });
    const activeBinding = state.rfid_tag_bindings.find((b) => b.garment_id === g.id && b.unbound_at === null);
    return {
      ...g,
      cutting_jobs: cj,
      garment_material_inputs: gmi,
      rfid_tag_bindings: activeBinding || null,
    };
  };

  const client: any = {
    suppliers: {
      findMany: async () => state.suppliers.filter((s) => s.active),
      findUnique: async ({ where }: any) => state.suppliers.find((s) => s.id === where.id || s.code === where.code),
      findFirst: async ({ where }: any) => state.suppliers.find((s) => s.code === where.code),
      create: async ({ data }: any) => {
        const item = { id: data.id || `sup-${state.suppliers.length + 1}`, ...data };
        state.suppliers.push(item);
        return item;
      },
    },
    material_lots: {
      count: async () => state.material_lots.length,
      findMany: async () =>
        state.material_lots.map((l) => ({
          ...l,
          suppliers: state.suppliers.find((s) => s.id === l.supplier_id) || { name: "Supplier" },
          staff_users: state.staff_users.find((u) => u.id === l.received_by) || { display_name: "Staff" },
          rfid_tag_bindings: state.rfid_tag_bindings.find((b) => b.material_lot_id === l.id && b.unbound_at === null) || null,
          material_stock_movements: state.material_stock_movements.filter((m) => m.material_lot_id === l.id),
        })),
      findFirst: async ({ where }: any) => {
        let lot: any;
        if (where.OR) {
          lot = state.material_lots.find((l) => where.OR.some((cond: any) => cond.id === l.id || cond.code === l.code));
        } else if (where.id) {
          lot = state.material_lots.find((l) => l.id === where.id);
        } else if (where.code) {
          lot = state.material_lots.find((l) => l.code === where.code);
        } else if (where.rfid_tag_bindings === null) {
          lot = state.material_lots.find((l) => !state.rfid_tag_bindings.some((b) => b.material_lot_id === l.id && b.unbound_at === null));
        }
        if (!lot) return null;
        return {
          ...lot,
          suppliers: state.suppliers.find((s) => s.id === lot.supplier_id) || { name: "Supplier" },
          staff_users: state.staff_users.find((u) => u.id === lot.received_by) || { display_name: "Staff" },
          rfid_tag_bindings: state.rfid_tag_bindings.find((b) => b.material_lot_id === lot.id && b.unbound_at === null) || null,
          material_stock_movements: state.material_stock_movements.filter((m) => m.material_lot_id === lot.id).map((m) => ({
            ...m,
            staff_users: state.staff_users.find((u) => u.id === m.performed_by) || { display_name: "Staff" },
            production_orders: state.production_orders.find((o) => o.id === m.production_order_id) || null,
          })),
        };
      },
      findUnique: async ({ where }: any) => {
        return state.material_lots.find((l) => l.id === where.id);
      },
      create: async ({ data }: any) => {
        const item = { id: data.id || `lot-${state.material_lots.length + 1}`, ...data };
        state.material_lots.push(item);
        return item;
      },
      update: async ({ where, data }: any) => {
        const lot = state.material_lots.find((l) => l.id === where.id);
        if (!lot) throw new Error("Lot not found");
        if (data.available_accepted_quantity) lot.available_accepted_quantity = data.available_accepted_quantity;
        if (data.revision?.increment) lot.revision += data.revision.increment;
        return lot;
      },
    },
    material_stock_movements: {
      findUnique: async ({ where }: any) => {
        const m = state.material_stock_movements.find((x) => x.id === where.id);
        if (!m) return null;
        const lot = state.material_lots.find((l) => l.id === m.material_lot_id);
        const activeBinding = lot ? state.rfid_tag_bindings.find((b) => b.material_lot_id === lot.id && b.unbound_at === null) : null;
        return {
          ...m,
          material_lots: lot ? { ...lot, rfid_tag_bindings: activeBinding || null } : null,
          other_material_stock_movements: state.material_stock_movements.filter((x) => x.original_issue_id === m.id),
        };
      },
      create: async ({ data }: any) => {
        const item = { id: data.id || `mov-${state.material_stock_movements.length + 1}`, ...data };
        state.material_stock_movements.push(item);
        return item;
      },
    },
    production_orders: {
      count: async () => state.production_orders.length,
      findMany: async () =>
        state.production_orders.map((o) => ({
          ...o,
          product_spec_versions: state.product_spec_versions.find((sp) => sp.id === o.product_spec_version_id),
          workflow_versions: state.workflow_versions.find((w) => w.id === o.workflow_version_id),
          staff_users_production_orders_created_byTostaff_users: state.staff_users.find((u) => u.id === o.created_by),
          staff_users_production_orders_approved_byTostaff_users: state.staff_users.find((u) => u.id === o.approved_by),
        })),
      findFirst: async ({ where }: any) => {
        let order: any;
        if (where.OR) {
          order = state.production_orders.find((o) => where.OR.some((cond: any) => cond.id === o.id || cond.code === o.code));
        } else if (where.id) {
          order = state.production_orders.find((o) => o.id === where.id);
        } else if (where.status) {
          order = state.production_orders.find((o) => where.status.in ? where.status.in.includes(o.status) : o.status === where.status);
        }
        if (!order) return null;
        const spec = state.product_spec_versions.find((sp) => sp.id === order.product_spec_version_id) || {
          style_code: "WT-SH-100",
          version: 1,
          product_name: "Product",
          specifications: {},
          approved_by: "u-manager",
          approved_at: new Date(),
          staff_users: { display_name: "Manager" },
        };
        const issues = state.material_stock_movements.filter((m) => m.production_order_id === order.id && m.kind === "issued").map((m) => ({
          ...m,
          material_lots: state.material_lots.find((l) => l.id === m.material_lot_id) || { code: "FAB-001", material_name: "Cotton" },
        }));
        const cutting_jobs = state.cutting_jobs.filter((cj) => cj.production_order_id === order.id).map((cj) => ({
          ...cj,
          garments: state.garments.filter((g) => g.cutting_job_id === cj.id),
        }));
        return {
          ...order,
          product_spec_versions: {
            ...spec,
            staff_users: state.staff_users.find((u) => u.id === spec.approved_by) || { display_name: "Staff" },
          },
          workflow_versions: state.workflow_versions.find((w) => w.id === order.workflow_version_id) || {},
          staff_users_production_orders_created_byTostaff_users: state.staff_users.find((u) => u.id === order.created_by),
          staff_users_production_orders_approved_byTostaff_users: state.staff_users.find((u) => u.id === order.approved_by),
          material_stock_movements: issues,
          cutting_jobs,
        };
      },
      findUnique: async ({ where }: any) => state.production_orders.find((o) => o.id === where.id),
      create: async ({ data }: any) => {
        const item = { id: data.id || `order-${state.production_orders.length + 1}`, ...data };
        state.production_orders.push(item);
        return item;
      },
      update: async ({ where, data }: any) => {
        const order = state.production_orders.find((o) => o.id === where.id);
        if (!order) throw new Error("Order not found");
        if (data.status) order.status = data.status;
        if (data.approved_by) order.approved_by = data.approved_by;
        if (data.approved_at) order.approved_at = data.approved_at;
        if (data.revision?.increment) order.revision += data.revision.increment;
        return order;
      },
    },
    product_spec_versions: {
      findMany: async () =>
        state.product_spec_versions.map((sp) => ({
          ...sp,
          staff_users: state.staff_users.find((u) => u.id === sp.approved_by) || { display_name: "Staff" },
        })),
      findFirst: async ({ where }: any) => state.product_spec_versions.find((sp) => sp.style_code === where.style_code),
      create: async ({ data }: any) => {
        const item = { id: data.id || `spec-${state.product_spec_versions.length + 1}`, ...data };
        state.product_spec_versions.push(item);
        return item;
      },
    },
    workflow_versions: {
      findFirst: async ({ where }: any) => state.workflow_versions.find((w) => w.workflow_code === where.workflow_code),
      create: async ({ data }: any) => {
        const item = { id: data.id || `wf-${state.workflow_versions.length + 1}`, ...data };
        state.workflow_versions.push(item);
        return item;
      },
    },
    cutting_jobs: {
      count: async () => state.cutting_jobs.length,
      findFirst: async ({ where }: any) => state.cutting_jobs.find((cj) => cj.production_order_id === where.production_order_id),
      create: async ({ data }: any) => {
        const item = { id: data.id || `cj-${state.cutting_jobs.length + 1}`, ...data };
        state.cutting_jobs.push(item);
        return item;
      },
    },
    cutting_inputs: {
      findFirst: async ({ where }: any) => state.cutting_inputs.find((ci) => ci.cutting_job_id === where.cutting_job_id),
      findUnique: async ({ where }: any) =>
        state.cutting_inputs.find(
          (ci) => ci.cutting_job_id === where.cutting_job_id_issue_id?.cutting_job_id && ci.issue_id === where.cutting_job_id_issue_id?.issue_id,
        ),
      create: async ({ data }: any) => {
        const item = { id: data.id || `ci-${state.cutting_inputs.length + 1}`, ...data };
        state.cutting_inputs.push(item);
        return item;
      },
    },
    garments: {
      count: async () => state.garments.length,
      findMany: async () =>
        state.garments.map((g) => ({
          ...g,
          cutting_jobs: state.cutting_jobs.find((cj) => cj.id === g.cutting_job_id) || { code: "CUT-001" },
          rfid_tag_bindings: state.rfid_tag_bindings.find((b) => b.garment_id === g.id && b.unbound_at === null) || null,
        })),
      findFirst: async ({ where }: any) => {
        const g = state.garments.find((item) => {
          if (where.OR) return where.OR.some((cond: any) => cond.id === item.id || cond.code === item.code || cond.public_id === item.public_id);
          return item.id === where.id;
        });
        if (!g) return null;
        return getFullGarment(g);
      },
      findUnique: async ({ where }: any) => {
        const g = state.garments.find((item) => item.id === where.id || item.public_id === where.public_id);
        if (!g) return null;
        return getFullGarment(g);
      },
      create: async ({ data }: any) => {
        const item = { id: data.id || `g-${state.garments.length + 1}`, ...data };
        state.garments.push(item);
        return item;
      },
      update: async ({ where, data }: any) => {
        const g = state.garments.find((item) => item.id === where.id);
        if (!g) throw new Error("Garment not found");
        if (data.stage) g.stage = data.stage;
        if (data.quality_disposition) g.quality_disposition = data.quality_disposition;
        if (data.revision?.increment) g.revision += data.revision.increment;
        return g;
      },
    },
    garment_material_inputs: {
      create: async ({ data }: any) => {
        state.garment_material_inputs.push(data);
        return data;
      },
    },
    rfid_tag_bindings: {
      findFirst: async ({ where }: any) => {
        const b = state.rfid_tag_bindings.find((item) => {
          if (where.tag_uid && item.tag_uid !== where.tag_uid) return false;
          if (where.material_lot_id && item.material_lot_id !== where.material_lot_id) return false;
          if (where.garment_id && item.garment_id !== where.garment_id) return false;
          if (where.unbound_at === null && item.unbound_at !== null) return false;
          return true;
        });
        if (!b) return null;
        const g = b.garment_id ? state.garments.find((item) => item.id === b.garment_id) : null;
        const lot = b.material_lot_id ? state.material_lots.find((item) => item.id === b.material_lot_id) : null;
        return {
          ...b,
          garments: g ? getFullGarment(g) : null,
          material_lots: lot || null,
        };
      },
      findMany: async ({ where }: any) => {
        return state.rfid_tag_bindings.filter((b) => {
          if (where.garment_id && b.garment_id !== where.garment_id) return false;
          return true;
        });
      },
      create: async ({ data }: any) => {
        const item = { id: data.id || `bind-${state.rfid_tag_bindings.length + 1}`, unbound_at: null, unbound_by: null, ...data };
        state.rfid_tag_bindings.push(item);
        return item;
      },
      update: async ({ where, data }: any) => {
        const b = state.rfid_tag_bindings.find((x) => x.id === where.id);
        if (!b) throw new Error("Binding not found");
        if (data.unbound_at) b.unbound_at = data.unbound_at;
        if (data.unbound_by) b.unbound_by = data.unbound_by;
        return b;
      },
    },
    work_tasks: {
      findMany: async () => state.work_tasks,
      findUnique: async ({ where }: any) => state.work_tasks.find((t) => t.id === where.id),
      create: async ({ data }: any) => {
        const item = { id: data.id || `task-${state.work_tasks.length + 1}`, ...data };
        state.work_tasks.push(item);
        return item;
      },
      update: async ({ where, data }: any) => {
        const task = state.work_tasks.find((t) => t.id === where.id);
        if (!task) throw new Error("Task not found");
        if (data.status) task.status = data.status;
        if (data.assignee_id) task.assignee_id = data.assignee_id;
        if (data.claimed_at) task.claimed_at = data.claimed_at;
        if (data.revision?.increment) task.revision += data.revision.increment;
        return task;
      },
    },
    staff_users: {
      findUnique: async ({ where }: any) => state.staff_users.find((u) => u.id === where.id),
      findFirst: async () => state.staff_users[0],
      create: async ({ data }: any) => {
        state.staff_users.push(data);
        return data;
      },
    },
    audit_events: {
      create: async ({ data }: any) => {
        state.audit_events.push(data);
        return data;
      },
    },
    rfid_action_contexts: {
      findFirst: async ({ where }: any) => state.rfid_action_contexts.find((c) => c.id === where.id),
    },
    trace_events: {
      create: async ({ data }: any) => {
        const item = { id: data.id || `te-${state.trace_events.length + 1}`, ...data };
        state.trace_events.push(item);
        return item;
      },
    },
  };

  return { db: client as PrismaTransactionClient, state };
}

// ---------------------------------------------------------------- Test Suites

describe("Member 2: Real Materials & Production Persistence Services", () => {
  let db: PrismaTransactionClient;
  let state: MockDbState;

  const receivingActor = { actorId: "u-receiving", role: "materials" as StaffRole, department: "receiving" as Department, username: "receiving.demo", displayName: "Receiving Demo", authenticatedAt: new Date() };
  const storeActor = { actorId: "u-store", role: "materials" as StaffRole, department: "raw-store" as Department, username: "rawstore.demo", displayName: "Store Demo", authenticatedAt: new Date() };
  const cuttingActor = { actorId: "u-cutting", role: "production" as StaffRole, department: "cutting" as Department, username: "cutting.demo", displayName: "Cutting Demo", authenticatedAt: new Date() };
  const stitchingActor = { actorId: "u-stitching", role: "production" as StaffRole, department: "stitching" as Department, username: "stitching.demo", displayName: "Stitching Demo", authenticatedAt: new Date() };
  const finishingActor = { actorId: "u-finishing", role: "production" as StaffRole, department: "finishing" as Department, username: "finishing.demo", displayName: "Finishing Demo", authenticatedAt: new Date() };
  const managerActor = { actorId: "u-manager", role: "manager" as StaffRole, department: undefined, username: "manager.demo", displayName: "Manager Demo", authenticatedAt: new Date() };
  const qcActor = { actorId: "u-qc", role: "quality" as StaffRole, department: "quality" as Department, username: "quality.demo", displayName: "QC Demo", authenticatedAt: new Date() };

  beforeEach(() => {
    const mock = createMockDb();
    db = mock.db;
    state = mock.state;
  });

  describe("Milestone 1 — Persistent Reference Data, Receipts and Acceptance Boundary", () => {
    it("records a fabric lot receipt with zero initial accepted balance and assigns human-readable FAB code", async () => {
      const res = await receiveMaterialLot(
        {
          materialName: "100% GOTS Organic Cotton Poplin, Sky Blue, 140cm",
          supplierCode: "SUP-GOTS",
          supplierRef: "GOTS-POPLIN-2026",
          quantity: 30.0,
          unit: "m",
        },
        receivingActor,
        db,
      );

      expect(res.lotId).toBeDefined();
      expect(res.lotCode).toBe("FAB-001");

      const lot = await getLotDetail(res.lotId, receivingActor, db);
      expect(lot).not.toBeNull();
      expect(lot?.receivedQuantity).toBe(30.0);
      expect(lot?.availableAcceptedQuantity).toBe(0);
      expect(lot?.status).toBe("awaiting-inspection");
    });

    it("rejects non-positive quantity and unauthorized department for receipt", async () => {
      await expect(
        receiveMaterialLot(
          { materialName: "Silk", quantity: 0, unit: "m" },
          receivingActor,
          db,
        ),
      ).rejects.toThrow(/greater than zero/i);

      try {
        await receiveMaterialLot(
          { materialName: "Silk", quantity: 10, unit: "m" },
          cuttingActor,
          db,
        );
        expect.unreachable("Should have thrown ApiError");
      } catch (err: any) {
        expect(err.errorCode).toBe("WT_ERR_FORBIDDEN");
      }
    });

    it("binds a physical RFID bundle card to a material lot and enforces active card uniqueness", async () => {
      const { lotId } = await receiveMaterialLot(
        { materialName: "Pure Linen", supplierRef: "LINEN-01", quantity: 20.0, unit: "m" },
        receivingActor,
        db,
      );

      const bindRes = await bindLotCard({ lotId, tagUid: "04A1B2C3" }, receivingActor, db);
      expect(bindRes.tagUid).toBe("04A1B2C3");
      expect(bindRes.lotId).toBe(lotId);

      const lot2 = await receiveMaterialLot(
        { materialName: "Denim", supplierRef: "DENIM-01", quantity: 15.0, unit: "m" },
        receivingActor,
        db,
      );

      try {
        await bindLotCard({ lotId: lot2.lotId, tagUid: "04A1B2C3" }, receivingActor, db);
        expect.unreachable("Should have thrown ApiError");
      } catch (err: any) {
        expect(err.errorCode).toBe("WT_ERR_ACTIVE_CARD");
      }
    });

    it("executes transaction-scoped incoming stock acceptance helper for Member 3 QA clearance", async () => {
      const { lotId } = await receiveMaterialLot(
        { materialName: "Organic Twill", supplierRef: "TWILL-01", quantity: 25.0, unit: "m" },
        receivingActor,
        db,
      );

      const acceptRes = await acceptIncomingStockHelper(lotId, 25.0, "INSP-QC-001", qcActor, db);
      expect(acceptRes.newBalance).toBe(25.0);
      expect(acceptRes.movementId).toBeDefined();

      const detail = await getLotDetail(lotId, receivingActor, db);
      expect(detail?.availableAcceptedQuantity).toBe(25.0);
      expect(detail?.status).toBe("accepted");
      expect(detail?.movements.some((m) => m.kind === "accepted" && m.quantity === 25.0)).toBe(true);

      await expect(
        acceptIncomingStockHelper(lotId, 5.0, "INSP-QC-002", qcActor, db),
      ).rejects.toThrow(/cannot exceed received quantity/i);
    });
  });

  describe("Milestone 2 — Multi-Order Fabric Issue and Return Accounting", () => {
    it("issues fabric to approved order, decrements lot balance atomically, and tracks movements", async () => {
      const { lotId } = await receiveMaterialLot(
        { materialName: "Cotton Poplin", quantity: 30.0, unit: "m" },
        receivingActor,
        db,
      );
      await acceptIncomingStockHelper(lotId, 30.0, "INSP-01", qcActor, db);

      const { orderId } = await createProductionOrder(
        { product: "Oxford Shirt", styleCode: "WT-SH-100", qty: 2 },
        managerActor,
        db,
      );
      await approveProductionOrder(orderId, managerActor, db);

      const issueRes = await issueMaterial(
        { lotId, orderId, quantity: 4.0 },
        storeActor,
        db,
      );
      expect(issueRes.remainingLotBalance).toBe(26.0);
      expect(issueRes.quantityIssued).toBe(4.0);

      const order = await getOrderDetail(orderId, managerActor, db);
      expect(order?.status).toBe("in_progress");
      expect(order?.issuedMetersTotal).toBe(4.0);
    });

    it("prevents over-issuing beyond available accepted balance", async () => {
      const { lotId } = await receiveMaterialLot(
        { materialName: "Cotton Poplin", quantity: 10.0, unit: "m" },
        receivingActor,
        db,
      );
      await acceptIncomingStockHelper(lotId, 10.0, "INSP-01", qcActor, db);

      const { orderId } = await createProductionOrder(
        { product: "Oxford Shirt", styleCode: "WT-SH-100", qty: 2 },
        managerActor,
        db,
      );
      await approveProductionOrder(orderId, managerActor, db);

      await expect(
        issueMaterial({ lotId, orderId, quantity: 15.0 }, storeActor, db),
      ).rejects.toThrow(/Insufficient accepted fabric/i);
    });

    it("supports returning unused fabric from cutting and restores lot balance", async () => {
      const { lotId } = await receiveMaterialLot(
        { materialName: "Wool Blend", quantity: 20.0, unit: "m" },
        receivingActor,
        db,
      );
      await acceptIncomingStockHelper(lotId, 20.0, "INSP-01", qcActor, db);

      const { orderId } = await createProductionOrder(
        { product: "Oxford Shirt", styleCode: "WT-SH-100", qty: 4 },
        managerActor,
        db,
      );
      await approveProductionOrder(orderId, managerActor, db);

      const issue = await issueMaterial({ lotId, orderId, quantity: 8.0 }, storeActor, db);
      expect(issue.remainingLotBalance).toBe(12.0);

      const ret = await returnMaterial(
        { issueId: issue.issueId, quantity: 2.0, reason: "Excess fabric unconsumed" },
        storeActor,
        db,
      );
      expect(ret.restoredLotBalance).toBe(14.0);

      try {
        await returnMaterial({ issueId: issue.issueId, quantity: 7.0, reason: "Too much" }, storeActor, db);
        expect.unreachable("Should have thrown ApiError");
      } catch (err: any) {
        expect(err.errorCode).toBe("WT_ERR_RETURN_EXCEEDS_ISSUE");
      }
    });
  });

  describe("Milestone 3 — Cutting Table Bench Lock, Garment Tag Binding and Card Replacement", () => {
    it("locks confirmed cutting source, attributes fabric, and creates permanent garment with valid public ID", async () => {
      const { lotId } = await receiveMaterialLot(
        { materialName: "Pure Linen", quantity: 20.0, unit: "m" },
        receivingActor,
        db,
      );
      await bindLotCard({ lotId, tagUid: "04EE5566" }, receivingActor, db);
      await acceptIncomingStockHelper(lotId, 20.0, "INSP-01", qcActor, db);

      const { orderId } = await createProductionOrder(
        { product: "Oxford Shirt", styleCode: "WT-SH-100", qty: 2 },
        managerActor,
        db,
      );
      await approveProductionOrder(orderId, managerActor, db);
      const issue = await issueMaterial({ lotId, orderId, quantity: 4.0 }, storeActor, db);

      const src = await confirmCuttingSource(
        { orderId, issueId: issue.issueId, consumedQty: 4.0, wasteQty: 0.2, tagUid: "04EE5566" },
        cuttingActor,
        db,
      );
      expect(src.cuttingJobId).toBeDefined();

      try {
        await confirmCuttingSource(
          { orderId, issueId: issue.issueId, consumedQty: 4.0, tagUid: "04999999" },
          cuttingActor,
          db,
        );
        expect.unreachable("Should have rejected mismatched card");
      } catch (err: any) {
        expect(err.errorCode).toBe("WT_ERR_BUSINESS_RULE");
      }

      const g1 = await bindGarmentTag(
        { orderId, size: "M", tagUid: "04771122" },
        cuttingActor,
        db,
      );
      expect(g1.garmentCode).toMatch(/^SHIRT-\d{3}$/);
      expect(g1.publicId).toMatch(/^[a-z0-9][a-z0-9-]{7,127}$/);
      expect(g1.attributedFabric).toBe(2.0);

      const g2 = await bindGarmentTag(
        { orderId, size: "L", tagUid: "04882233" },
        cuttingActor,
        db,
      );
      expect(g2.garmentCode).not.toBe(g1.garmentCode);

      try {
        await bindGarmentTag({ orderId, size: "XL", tagUid: "04771122" }, cuttingActor, db);
        expect.unreachable("Should have rejected duplicate active card");
      } catch (err: any) {
        expect(err.errorCode).toBe("WT_ERR_ACTIVE_CARD");
      }
    });

    it("replaces a damaged/lost RFID card while preserving permanent garment identity, public ID, and lineage", async () => {
      const { lotId } = await receiveMaterialLot({ materialName: "Silk", quantity: 10.0 }, receivingActor, db);
      await acceptIncomingStockHelper(lotId, 10.0, "INSP-01", qcActor, db);
      const { orderId } = await createProductionOrder({ product: "Shirt", styleCode: "WT-SH-100", qty: 1 }, managerActor, db);
      await approveProductionOrder(orderId, managerActor, db);
      const issue = await issueMaterial({ lotId, orderId, quantity: 2.0 }, storeActor, db);
      await confirmCuttingSource({ orderId, issueId: issue.issueId, consumedQty: 2.0 }, cuttingActor, db);

      const g = await bindGarmentTag({ orderId, size: "M", tagUid: "04111111" }, cuttingActor, db);
      const originalPublicId = g.publicId;

      const replaceRes = await replaceGarmentCard(
        { garmentId: g.garmentId, newUid: "04222222", reason: "Bent antenna on card" },
        cuttingActor,
        db,
      );

      expect(replaceRes.newUid).toBe("04222222");
      expect(replaceRes.oldUid).toBe("04111111");
      expect(replaceRes.publicId).toBe(originalPublicId);

      const detail = await getGarmentDetail(g.garmentId, cuttingActor, db);
      expect(detail?.activeTagUid).toBe("04222222");
      expect(detail?.tagBindingsHistory.length).toBe(2);
      expect(detail?.tagBindingsHistory.find((b) => b.tagUid === "04111111")?.active).toBe(false);
      expect(detail?.tagBindingsHistory.find((b) => b.tagUid === "04222222")?.active).toBe(true);
    });
  });

  describe("Milestone 4 — Routine Assembly Advancement and Task Services", () => {
    it("advances routine assembly from stitching to finishing to QA handoff purely from card UID", async () => {
      const { lotId } = await receiveMaterialLot({ materialName: "Denim", quantity: 15.0 }, receivingActor, db);
      await acceptIncomingStockHelper(lotId, 15.0, "INSP-01", qcActor, db);
      const { orderId } = await createProductionOrder({ product: "Trouser", styleCode: "WT-TR-200", qty: 1 }, managerActor, db);
      await approveProductionOrder(orderId, managerActor, db);
      const issue = await issueMaterial({ lotId, orderId, quantity: 3.0 }, storeActor, db);
      await confirmCuttingSource({ orderId, issueId: issue.issueId, consumedQty: 3.0 }, cuttingActor, db);
      const g = await bindGarmentTag({ orderId, size: "32", tagUid: "04333333" }, cuttingActor, db);

      const stitch = await routineProductionScan(
        { tagUid: "04333333", stationCode: "stitching" },
        stitchingActor,
        db,
      );
      expect(stitch.accepted).toBe(true);
      expect(stitch.stage).toBe("finished");
      expect(stitch.nextExpectedStation).toBe("finishing");

      try {
        await routineProductionScan({ tagUid: "04333333", stationCode: "stitching" }, stitchingActor, db);
        expect.unreachable("Should have rejected wrong stage");
      } catch (err: any) {
        expect(err.errorCode).toBe("WT_ERR_WRONG_STAGE");
      }

      const finish = await routineProductionScan(
        { tagUid: "04333333", stationCode: "finishing" },
        finishingActor,
        db,
      );
      expect(finish.accepted).toBe(true);
      expect(finish.nextExpectedStation).toBe("final_qc");
      expect(finish.qualityDisposition).toBe("awaiting_inspection");
    });

    it("provides approved product and material data for Member 4 public journey builder", async () => {
      const { lotId } = await receiveMaterialLot({ materialName: "Organic Poplin", supplierCode: "SUP-GOTS", quantity: 10.0 }, receivingActor, db);
      await acceptIncomingStockHelper(lotId, 10.0, "INSP-01", qcActor, db);
      const { orderId } = await createProductionOrder({ product: "Oxford Shirt", styleCode: "WT-SH-100", qty: 1 }, managerActor, db);
      await approveProductionOrder(orderId, managerActor, db);
      const issue = await issueMaterial({ lotId, orderId, quantity: 2.0 }, storeActor, db);
      await confirmCuttingSource({ orderId, issueId: issue.issueId, consumedQty: 2.0 }, cuttingActor, db);
      const g = await bindGarmentTag({ orderId, size: "M", tagUid: "04444444" }, cuttingActor, db);

      const publicData = await getPublicProductMaterialData(g.publicId, db);
      expect(publicData).not.toBeNull();
      expect(publicData?.publicId).toBe(g.publicId);
      expect(publicData?.materialName).toBe("Organic Poplin");
      expect(publicData?.supplierName).toBe("GOTS Certified Organic Mills");
      expect(publicData?.attributedQuantity).toBe(2.0);
    });

    it("manages generic work tasks query, claim and assignment", async () => {
      state.work_tasks.push({
        id: "task-001",
        action_code: "inspect_lot",
        department_code: "quality",
        status: "queued",
        created_by: "u-receiving",
        created_at: new Date(),
        revision: 0,
      });

      const tasks = await listTasks(qcActor, { department: "quality" }, db);
      expect(tasks.length).toBeGreaterThan(0);

      const claimed = await claimTask("task-001", qcActor, db);
      expect(claimed.status).toBe("claimed");

      try {
        await claimTask("task-001", qcActor, db);
        expect.unreachable("Should have thrown task already claimed");
      } catch (err: any) {
        expect(err.errorCode).toBe("WT_ERR_TASK_ALREADY_CLAIMED");
      }

      const assigned = await assignTask("task-001", "u-qc", managerActor, db);
      expect(assigned.status).toBe("assigned");
    });
  });

  describe("Milestone 5 — Subject Revision & Concurrency Invariants", () => {
    it("increments garment and order revisions and rejects concurrency conflicts", async () => {
      const { orderId } = await createProductionOrder({ product: "Shirt", styleCode: "WT-SH-100", qty: 1 }, managerActor, db);
      const { lotId } = await receiveMaterialLot({ materialName: "Cotton", quantity: 10.0 }, receivingActor, db);
      await acceptIncomingStockHelper(lotId, 10.0, "INSP-01", qcActor, db);
      await approveProductionOrder(orderId, managerActor, db);
      const issue = await issueMaterial({ lotId, orderId, quantity: 2.0 }, storeActor, db);
      await confirmCuttingSource({ orderId, issueId: issue.issueId, consumedQty: 2.0 }, cuttingActor, db);
      const g = await bindGarmentTag({ orderId, size: "L", tagUid: "04555555" }, cuttingActor, db);

      const order = await db.production_orders.findUnique({ where: { id: orderId } });
      const currentOrderRev = order?.revision || 0;
      const nextOrderRev = await subjectRevisionService.incrementOrderRevision(orderId, currentOrderRev, db);
      expect(nextOrderRev).toBe(currentOrderRev + 1);

      try {
        await subjectRevisionService.incrementOrderRevision(orderId, 999, db);
        expect.unreachable("Should have thrown concurrency conflict");
      } catch (err: any) {
        expect(err.errorCode).toBe("WT_ERR_CONCURRENCY_CONFLICT");
      }

      const garment = await db.garments.findUnique({ where: { id: g.garmentId } });
      const currentGarmentRev = garment?.revision || 0;
      const nextGarmentRev = await subjectRevisionService.incrementGarmentRevision(g.garmentId, currentGarmentRev, db);
      expect(nextGarmentRev).toBe(currentGarmentRev + 1);

      try {
        await subjectRevisionService.incrementGarmentRevision(g.garmentId, 999, db);
        expect.unreachable("Should have thrown concurrency conflict");
      } catch (err: any) {
        expect(err.errorCode).toBe("WT_ERR_CONCURRENCY_CONFLICT");
      }
    });
  });

  describe("Milestone 6 — DomainScanHandler Registry Handlers", () => {
    it("executes FabricReceivingScanHandler through prepare and process phases", async () => {
      const { lotId } = await receiveMaterialLot({ materialName: "Linen", quantity: 10.0 }, receivingActor, db);
      const handler = new FabricReceivingScanHandler();

      const envelope: VersionedScanEnvelope = {
        version: "v1",
        deviceId: "dev-01",
        scanId: "scan-01",
        bootId: "boot-01",
        sequence: 1,
        readerIndex: 0,
        mappingVersion: 1,
        tagUid: "04666666",
        timestamp: new Date().toISOString(),
      };

      const prep = await handler.prepare(envelope, db);
      expect(prep.kind).toBe("material_lot");
      expect(prep.tagUid).toBe("04666666");
      expect(prep.tagBindingId).toBeDefined();

      const outcome = await handler.process(envelope, prep, db);
      expect(outcome.outcome).toBe("accepted");
      expect(outcome.outcomeCode).toBe("bundle_card_bound");
    });

    it("executes CuttingScanHandler: in prepare creates garment and active tag binding; in process attributes roll consumption", async () => {
      const { lotId } = await receiveMaterialLot({ materialName: "Denim", quantity: 20.0 }, receivingActor, db);
      await acceptIncomingStockHelper(lotId, 20.0, "INSP-01", qcActor, db);
      const { orderId } = await createProductionOrder({ product: "Jeans", styleCode: "WT-TR-200", qty: 2 }, managerActor, db);
      await approveProductionOrder(orderId, managerActor, db);
      const issue = await issueMaterial({ lotId, orderId, quantity: 4.0 }, storeActor, db);
      await confirmCuttingSource({ orderId, issueId: issue.issueId, consumedQty: 4.0 }, cuttingActor, db);

      const cuttingJob = state.cutting_jobs.find((cj) => cj.production_order_id === orderId);
      const cuttingInput = state.cutting_inputs.find((ci) => ci.cutting_job_id === cuttingJob.id);

      const actionContextId = "ctx-cut-001";
      state.rfid_action_contexts.push({
        id: actionContextId,
        cutting_job_id: cuttingJob.id,
        production_order_id: orderId,
        cutting_input_id: cuttingInput.id,
        answers: { size: "32" },
      });

      const handler = new CuttingScanHandler();
      const envelope: VersionedScanEnvelope = {
        version: "v1",
        deviceId: "dev-bench-01",
        scanId: "scan-cut-01",
        bootId: "boot-01",
        sequence: 2,
        readerIndex: 2,
        mappingVersion: 1,
        tagUid: "04777777",
        actionContextId,
        timestamp: new Date().toISOString(),
      };

      // Phase 1: prepare creates garment in tx.garments and active binding in tx.rfid_tag_bindings
      const prepared = await handler.prepare(envelope, db, {
        actor: cuttingActor,
        session: { id: "sess-01", deviceId: "dev-bench-01", readerIndex: 2, mappingVersion: 1, stationCode: "cutting", operatorId: "u-cutting", openedAt: new Date(), expiresAt: new Date(Date.now() + 3600000) },
      });

      expect(prepared.kind).toBe("garment");
      expect(prepared.isNewEnrollment).toBe(true);
      expect(prepared.tagUid).toBe("04777777");
      expect(prepared.tagBindingId).toBeDefined();

      // Verify garment was created in db with valid public ID
      const createdGarment = state.garments.find((g) => g.id === prepared.subjectId);
      expect(createdGarment).toBeDefined();
      expect(createdGarment.stage).toBe("cut");
      expect(createdGarment.public_id).toMatch(/^[a-z0-9][a-z0-9-]{7,127}$/);

      // Verify active tag binding in db
      const bindingInDb = state.rfid_tag_bindings.find((b) => b.id === prepared.tagBindingId);
      expect(bindingInDb).toBeDefined();
      expect(bindingInDb.garment_id).toBe(createdGarment.id);
      expect(bindingInDb.unbound_at).toBeNull();

      // Phase 2: process attributes roll consumption in tx.garment_material_inputs
      const outcome = await handler.process(envelope, prepared, db, {
        actor: cuttingActor,
        session: { id: "sess-01", deviceId: "dev-bench-01", readerIndex: 2, mappingVersion: 1, stationCode: "cutting", operatorId: "u-cutting", openedAt: new Date(), expiresAt: new Date(Date.now() + 3600000) },
      });

      expect(outcome.outcome).toBe("accepted");
      expect(outcome.outcomeCode).toBe("garment_enrolled");
      expect(outcome.nextExpectedStation).toBe("stitching");

      // Verify garment_material_inputs roll attribution
      const matInput = state.garment_material_inputs.find((m) => m.garment_id === prepared.subjectId);
      expect(matInput).toBeDefined();
      expect(matInput.cutting_job_id).toBe(cuttingJob.id);
      expect(matInput.cutting_input_id).toBe(cuttingInput.id);
    });

    it("executes routine production handlers: Stitching advances to stitched, Finishing advances to finished", async () => {
      // Setup a garment at cut stage with active tag 04888888
      const garmentId = "g-test-routine";
      state.garments.push({
        id: garmentId,
        code: "GAR-TEST-ROUTINE",
        public_id: "wt-routine-test-01",
        stage: "cut",
        quality_disposition: "awaiting_inspection",
        revision: 0,
      });
      state.rfid_tag_bindings.push({
        id: "bind-routine",
        garment_id: garmentId,
        tag_uid: "04888888",
        tag_identifier: "04888888",
        unbound_at: null,
      });

      // 1. Stitching Scan Handler
      const stitchingHandler = new StitchingScanHandler();
      const stitchEnv: VersionedScanEnvelope = {
        version: "v1",
        deviceId: "dev-bench-01",
        scanId: "scan-stitch-01",
        bootId: "boot-01",
        sequence: 3,
        readerIndex: 3,
        mappingVersion: 1,
        tagUid: "04888888",
        timestamp: new Date().toISOString(),
      };

      const prepStitch = await stitchingHandler.prepare(stitchEnv, db);
      expect(prepStitch.subjectId).toBe(garmentId);
      expect(prepStitch.tagBindingId).toBe("bind-routine");

      const stitchOutcome = await stitchingHandler.process(stitchEnv, prepStitch, db, {
        actor: stitchingActor,
        session: { id: "sess-02", deviceId: "dev-bench-01", readerIndex: 3, mappingVersion: 1, stationCode: "stitching", operatorId: "u-stitching", openedAt: new Date(), expiresAt: new Date(Date.now() + 3600000) },
      });
      expect(stitchOutcome.outcome).toBe("accepted");
      expect(stitchOutcome.outcomeCode).toBe("stitching_completed");
      expect(stitchOutcome.nextExpectedStation).toBe("finishing");

      const stitchedGarment = state.garments.find((g) => g.id === garmentId);
      expect(stitchedGarment.stage).toBe("stitched");
      expect(stitchedGarment.revision).toBe(1);

      // 2. Finishing Scan Handler
      const finishingHandler = new FinishingScanHandler();
      const finishEnv: VersionedScanEnvelope = {
        version: "v1",
        deviceId: "dev-bench-01",
        scanId: "scan-finish-01",
        bootId: "boot-01",
        sequence: 4,
        readerIndex: 4,
        mappingVersion: 1,
        tagUid: "04888888",
        timestamp: new Date().toISOString(),
      };

      const prepFinish = await finishingHandler.prepare(finishEnv, db);
      expect(prepFinish.subjectId).toBe(garmentId);

      const finishOutcome = await finishingHandler.process(finishEnv, prepFinish, db, {
        actor: finishingActor,
        session: { id: "sess-03", deviceId: "dev-bench-01", readerIndex: 4, mappingVersion: 1, stationCode: "finishing", operatorId: "u-finishing", openedAt: new Date(), expiresAt: new Date(Date.now() + 3600000) },
      });
      expect(finishOutcome.outcome).toBe("accepted");
      expect(finishOutcome.outcomeCode).toBe("finishing_completed");
      expect(finishOutcome.nextExpectedStation).toBe("final_qc");

      const finishedGarment = state.garments.find((g) => g.id === garmentId);
      expect(finishedGarment.stage).toBe("finished");
      expect(finishedGarment.revision).toBe(2);
    });

    it("verifies registration of all Member 2 handlers with ScanRoutingService", async () => {
      const { ScanRoutingService } = await import("../server/rfid/scan-router");
      const { registerMember2ScanHandlers } = await import("../server/rfid/domain-handlers");

      const router = new ScanRoutingService();
      registerMember2ScanHandlers(router);

      expect(router.getHandler("fabric_receiving")).toBeDefined();
      expect(router.getHandler("fabric_issue")).toBeDefined();
      expect(router.getHandler("cutting")).toBeDefined();
      expect(router.getHandler("stitching")).toBeDefined();
      expect(router.getHandler("finishing")).toBeDefined();
    });
  });

  describe("Milestone 7 — Express API Endpoints & Route Authorization", () => {
    const app = createExpressApp();

    it("verifies public/directory endpoints return success without auth", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/materials/suppliers`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
      } finally {
        server.close();
      }
    });

    it("verifies protected mutation endpoints strictly deny access when session token is missing", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/materials/lots`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ material: "Cotton", qty: 20 }),
        });
        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.success).toBe(false);
        expect(data.error.code).toBe("WT_ERR_UNAUTHORIZED");
      } finally {
        server.close();
      }
    });
  });
});
