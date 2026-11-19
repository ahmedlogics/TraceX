/**
 * Mock access rules (UI simulation only — the Express API must enforce its own).
 * Route access is by role; actions are checked by role AND department.
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

export type RouteKey =
  | "account"
  | "home"
  | "tasks"
  | "workstation"
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
  | "settings";

const ALL: Role[] = ["A", "M", "O", "P", "Q", "L"];

export const routeAccess: Record<RouteKey, Role[]> = {
  account: ALL,
  home: ALL,
  tasks: ["M", "O", "P", "Q", "L"],
  workstation: ["M", "O", "P", "Q", "L"],
  materialLots: ["M", "O", "Q"],
  materialLot: ["M", "O", "Q"],
  productionOrders: ["M", "O", "P", "Q"],
  productionOrder: ["M", "O", "P", "Q"],
  garments: ["M", "P", "Q", "L"],
  garment: ["M", "P", "Q", "L"],
  quality: ["M", "Q"],
  inspection: ["M", "Q"],
  rework: ["M", "P", "Q"],
  reworkCase: ["M", "P", "Q"],
  fulfilment: ["M", "L"],
  shipments: ["M", "L"],
  shipment: ["M", "L"],
  ledger: ["A", "M"],
  audit: ["A", "M", "Q"],
  reports: ["A", "M", "Q"],
  adminUsers: ["A"],
  settings: ["A", "M"],
};

export function canAccessRoute(user: StaffUser | null, key: RouteKey): boolean {
  return !!user && user.status === "active" && routeAccess[key].includes(user.role);
}

const is = (u: StaffUser, role: Role, dept?: Department) =>
  u.status === "active" && u.role === role && (!dept || u.department === dept);

/** Action permissions. Each returns true when the actor may perform it. */
export const can = {
  receiveLot: (u: StaffUser) => is(u, "O", "receiving"),
  issueMaterial: (u: StaffUser) => is(u, "O", "raw-store"),
  planOrder: (u: StaffUser) => is(u, "M"),
  approveOrder: (u: StaffUser) => is(u, "M"),
  claimTask: (u: StaffUser, t: Task) =>
    u.role !== "M" && u.department === t.department && t.status === "open",
  assignTask: (u: StaffUser) => is(u, "M"),
  useWorkstationTask: (u: StaffUser, t: Task) =>
    u.department === t.department && t.status !== "done",

  // RFID station access: operator must be in the station's department (or manager reads)
  operateStation: (u: StaffUser, stationCode: RfidStationCode): boolean => {
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
    if (u.role === "M") return true; // manager can read any station
    const allowed = stationDepts[stationCode];
    return u.status === "active" && allowed.includes(u.department);
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

  /** Inspector only. Managers have read-only inspection access. */
  submitInspection: (u: StaffUser, i: Inspection) => is(u, "Q") && i.status === "open",
  /** Inspector: prepare QC context (choose Pass/Fail before scanning). */
  prepareQcContext: (u: StaffUser) => is(u, "Q"),
  /** Independent inspector: inspector cannot approve their own repair. */
  approveReinspection: (u: StaffUser, reworkCase?: ReworkCase | null) =>
    is(u, "Q") && (!reworkCase?.repairedBy || reworkCase.repairedBy !== u.id),
  /** Inspector only, and only after a passing reinspection. Repair operators and repair performers can never release. */
  releaseHold: (u: StaffUser, g: Garment, latest?: Inspection, reworkCase?: ReworkCase | null) =>
    is(u, "Q") &&
    !!g.hold &&
    latest?.kind === "reinspection" &&
    latest.status === "passed" &&
    (!reworkCase?.repairedBy || reworkCase.repairedBy !== u.id),
  assignRework: (u: StaffUser, c: ReworkCase) => is(u, "M") && c.status === "awaiting-assignment",
  completeRework: (u: StaffUser, c: ReworkCase) =>
    u.role === "P" && c.status === "assigned" && c.assignedDepartment === u.department,
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
