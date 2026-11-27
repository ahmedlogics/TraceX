/**
 * Mock and Authoritative access rules.
 * Route access is by role; operational actions are checked by role AND department/grants.
 */
import type {
  Department,
  Garment,
  Inspection,
  RfidStationCode,
  ReworkCase,
  Role,
  StaffUser,
  Task,
} from "./types";
import { type ActorContext, assertIndependentRepairReinspection } from "./actor";

export * from "./actor";

export type RouteKey =
  | "account"
  | "home"
  | "tasks"
  | "workstation"
  | "rawStore"
  | "materialLots"
  | "materialLot"
  | "productionOrders"
  | "productionOrder"
  | "garments"
  | "garment"
  | "quality"
  | "inspection"
  | "rework"
  | "reworkCase"
  | "fulfilment"
  | "shipments"
  | "shipment"
  | "ledger"
  | "audit"
  | "reports"
  | "adminUsers"
  | "settings"
  | "nfcHub"
  | "warehouseLocator"
  | "productPassports";

const ALL: Role[] = ["A", "M", "O", "P", "Q", "L"];

export const routeAccess: Record<RouteKey, Role[]> = {
  account: ALL,
  home: ALL,
  tasks: ["M", "O", "P", "Q", "L"],
  workstation: ["M", "O", "P", "Q", "L"],
  rawStore: ["M", "O", "Q", "A", "P", "L"],
  materialLots: ["M", "O", "Q"],
  materialLot: ["M", "O", "Q"],
  productionOrders: ["M", "A", "P", "O", "Q"],
  productionOrder: ["M", "A", "P", "O", "Q"],
  garments: ["M", "P", "Q", "L"],
  garment: ["M", "P", "Q", "L"],
  quality: ["M", "Q"],
  inspection: ["M", "Q"],
  rework: ["M", "P", "Q"],
  reworkCase: ["M", "P", "Q"],
  fulfilment: ["M", "L"],
  shipments: ["M", "L"],
  shipment: ["M", "L"],
  ledger: ["M"],
  audit: ["A", "M"],
  reports: ["A", "M"],
  adminUsers: ["A"],
  settings: ["A", "M"],
  nfcHub: ["M"],
  warehouseLocator: ["A", "M"],
  productPassports: ["A", "M"],
};

export function canAccessRoute(user: StaffUser | null, key: RouteKey): boolean {
  if (!user || user.status !== "active") return false;

  // Ledger screen removed for admin.demo
  if (key === "ledger" && (user.role === "A" || user.username === "admin.demo")) {
    return false;
  }

  // NFC Tag Passport screen is strictly reserved for manager.demo
  if (key === "nfcHub") {
    return user.username === "manager.demo" || user.role === "M";
  }

  // Stitching and Finishing operators: Home, Workstation, Garments, and Rework screens
  if (
    user.username === "stitching.demo" ||
    user.department?.toLowerCase() === "stitching" ||
    user.username === "finishing.demo" ||
    user.department?.toLowerCase() === "finishing"
  ) {
    const shopAllowed: RouteKey[] = [
      "account",
      "home",
      "tasks",
      "workstation",
      "garments",
      "garment",
      "rework",
      "reworkCase",
    ];
    return shopAllowed.includes(key);
  }

  // Receiving operators only handle materials/receiving, not production orders
  if (
    (user.username === "receiving.demo" || user.department === "receiving") &&
    (key === "productionOrders" || key === "productionOrder")
  ) {
    return false;
  }

  // Cutting operators operate on their workstation table by scanning bundle cards, not production orders screen
  if (
    (user.username === "cutting.demo" || user.department === "cutting") &&
    (key === "productionOrders" || key === "productionOrder")
  ) {
    return false;
  }

  // Raw Store operators strictly operate at Station 2 (Fabric Issue) Workstation
  if (
    user.username === "rawstore.demo" ||
    user.department?.toLowerCase() === "raw-store" ||
    user.department?.toLowerCase() === "raw_store"
  ) {
    if (
      key === "materialLots" ||
      key === "materialLot" ||
      key === "productionOrders" ||
      key === "productionOrder" ||
      key === "garments" ||
      key === "garment"
    ) {
      return false;
    }
  }
  // Warehouse operators: strictly Workstation and Fulfilment/Warehouse Stock
  // (NO shipments, NO garments full factory list)
  if (
    user.username === "warehouse.demo" ||
    user.department?.toLowerCase() === "warehouse"
  ) {
    if (
      key === "shipments" ||
      key === "shipment" ||
      key === "garments" ||
      key === "garment"
    ) {
      return false;
    }
  }

  // Dispatch operators strictly operate at Station 9 Workstation dock gate (remove garments, fulfilment, and shipments)
  if (
    user.username === "dispatch.demo" ||
    (user.role === "L" && user.department === "dispatch") ||
    user.department?.toLowerCase() === "dispatch"
  ) {
    if (
      key === "garments" ||
      key === "garment" ||
      key === "fulfilment" ||
      key === "shipments" ||
      key === "shipment"
    ) {
      return false;
    }
  }

  // Packing operators only handle workstation box cartoning (strictly remove garments, fulfilment, and shipments)
  if (
    user.username === "packing.demo" ||
    (user.role === "L" && user.department === "packing")
  ) {
    if (
      key === "garments" ||
      key === "garment" ||
      key === "fulfilment" ||
      key === "shipments" ||
      key === "shipment"
    ) {
      return false;
    }
  }
  // Strict role + department scoping for Quality Inspector role (Q)
  if (user.role === "Q") {
    const isIncomingQc = user.username?.toLowerCase() === "qc.incoming";

    if (isIncomingQc) {
      // Incoming Material QC Inspector: strictly Home, Tasks, Material Lots
      const incomingAllowed: RouteKey[] = [
        "account",
        "home",
        "tasks",
        "materialLots",
        "materialLot",
        "inspection",
      ];
      return incomingAllowed.includes(key);
    }

    // Line / Final QA Inspector (e.g. qc.demo): strictly Quality and Rework (no Home screen)
    const isFinalQc = user.username?.toLowerCase() === "qc.demo";
    const finalQcAllowed: RouteKey[] = isFinalQc
      ? [
          "account",
          "quality",
          "inspection",
          "rework",
          "reworkCase",
        ]
      : [
          "account",
          "home",
          "quality",
          "inspection",
          "rework",
          "reworkCase",
        ];
    return finalQcAllowed.includes(key);
  }

  return routeAccess[key]?.includes(user.role) ?? false;
}

const is = (u: StaffUser, role: Role, dept?: Department) =>
  u.status === "active" && u.role === role && (!dept || u.department === dept);

/** Action permissions. Each returns true when the actor may perform it. */
export const can = {
  createLot: (u: StaffUser) =>
    u.status === "active" &&
    (u.role === "M" ||
      u.role === "A" ||
      (u.role === "O" && (u.department === "receiving" || u.username === "receiving.demo"))),
  receiveLot: (u: StaffUser) => is(u, "O", "receiving"),
  issueMaterial: (u: StaffUser) =>
    u.status === "active" &&
    (u.role === "M" ||
      u.role === "A" ||
      (u.role === "O" && (u.department === "raw-store" || u.username === "rawstore.demo"))),
  planOrder: (u: StaffUser) =>
    u.status === "active" &&
    (u.role === "M" ||
      u.role === "A" ||
      (u.role === "O" && (u.department === "raw-store" || u.username === "rawstore.demo"))),
  approveOrder: (u: StaffUser) =>
    u.status === "active" &&
    (u.role === "M" ||
      u.role === "A" ||
      (u.role === "O" && (u.department === "raw-store" || u.username === "rawstore.demo"))),
  accessNfcHub: (u: StaffUser) =>
    u.status === "active" && (u.username === "manager.demo" || u.role === "M"),
  claimTask: (u: StaffUser, t: Task) =>
    u.role !== "M" && u.department === t.department && t.status === "open",
  assignTask: (u: StaffUser) => is(u, "M"),
  useWorkstationTask: (u: StaffUser, t: Task) =>
    u.department === t.department && t.status !== "done",

  // RFID station access: operator must be in the station's department (or manager reads)
  operateStation: (u: StaffUser, stationCode: RfidStationCode): boolean => {
    if (u.status !== "active") return false;
    if (u.role === "M" || u.role === "A") return true; // manager / admin can supervise any station

    // Dedicated receiving operator only handles fabric_receiving
    if (u.username === "receiving.demo") {
      return stationCode === "fabric_receiving";
    }
    if (u.username === "rawstore.demo") {
      return stationCode === "fabric_issue";
    }

    const stationDepts: Record<RfidStationCode, Department[]> = {
      fabric_receiving: ["receiving"],
      fabric_issue: ["raw-store"],
      cutting: ["cutting"],
      stitching: ["stitching"],
      finishing: ["finishing"],
      final_qc: ["quality"],
      packing: ["packing"],
      warehouse: ["warehouse"],
      dispatch: ["dispatch"],
    };
    const allowed = stationDepts[stationCode];
    return allowed ? allowed.includes(u.department) : false;
  },

  // RFID scan actions
  assignBundleCard: (u: StaffUser) => is(u, "O", "receiving"),
  confirmIssue: (u: StaffUser) => is(u, "O", "raw-store"),
  operateCutting: (u: StaffUser) =>
    u.status === "active" && u.role === "P" && u.department === "cutting",
  operateStitching: (u: StaffUser) =>
    u.status === "active" && u.role === "P" && u.department === "stitching",
  operateFinishing: (u: StaffUser) =>
    u.status === "active" && u.role === "P" && u.department === "finishing",

  /** Inspector only. Managers have read-only inspection access. Independent reinspection rule enforced. */
  submitInspection: (u: StaffUser, i: Inspection, repairPerformerId?: string) => {
    if (!is(u, "Q") || i.status !== "open") return false;
    if (i.kind === "reinspection" && repairPerformerId && u.id === repairPerformerId) return false;
    return true;
  },
  /** Inspector: prepare QC context (choose Pass/Fail before scanning). */
  prepareQcContext: (u: StaffUser) => is(u, "Q"),
  /** Independent inspector: inspector cannot approve their own repair. */
  approveReinspection: (u: StaffUser, reworkCase?: ReworkCase | null) =>
    is(u, "Q") && (!reworkCase?.repairedBy || reworkCase.repairedBy !== u.id),
  /** Inspector only, and only after a passing reinspection. Repair operators and repair performers can never release. */
  releaseHold: (u: StaffUser, g: Garment, latest?: Inspection, reworkCase?: ReworkCase | null | string) => {
    if (!is(u, "Q") || !g.hold || latest?.kind !== "reinspection" || latest.status !== "passed") {
      return false;
    }
    const performerId = typeof reworkCase === "string" ? reworkCase : reworkCase?.repairedBy;
    if (performerId && u.id === performerId) return false;
    return true;
  },
  assignRework: (u: StaffUser, c: ReworkCase) => is(u, "M") && c.status === "awaiting-assignment",
  completeRework: (u: StaffUser, c: ReworkCase) =>
    (u.role === "P" && c.status === "assigned" && c.assignedDepartment === u.department) ||
    (u.role === "Q" && (c.status === "assigned" || c.status === "repaired" || c.assignedDepartment === "quality")) ||
    (u.role === "M"),
  packGarment: (u: StaffUser) => is(u, "L", "packing"),
  receiveStock: (u: StaffUser) => is(u, "L", "warehouse"),
  allocateStock: (u: StaffUser) => is(u, "L", "warehouse"),
  planShipment: (u: StaffUser) => is(u, "M"),
  /** Dispatch staff only. Packing users cannot dispatch; managers plan but do not depart. */
  confirmDeparture: (u: StaffUser) => is(u, "L", "dispatch"),
  retryLedger: (u: StaffUser) => is(u, "A"),
  manageUsers: (u: StaffUser) => is(u, "A"),
  editDeviceSettings: (u: StaffUser) => is(u, "A"),
  editBusinessSettings: (u: StaffUser) => is(u, "M"),
};

/** Which garment-detail sections a role may see. */
export function garmentSections(u: StaffUser) {
  return {
    source: true,
    inspections: ["M", "Q", "P"].includes(u.role),
    logistics: ["M", "L"].includes(u.role),
    proof: u.role === "M",
    holds: true,
    rfidCard: ["M", "A"].includes(u.role),
  };
}
