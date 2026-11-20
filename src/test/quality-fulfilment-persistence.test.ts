import { describe, it, expect, beforeEach } from "vitest";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { PrismaTransactionClient } from "../server/db/types";
import {
  executeIncomingQc,
  prepareQcContext,
  executeFinalQcScan,
  assignReworkCase,
  recordRepair,
  releaseHold,
  listInspections,
  getInspectionDetail,
  listReworkCases,
} from "../server/quality/quality-service";
import {
  getPersistedFulfilmentEligibility,
  createPackage,
  packGarment,
  sealPackage,
  receiveWarehouseStock,
  allocatePackageToShipment,
  verifyShipmentGarment,
  confirmShipmentDeparture,
  listPackages,
  listShipments,
} from "../server/fulfilment/fulfilment-service";
import { createExpressApp } from "../server/app";
import type { ActorContext, StaffRole, Department } from "../server/contracts/actor";

// ---------------------------------------------------------------- High-Fidelity Test Harness

const LOT_ID = "11111111-1111-4111-a111-111111111111";
const SHIRT_101_ID = "22222222-2222-4222-a222-222222222221";
const SHIRT_102_ID = "22222222-2222-4222-a222-222222222222";
const SHIRT_EARLY_ID = "22222222-2222-4222-a222-222222222223";
const BIN_ID = "33333333-3333-4333-a333-333333333333";
const SHIPMENT_ID = "55555555-5555-4555-a555-555555555555";
const USER_INSPECTOR_ID = "44444444-4444-4444-a444-444444444441";
const USER_INSPECTOR_2_ID = "44444444-4444-4444-a444-444444444442";
const USER_TECH_ID = "44444444-4444-4444-a444-444444444443";
const USER_MATERIALS_ID = "44444444-4444-4444-a444-444444444444";
const USER_PACKING_ID = "44444444-4444-4444-a444-444444444445";
const USER_DISPATCH_ID = "44444444-4444-4444-a444-444444444446";

function createActor(
  role: StaffRole,
  department: Department,
  username: string,
  actorId: string,
): ActorContext {
  return {
    actorId,
    username,
    displayName: username,
    role,
    department,
    authenticatedAt: new Date(),
  };
}

interface TestDataStore {
  staff_users: any[];
  checklist_versions: any[];
  devices: any[];
  device_mapping_versions: any[];
  device_reader_mappings: any[];
  staff_sessions: any[];
  reader_sessions: any[];
  material_lots: any[];
  material_stock_movements: any[];
  garments: any[];
  rfid_tag_bindings: any[];
  rfid_action_contexts: any[];
  rfid_scans: any[];
  inspections: any[];
  garment_holds: any[];
  rework_cases: any[];
  repair_records: any[];
  packages: any[];
  package_items: any[];
  warehouse_bins: any[];
  warehouse_stock: any[];
  warehouse_movements: any[];
  shipments: any[];
  shipment_packages: any[];
  public_payload_versions: any[];
  public_payload_commitments: any[];
  public_payload_outbox: any[];
  trace_events: any[];
  ledger_commitments: any[];
  ledger_outbox: any[];
}

function matchesCondition(item: any, cond: any): boolean {
  return Object.entries(cond).every(([k, v]) => {
    if (v === undefined) return true;
    if (v === null) return item[k] === null || item[k] === undefined;
    if (typeof v === "object" && !(v instanceof Date) && !Buffer.isBuffer(v)) {
      if ("not" in (v as any)) {
        const notVal = (v as any).not;
        if (notVal === null) return item[k] !== null && item[k] !== undefined;
        return item[k] !== notVal;
      }
      if ("in" in (v as any)) return ((v as any).in as any[]).includes(item[k]);
      if ("gt" in (v as any)) return item[k] > (v as any).gt;
      // Handle Prisma compound keys like device_id_version: { device_id, version }
      return Object.entries(v as any).every(([subK, subV]) => item[subK] === subV);
    }
    return item[k] === v;
  });
}

function createInMemoryPrismaTx(): PrismaTransactionClient {
  const store: TestDataStore = {
    staff_users: [],
    checklist_versions: [],
    devices: [],
    device_mapping_versions: [],
    device_reader_mappings: [],
    staff_sessions: [],
    reader_sessions: [],
    material_lots: [],
    material_stock_movements: [],
    garments: [],
    rfid_tag_bindings: [],
    rfid_action_contexts: [],
    rfid_scans: [],
    inspections: [],
    garment_holds: [],
    rework_cases: [],
    repair_records: [],
    packages: [],
    package_items: [],
    warehouse_bins: [],
    warehouse_stock: [],
    warehouse_movements: [],
    shipments: [],
    shipment_packages: [],
    public_payload_versions: [],
    public_payload_commitments: [],
    public_payload_outbox: [],
    trace_events: [],
    ledger_commitments: [],
    ledger_outbox: [],
  };

  const genericModel = (tableName: keyof TestDataStore) => ({
    findUnique: async ({ where }: any) => {
      const items = store[tableName];
      return items.find((item: any) => matchesCondition(item, where)) ?? null;
    },
    findFirst: async ({ where }: any = {}) => {
      const items = store[tableName];
      if (!where) return items[0] ?? null;
      return (
        items.find((item: any) => {
          if (where.OR && Array.isArray(where.OR)) {
            return where.OR.some((cond: any) => matchesCondition(item, cond));
          }
          return matchesCondition(item, where);
        }) ?? null
      );
    },
    findMany: async ({ where }: any = {}) => {
      let items = [...store[tableName]];
      if (where) {
        items = items.filter((item: any) => {
          if (where.OR && Array.isArray(where.OR)) {
            return where.OR.some((cond: any) => matchesCondition(item, cond));
          }
          return matchesCondition(item, where);
        });
      }
      return items;
    },
    create: async ({ data }: any) => {
      const created = {
        id: data.id || crypto.randomUUID(),
        created_at: new Date(),
        ...data,
      };
      store[tableName].push(created);
      return created;
    },
    update: async ({ where, data }: any) => {
      const item = store[tableName].find((x: any) => matchesCondition(x, where));
      if (!item) throw new Error(`Not found for update in ${tableName}`);
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === "object" && "increment" in v) {
          item[k] = (item[k] || 0) + (v as any).increment;
        } else {
          item[k] = v;
        }
      }
      return item;
    },
    updateMany: async ({ where, data }: any) => {
      const items = store[tableName].filter((x: any) => matchesCondition(x, where));
      for (const item of items) {
        Object.assign(item, data);
      }
      return { count: items.length };
    },
    count: async ({ where }: any = {}) => {
      if (!where) return store[tableName].length;
      return store[tableName].filter((item: any) => matchesCondition(item, where)).length;
    },
    upsert: async ({ where, create, update }: any) => {
      const item = store[tableName].find((x: any) => matchesCondition(x, where));
      if (item) {
        Object.assign(item, update);
        return item;
      }
      const created = {
        id: create.id || crypto.randomUUID(),
        ...create,
      };
      store[tableName].push(created);
      return created;
    },
  });

  const tx: any = {
    staff_users: genericModel("staff_users"),
    checklist_versions: genericModel("checklist_versions"),
    devices: genericModel("devices"),
    device_mapping_versions: genericModel("device_mapping_versions"),
    device_reader_mappings: genericModel("device_reader_mappings"),
    staff_sessions: genericModel("staff_sessions"),
    reader_sessions: genericModel("reader_sessions"),
    material_lots: genericModel("material_lots"),
    material_stock_movements: genericModel("material_stock_movements"),
    garments: genericModel("garments"),
    rfid_tag_bindings: genericModel("rfid_tag_bindings"),
    rfid_action_contexts: genericModel("rfid_action_contexts"),
    rfid_scans: genericModel("rfid_scans"),
    inspections: genericModel("inspections"),
    garment_holds: genericModel("garment_holds"),
    rework_cases: genericModel("rework_cases"),
    repair_records: genericModel("repair_records"),
    packages: genericModel("packages"),
    package_items: genericModel("package_items"),
    warehouse_bins: genericModel("warehouse_bins"),
    warehouse_stock: genericModel("warehouse_stock"),
    warehouse_movements: genericModel("warehouse_movements"),
    shipments: genericModel("shipments"),
    shipment_packages: genericModel("shipment_packages"),
    public_payload_versions: genericModel("public_payload_versions"),
    public_payload_commitments: genericModel("public_payload_commitments"),
    public_payload_outbox: genericModel("public_payload_outbox"),
    trace_events: genericModel("trace_events"),
    ledger_commitments: genericModel("ledger_commitments"),
    ledger_outbox: genericModel("ledger_outbox"),
  };

  // Relational queries for rfid_tag_bindings
  tx.rfid_tag_bindings.findFirst = async ({ where }: any) => {
    const raw = store.rfid_tag_bindings.find((b) => {
      if (b.unbound_at !== null) return false;
      if (where.OR && Array.isArray(where.OR)) {
        return where.OR.some((cond: any) => matchesCondition(b, cond));
      }
      return matchesCondition(b, where);
    });
    if (!raw) return null;
    const garment = raw.garment_id
      ? store.garments.find((g) => g.id === raw.garment_id)
      : null;
    const lot = raw.material_lot_id
      ? store.material_lots.find((l) => l.id === raw.material_lot_id)
      : null;
    return { ...raw, garments: garment, material_lots: lot };
  };

  // Relational queries for garments
  tx.garments.findFirst = async ({ where }: any) => {
    const g = store.garments.find((item) => {
      if (where.OR && Array.isArray(where.OR)) {
        return where.OR.some((cond: any) => matchesCondition(item, cond));
      }
      return matchesCondition(item, where);
    });
    if (!g) return null;
    const holds = store.garment_holds.filter((h) => h.garment_id === g.id && (h.released_at === null || h.released_at === undefined));
    const item = store.package_items.find((p) => p.garment_id === g.id && (p.removed_at === null || p.removed_at === undefined));
    const pkg = item ? store.packages.find((p) => p.id === item.package_id) : null;
    return {
      ...g,
      garment_holds: holds,
      package_items: item ? { ...item, packages: pkg } : null,
    };
  };

  // Relational queries for garment_holds
  tx.garment_holds.findFirst = async ({ where }: any) => {
    const h = store.garment_holds.find((item) => {
      if (where.id && item.id !== where.id) return false;
      if (where.released_at === null && item.released_at !== null && item.released_at !== undefined) return false;
      return true;
    });
    if (!h) return null;
    const g = store.garments.find((x) => x.id === h.garment_id);
    const rCases = store.rework_cases
      .filter((r) => r.hold_id === h.id)
      .map((r) => ({
        ...r,
        repair_records: store.repair_records.filter((rec) => rec.rework_case_id === r.id),
      }));
    return { ...h, garments: g, rework_cases: rCases };
  };

  // Relational queries for rework_cases
  tx.rework_cases.findFirst = async ({ where }: any) => {
    const r = store.rework_cases.find((item) => {
      if (where.OR && Array.isArray(where.OR)) {
        return where.OR.some((cond: any) => matchesCondition(item, cond));
      }
      return matchesCondition(item, where);
    });
    if (!r) return null;
    const repairs = store.repair_records.filter((rec) => rec.rework_case_id === r.id);
    return { ...r, repair_records: repairs };
  };

  // Relational queries for packages
  tx.packages.findFirst = async ({ where }: any) => {
    const p = store.packages.find((item) => {
      if (where.OR && Array.isArray(where.OR)) {
        return where.OR.some((cond: any) => matchesCondition(item, cond));
      }
      return matchesCondition(item, where);
    });
    if (!p) return null;
    const items = store.package_items
      .filter((pi) => pi.package_id === p.id && (pi.removed_at === null || pi.removed_at === undefined))
      .map((pi) => {
        const g = store.garments.find((x) => x.id === pi.garment_id);
        const holds = g ? store.garment_holds.filter((h) => h.garment_id === g.id && (h.released_at === null || h.released_at === undefined)) : [];
        return {
          ...pi,
          garments: g ? { ...g, garment_holds: holds } : null,
        };
      });
    return { ...p, package_items: items };
  };

  // Relational queries for shipments
  tx.shipments.findFirst = async ({ where }: any) => {
    const s = store.shipments.find((item) => {
      if (where.OR && Array.isArray(where.OR)) {
        return where.OR.some((cond: any) => matchesCondition(item, cond));
      }
      return matchesCondition(item, where);
    });
    if (!s) return null;
    const sPackages = store.shipment_packages
      .filter((sp) => sp.shipment_id === s.id && (sp.deallocated_at === null || sp.deallocated_at === undefined))
      .map((sp) => {
        const pkg = store.packages.find((p) => p.id === sp.package_id);
        const pItems = pkg
          ? store.package_items
              .filter((pi) => pi.package_id === pkg.id && (pi.removed_at === null || pi.removed_at === undefined))
              .map((pi) => {
                const g = store.garments.find((x) => x.id === pi.garment_id);
                const holds = g ? store.garment_holds.filter((h) => h.garment_id === g.id && (h.released_at === null || h.released_at === undefined)) : [];
                return {
                  ...pi,
                  garments: g ? { ...g, garment_holds: holds } : null,
                };
              })
          : [];
        return {
          ...sp,
          packages: {
            ...pkg,
            package_items: pItems,
          },
        };
      });
    return { ...s, shipment_packages: sPackages };
  };

  return tx as PrismaTransactionClient;
}

// ---------------------------------------------------------------- Test Suite

describe("Member 3: Real Quality & Fulfilment Persistence Suite", () => {
  let tx: PrismaTransactionClient;

  // Actors
  const qualityInspector = createActor("quality", "quality", "quality.inspector", USER_INSPECTOR_ID);
  const qualityInspector2 = createActor("quality", "quality", "quality.lead", USER_INSPECTOR_2_ID);
  const materialsStaff = createActor("materials", "receiving", "materials.staff", USER_MATERIALS_ID);
  const repairTechnician = createActor("production", "stitching", "repair.tech", USER_TECH_ID);
  const logisticsStaff = createActor("logistics", "packing", "packing.operator", USER_PACKING_ID);
  const dispatchStaff = createActor("logistics", "dispatch", "dispatch.operator", USER_DISPATCH_ID);

  beforeEach(async () => {
    tx = createInMemoryPrismaTx();

    // Seed Staff Users
    await tx.staff_users.create({ data: { id: USER_INSPECTOR_ID, username: "quality.inspector", display_name: "Quality Inspector" } });
    await tx.staff_users.create({ data: { id: USER_INSPECTOR_2_ID, username: "quality.lead", display_name: "Quality Lead" } });
    await tx.staff_users.create({ data: { id: USER_MATERIALS_ID, username: "materials.staff", display_name: "Materials Staff" } });
    await tx.staff_users.create({ data: { id: USER_TECH_ID, username: "repair.tech", display_name: "Repair Technician" } });
    await tx.staff_users.create({ data: { id: USER_PACKING_ID, username: "packing.operator", display_name: "Packing Operator" } });
    await tx.staff_users.create({ data: { id: USER_DISPATCH_ID, username: "dispatch.operator", display_name: "Dispatch Operator" } });

    // Seed Material Lot FAB-100
    await tx.material_lots.create({
      data: {
        id: LOT_ID,
        code: "FAB-100",
        supplier_id: "supp-1",
        material_name: "100% Organic Cotton Poplin",
        unit: "m",
        received_quantity: 100,
        available_accepted_quantity: 0,
        received_by: materialsStaff.actorId,
      },
    });

    // Seed Garments
    await tx.garments.create({
      data: {
        id: SHIRT_101_ID,
        code: "SHIRT-101",
        public_id: "PUB-SHIRT-101",
        cutting_job_id: "job-1",
        production_order_id: "order-1",
        stage: "finished",
        quality_disposition: "awaiting_inspection",
      },
    });

    await tx.garments.create({
      data: {
        id: SHIRT_102_ID,
        code: "SHIRT-102",
        public_id: "PUB-SHIRT-102",
        cutting_job_id: "job-1",
        production_order_id: "order-1",
        stage: "finished",
        quality_disposition: "awaiting_inspection",
      },
    });

    await tx.garments.create({
      data: {
        id: SHIRT_EARLY_ID,
        code: "SHIRT-EARLY",
        public_id: "PUB-SHIRT-EARLY",
        cutting_job_id: "job-1",
        production_order_id: "order-1",
        stage: "stitched", // wrong stage for Final QA!
        quality_disposition: "awaiting_inspection",
      },
    });

    // Bind RFID Tags
    await tx.rfid_tag_bindings.create({
      data: {
        id: "bind-fabric-bundle",
        tag_identifier: "04:FA:B1:00",
        tag_uid: "04FAB100",
        material_lot_id: LOT_ID,
        tag_technology: "iso14443a",
        bound_by: materialsStaff.actorId,
        unbound_at: null,
      },
    });

    await tx.rfid_tag_bindings.create({
      data: {
        id: "bind-shirt-101",
        tag_identifier: "04:E1:01:AA",
        tag_uid: "04E101AA",
        garment_id: SHIRT_101_ID,
        tag_technology: "iso14443a",
        bound_by: qualityInspector.actorId,
        unbound_at: null,
      },
    });

    await tx.rfid_tag_bindings.create({
      data: {
        id: "bind-shirt-102",
        tag_identifier: "04:E1:02:BB",
        tag_uid: "04E102BB",
        garment_id: SHIRT_102_ID,
        tag_technology: "iso14443a",
        bound_by: qualityInspector.actorId,
        unbound_at: null,
      },
    });

    await tx.rfid_tag_bindings.create({
      data: {
        id: "bind-shirt-early",
        tag_identifier: "04:EA:RL:YY",
        tag_uid: "04EARLYY",
        garment_id: SHIRT_EARLY_ID,
        tag_technology: "iso14443a",
        bound_by: qualityInspector.actorId,
        unbound_at: null,
      },
    });

    // Seed Warehouse Bin
    await tx.warehouse_bins.create({
      data: {
        id: BIN_ID,
        code: "W1-A1",
        label: "Warehouse 1 - Rack A - Bin 1",
        active: true,
      },
    });
  });

  // ---------------------------------------------------------------- Milestone 1
  describe("Milestone 1: Lot-Level Incoming QC & Stock Acceptance", () => {
    it("denies materials staff from approving their own incoming QC", async () => {
      await expect(
        executeIncomingQc(tx, materialsStaff, {
          lotId: LOT_ID,
          acceptedQty: 100,
          heldQty: 0,
          rejectedQty: 0,
          answers: { spec_check: true },
          result: "pass",
        }),
      ).rejects.toThrow(/WT_ERR_FORBIDDEN/i);
    });

    it("enforces strict quantity balancing against received quantity", async () => {
      // 50 + 10 + 0 !== 100 (received)
      await expect(
        executeIncomingQc(tx, qualityInspector, {
          lotId: LOT_ID,
          acceptedQty: 50,
          heldQty: 10,
          rejectedQty: 0,
          answers: { spec_check: true },
          result: "pass",
        }),
      ).rejects.toThrow(/WT_ERR_QUANTITY_MISMATCH/i);
    });

    it("rejects passing inspection if checklist items failed", async () => {
      await expect(
        executeIncomingQc(tx, qualityInspector, {
          lotId: LOT_ID,
          acceptedQty: 100,
          heldQty: 0,
          rejectedQty: 0,
          answers: { spec_check: true, visual_check: false },
          result: "pass",
        }),
      ).rejects.toThrow(/WT_ERR_CHECKLIST_INCOMPLETE/i);
    });

    it("rejects failing inspection if defect reason is missing", async () => {
      await expect(
        executeIncomingQc(tx, qualityInspector, {
          lotId: LOT_ID,
          acceptedQty: 0,
          heldQty: 0,
          rejectedQty: 100,
          answers: {},
          result: "fail",
          defectReason: "",
        }),
      ).rejects.toThrow(/WT_ERR_DEFECT_REQUIRED/i);
    });

    it("atomically records passing incoming inspection, stock movement, and updates available balance", async () => {
      const result = await executeIncomingQc(tx, qualityInspector, {
        lotId: LOT_ID,
        acceptedQty: 90,
        heldQty: 10,
        rejectedQty: 0,
        answers: { spec_check: true, visual_check: true },
        notes: "High quality poplin, minor roll edge held for test",
        result: "pass",
      });

      expect(result.status).toBe("accepted");
      expect(result.acceptedQty).toBe(90);
      expect(result.heldQty).toBe(10);
      expect(result.availableAcceptedQty).toBe(90);

      // Verify material lot available stock is updated
      const lot = await tx.material_lots.findUnique({ where: { id: LOT_ID } });
      expect(lot!.available_accepted_quantity).toBe(90);

      // Verify stock movement logged
      const movements = await tx.material_stock_movements.findMany({ where: { material_lot_id: LOT_ID } });
      expect(movements.length).toBe(1);
      expect(movements[0]!.kind).toBe("accepted");
      expect(movements[0]!.quantity).toBe(90);

      // Verify inspection record
      const insp = await tx.inspections.findUnique({ where: { id: result.inspectionId } });
      expect(insp!.scope).toBe("incoming");
      expect(insp!.outcome).toBe("pass");
    });
  });

  // ---------------------------------------------------------------- Milestone 2
  describe("Milestone 2: Persisted Result-First Final QA & Card Resolution", () => {
    it("rejects preparing QC action context by unauthorized role", async () => {
      await expect(
        prepareQcContext(tx, materialsStaff, {
          stationCode: "final_qc",
          scope: "final",
          outcome: "pass",
          answers: { c1: true },
        }),
      ).rejects.toThrow(/WT_ERR_FORBIDDEN/i);
    });

    it("rejects presenting a fabric bundle card at Final QA station", async () => {
      const context = await prepareQcContext(tx, qualityInspector, {
        stationCode: "final_qc",
        scope: "final",
        outcome: "pass",
        answers: { c1: true },
      });

      const scanResult = await executeFinalQcScan(tx, qualityInspector, {
        tagUid: "04FAB100",
        actionContextId: context.contextId,
      });

      expect(scanResult.accepted).toBe(false);
      expect(scanResult.rejectionCode).toBe("WT_ERR_WRONG_SUBJECT_TYPE");
      expect(scanResult.rejectionReason).toMatch(/Expected garment card/i);
    });

    it("rejects presenting garment at wrong stage (stitched instead of finished)", async () => {
      const context = await prepareQcContext(tx, qualityInspector, {
        stationCode: "final_qc",
        scope: "final",
        outcome: "pass",
        answers: { c1: true },
      });

      const scanResult = await executeFinalQcScan(tx, qualityInspector, {
        tagUid: "04EARLYY",
        actionContextId: context.contextId,
      });

      expect(scanResult.accepted).toBe(false);
      expect(scanResult.rejectionCode).toBe("WT_ERR_WRONG_STAGE");
      expect(scanResult.rejectionReason).toMatch(/expected 'finished'/i);
    });

    it("commits Pass inspection, marks context consumed, and updates disposition to released", async () => {
      const context = await prepareQcContext(tx, qualityInspector, {
        stationCode: "final_qc",
        scope: "final",
        outcome: "pass",
        answers: { c1: true, c2: true },
        notes: "Flawless stitching and seam work",
      });

      const scanResult = await executeFinalQcScan(tx, qualityInspector, {
        tagUid: "04E101AA",
        actionContextId: context.contextId,
      });

      expect(scanResult.accepted).toBe(true);
      expect(scanResult.outcome).toBe("pass");
      expect(scanResult.qualityDisposition).toBe("released");
      expect(scanResult.holdOpened).toBe(false);

      // Verify garment disposition in DB
      const garment = await tx.garments.findUnique({ where: { id: SHIRT_101_ID } });
      expect(garment!.quality_disposition).toBe("released");

      // Verify context is consumed
      const ctx = await tx.rfid_action_contexts.findUnique({ where: { id: context.contextId } });
      expect(ctx!.status).toBe("consumed");

      // Verify RFID scan recorded
      const scans = await tx.rfid_scans.findMany({ where: { garment_id: SHIRT_101_ID } });
      expect(scans.length).toBe(1);
      expect(scans[0]!.outcome).toBe("accepted");
    });

    it("commits Fail inspection, sets disposition to held, and atomically opens hold and rework case", async () => {
      const context = await prepareQcContext(tx, qualityInspector, {
        stationCode: "final_qc",
        scope: "final",
        outcome: "fail",
        defectReason: "Skipped sleeve seam stitching",
        answers: { c1: false, c2: true },
      });

      const scanResult = await executeFinalQcScan(tx, qualityInspector, {
        tagUid: "04E102BB",
        actionContextId: context.contextId,
      });

      expect(scanResult.accepted).toBe(true);
      expect(scanResult.outcome).toBe("fail");
      expect(scanResult.qualityDisposition).toBe("held");
      expect(scanResult.holdOpened).toBe(true);
      expect(scanResult.holdId).toBeDefined();
      expect(scanResult.reworkCaseId).toBeDefined();

      // Verify garment disposition is held
      const garment = await tx.garments.findUnique({ where: { id: SHIRT_102_ID } });
      expect(garment!.quality_disposition).toBe("held");

      // Verify garment hold in DB
      const hold = await tx.garment_holds.findUnique({ where: { id: scanResult.holdId! } });
      expect(hold!.kind).toBe("quality");
      expect(hold!.reason).toBe("Skipped sleeve seam stitching");
      expect(hold!.released_at).toBeUndefined();

      // Verify rework case in DB
      const rwk = await tx.rework_cases.findUnique({ where: { id: scanResult.reworkCaseId! } });
      expect(rwk!.status).toBe("open");
      expect(rwk!.description).toBe("Skipped sleeve seam stitching");
    });
  });

  // ---------------------------------------------------------------- Milestone 3
  describe("Milestone 3: Rework Lifecycle, Repair Recording, and Independent QC Enforcement", () => {
    let holdId: string;
    let reworkCaseId: string;

    beforeEach(async () => {
      // Create initial failed inspection and hold on SHIRT-102
      const context = await prepareQcContext(tx, qualityInspector, {
        stationCode: "final_qc",
        scope: "final",
        outcome: "fail",
        defectReason: "Loose cuff seam",
        answers: { c1: false },
      });
      const res = await executeFinalQcScan(tx, qualityInspector, {
        tagUid: "04E102BB",
        actionContextId: context.contextId,
      });
      holdId = res.holdId!;
      reworkCaseId = res.reworkCaseId!;
    });

    it("assigns rework case to target department", async () => {
      const updated = await assignReworkCase(tx, qualityInspector, {
        reworkCaseId,
        departmentCode: "stitching",
      });
      expect(updated.status).toBe("assigned");
      expect(updated.assigned_department_code).toBe("stitching");
    });

    it("records repair by technician and prepares open reinspection link", async () => {
      await assignReworkCase(tx, qualityInspector, {
        reworkCaseId,
        departmentCode: "stitching",
      });

      const repair = await recordRepair(tx, repairTechnician, {
        reworkCaseId,
        workSummary: "Restitched left cuff with reinforced double hem",
      });

      expect(repair.repairRecordId).toBeDefined();
      expect(repair.reinspectionId).toBeDefined();

      const rwk = await tx.rework_cases.findUnique({ where: { id: reworkCaseId } });
      expect(rwk!.status).toBe("repair_recorded");

      const insp = await tx.inspections.findUnique({ where: { id: repair.reinspectionId } });
      expect(insp!.scope).toBe("reinspection");
    });

    it("ENFORCES INDEPENDENT QC: technician who repaired cannot approve reinspection or release hold", async () => {
      await assignReworkCase(tx, qualityInspector, { reworkCaseId, departmentCode: "stitching" });
      await recordRepair(tx, repairTechnician, {
        reworkCaseId,
        workSummary: "Restitched cuff",
      });

      // 1. Technician tries to reinspect their own repair at QA
      const context = await prepareQcContext(tx, qualityInspector, {
        stationCode: "final_qc",
        scope: "reinspection",
        outcome: "pass",
        answers: { c1: true },
      });

      // Repair technician attempts to scan and approve their own repair
      const selfScan = await executeFinalQcScan(tx, repairTechnician, {
        tagUid: "04E102BB",
        actionContextId: context.contextId,
      });

      expect(selfScan.accepted).toBe(false);
      expect(selfScan.rejectionCode).toBe("WT_ERR_FORBIDDEN"); // Technician is not Q role

      // Even if technician was granted QA, assertIndependentInspector denies self-approval
      const selfRelease = releaseHold(tx, repairTechnician, {
        holdId,
        releaseReason: "Self-approval attempted",
      });
      await expect(selfRelease).rejects.toThrow(/WT_ERR_FORBIDDEN|WT_ERR_INDEPENDENT_QC/i);
    });

    it("allows independent quality inspector to reinspect and release hold", async () => {
      await assignReworkCase(tx, qualityInspector, { reworkCaseId, departmentCode: "stitching" });
      await recordRepair(tx, repairTechnician, {
        reworkCaseId,
        workSummary: "Restitched cuff cleanly",
      });

      // Independent inspector conducts passing reinspection
      const context = await prepareQcContext(tx, qualityInspector2, {
        stationCode: "final_qc",
        scope: "reinspection",
        outcome: "pass",
        answers: { c1: true },
        notes: "Independent reinspection passed. Cuff hem conforms to spec.",
      });

      const reinspectScan = await executeFinalQcScan(tx, qualityInspector2, {
        tagUid: "04E102BB",
        actionContextId: context.contextId,
      });
      expect(reinspectScan.accepted).toBe(true);
      expect(reinspectScan.outcome).toBe("pass");

      // Independent inspector releases hold
      const releaseResult = await releaseHold(tx, qualityInspector2, {
        holdId,
        releaseReason: "Passing independent reinspection verified",
      });

      expect(releaseResult.released).toBe(true);
      expect(releaseResult.garmentQualityDisposition).toBe("released");

      // Verify hold in DB
      const hold = await tx.garment_holds.findUnique({ where: { id: holdId } });
      expect(hold!.released_at).toBeDefined();
      expect(hold!.released_by).toBe(qualityInspector2.actorId);

      // Verify rework case closed
      const rwk = await tx.rework_cases.findUnique({ where: { id: reworkCaseId } });
      expect(rwk!.status).toBe("closed");

      // Verify garment disposition is released
      const garment = await tx.garments.findUnique({ where: { id: SHIRT_102_ID } });
      expect(garment!.quality_disposition).toBe("released");
    });
  });

  // ---------------------------------------------------------------- Milestone 4
  describe("Milestone 4: Gated Packaging, Warehouse Binning, and Authoritative Departure Gate", () => {
    let pkgId: string;

    beforeEach(async () => {
      // Release SHIRT-101
      const context = await prepareQcContext(tx, qualityInspector, {
        stationCode: "final_qc",
        scope: "final",
        outcome: "pass",
        answers: { c1: true },
      });
      await executeFinalQcScan(tx, qualityInspector, {
        tagUid: "04E101AA",
        actionContextId: context.contextId,
      });

      // Create open carton
      const pkg = await createPackage(tx, logisticsStaff, { code: "CARTON-201" });
      pkgId = pkg.id;
    });

    it("evaluates fulfilment eligibility: blocks packing when garment has an active hold", async () => {
      // Put SHIRT-102 on hold
      await tx.garment_holds.create({
        data: {
          id: "hold-test-late",
          garment_id: SHIRT_102_ID,
          kind: "quality",
          reason: "Fabric spot detected",
          opened_by: qualityInspector.actorId,
        },
      });
      await tx.garments.update({
        where: { id: SHIRT_102_ID },
        data: { quality_disposition: "held" },
      });

      // Check eligibility directly
      const eligibility = await getPersistedFulfilmentEligibility(tx, SHIRT_102_ID, "packing");
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.hasActiveHold).toBe(true);
      expect(eligibility.blockingReasons.length).toBeGreaterThan(0);

      // Attempt to pack into carton
      await expect(
        packGarment(tx, logisticsStaff, {
          packageId: pkgId,
          garmentId: SHIRT_102_ID,
        }),
      ).rejects.toThrow(/WT_ERR_QUALITY_GATE/i);
    });

    it("prevents sealing an empty package", async () => {
      await expect(sealPackage(tx, logisticsStaff, pkgId)).rejects.toThrow(/WT_ERR_EMPTY_PACKAGE/i);
    });

    it("packs released garment into carton and seals carton", async () => {
      const packed = await packGarment(tx, logisticsStaff, {
        packageId: pkgId,
        garmentId: SHIRT_101_ID,
      });
      expect(packed.garmentId).toBe(SHIRT_101_ID);

      const g = await tx.garments.findUnique({ where: { id: SHIRT_101_ID } });
      expect(g!.stage).toBe("packed");

      const sealed = await sealPackage(tx, logisticsStaff, pkgId);
      expect(sealed.status).toBe("sealed");
    });

    it("receives sealed carton into warehouse bin and advances stage to warehoused", async () => {
      await packGarment(tx, logisticsStaff, { packageId: pkgId, garmentId: SHIRT_101_ID });
      await sealPackage(tx, logisticsStaff, pkgId);

      const binned = await receiveWarehouseStock(tx, logisticsStaff, {
        garmentId: SHIRT_101_ID,
        binId: "W1-A1",
      });

      expect(binned.binId).toBe(BIN_ID);

      // Verify warehouse stock record
      const stock = await tx.warehouse_stock.findUnique({ where: { package_id: pkgId } });
      expect(stock!.current_bin_id).toBe(BIN_ID);

      // Verify garment stage transitioned to warehoused
      const g = await tx.garments.findUnique({ where: { id: SHIRT_101_ID } });
      expect(g!.stage).toBe("warehoused");

      const pkg = await tx.packages.findUnique({ where: { id: pkgId } });
      expect(pkg!.status).toBe("warehoused");
    });

    it("LOCKED DEPARTURE GATE: late hold placed on manifest garment blocks departure until resolved", async () => {
      // 1. Pack and bin SHIRT-101
      await packGarment(tx, logisticsStaff, { packageId: pkgId, garmentId: SHIRT_101_ID });
      await sealPackage(tx, logisticsStaff, pkgId);
      await receiveWarehouseStock(tx, logisticsStaff, { garmentId: SHIRT_101_ID, binId: "W1-A1" });

      // 2. Create outbound shipment
      const shipment = await tx.shipments.create({
        data: {
          id: SHIPMENT_ID,
          code: "SHIP-901",
          status: "approved",
          created_by: dispatchStaff.actorId,
        },
      });

      // 3. Allocate carton to shipment
      await allocatePackageToShipment(tx, dispatchStaff, shipment.id, pkgId);

      // 4. Verify garment dispatch scan (S6)
      const verifyRes = await verifyShipmentGarment(tx, dispatchStaff, {
        shipmentId: shipment.id,
        garmentId: SHIRT_101_ID,
      });
      expect(verifyRes.verified).toBe(true);

      // 5. Late Quality Recall Hold added AFTER verification scan!
      const lateHold = await tx.garment_holds.create({
        data: {
          id: "hold-recall-late",
          garment_id: SHIRT_101_ID,
          kind: "recall",
          reason: "Fabric lot color bleed recall notice",
          opened_by: qualityInspector.actorId,
        },
      });
      await tx.garments.update({
        where: { id: SHIRT_101_ID },
        data: { quality_disposition: "held" },
      });

      // 6. Attempt departure: MUST BE BLOCKED BY THE AUTHORITATIVE GATE!
      await expect(confirmShipmentDeparture(tx, dispatchStaff, shipment.id)).rejects.toThrow(
        /WT_ERR_DEPARTURE_GATE_FAILED.*active hold/i,
      );

      // 7. Clear recall hold and release garment
      await tx.garment_holds.update({
        where: { id: lateHold.id },
        data: {
          released_at: new Date(),
          released_by: qualityInspector.actorId,
          release_reason: "Recall check cleared for this lot",
        },
      });
      await tx.garments.update({
        where: { id: SHIRT_101_ID },
        data: { quality_disposition: "released" },
      });

      // 8. Re-evaluate departure: DEPARTURE SUCCEEDS!
      const departure = await confirmShipmentDeparture(tx, dispatchStaff, shipment.id);
      expect(departure.status).toBe("dispatched");
      expect(departure.dispatchedGarmentCount).toBe(1);

      // Verify shipment, package, and garment stages
      const s = await tx.shipments.findUnique({ where: { id: shipment.id } });
      expect(s!.status).toBe("dispatched");
      expect(s!.departed_at).toBeDefined();

      const p = await tx.packages.findUnique({ where: { id: pkgId } });
      expect(p!.status).toBe("dispatched");

      const g = await tx.garments.findUnique({ where: { id: SHIRT_101_ID } });
      expect(g!.stage).toBe("dispatched");
    });
  });

  // ---------------------------------------------------------------- Milestone 5
  describe("Milestone 5: Express HTTP Endpoints Pipeline", () => {
    it("serves GET /api/quality/inspections with 200 OK", async () => {
      const app = createExpressApp();
      const server = app.listen(0);

      try {
        const address = server.address() as AddressInfo;
        const port = address.port;

        const res = await fetch(`http://127.0.0.1:${port}/api/quality/inspections`, {
          headers: {
            "x-actor-role": "quality",
            "x-actor-dept": "quality",
            "x-actor-username": "qa.test",
          },
        });

        const body = (await res.json()) as any;
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it("denies unauthenticated request to /api/quality/incoming-qc in production mode", async () => {
      const origEnv = process.env["NODE_ENV"];
      process.env["NODE_ENV"] = "production";

      const app = createExpressApp();
      const server = app.listen(0);

      try {
        const address = server.address() as AddressInfo;
        const port = address.port;

        const res = await fetch(`http://127.0.0.1:${port}/api/quality/incoming-qc`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lotId: LOT_ID, acceptedQty: 10, heldQty: 0, rejectedQty: 0 }),
        });

        expect(res.status).toBe(401);
        const body = (await res.json()) as any;
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("WT_ERR_UNAUTHORIZED");
      } finally {
        process.env["NODE_ENV"] = origEnv;
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it("serves GET /api/fulfilment/packages with 200 OK", async () => {
      const app = createExpressApp();
      const server = app.listen(0);

      try {
        const address = server.address() as AddressInfo;
        const port = address.port;

        const res = await fetch(`http://127.0.0.1:${port}/api/fulfilment/packages`, {
          headers: {
            "x-actor-role": "logistics",
            "x-actor-dept": "packing",
            "x-actor-username": "packing.test",
          },
        });

        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });
});
