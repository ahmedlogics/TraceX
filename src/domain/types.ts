/**
 * Internal WearTrail domain types (staff-side).
 * Public shopper data uses the separate projection types in ./public-types.ts.
 * Lifecycle stage, quality disposition and ledger status are deliberately separate fields.
 */

export type Role = "A" | "M" | "O" | "P" | "Q" | "L";

export type Department =
  | "technical-admin"
  | "planning"
  | "receiving"
  | "raw-store"
  | "cutting"
  | "stitching"
  | "finishing"
  | "quality"
  | "packing"
  | "warehouse"
  | "dispatch";

export type StaffStatus = "active" | "invited" | "suspended";

export interface StaffUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  department: Department;
  email: string;
  status: StaffStatus;
  scope: string;
}

export type SensorId = "S1" | "S2" | "S3" | "S4" | "S5" | "S6";

export type LotStatus = "awaiting-inspection" | "accepted" | "rejected";

export interface MaterialLot {
  id: string;
  material: string;
  supplierRef: string;
  receivedQty: number;
  balanceQty: number;
  unit: "m";
  receivedAt: string;
  receivedBy: string;
  status: LotStatus;
  incomingInspectionId?: string | undefined;
}

export interface MaterialIssue {
  id: string;
  lotId: string;
  orderId: string;
  qty: number;
  at: string;
  by: string;
}

export type OrderStatus = "planned" | "in-progress" | "completed";

export interface ProductionOrder {
  id: string;
  product: string;
  styleCode: string;
  plannedQty: number;
  status: OrderStatus;
  dueDate: string;
  plannedBy: string;
}

/** A labelled panel set cut from actual issued fabric; links lot -> order -> garment. */
export interface CuttingOutput {
  id: string;
  orderId: string;
  lotId: string;
  issueId: string;
  panelSetLabel: string;
  fabricUsed: number;
  garmentId: string;
  at: string;
  by: string;
}

export type LifecycleStage =
  | "cutting"
  | "stitching"
  | "finishing"
  | "final-qc"
  | "rework"
  | "packing"
  | "warehouse"
  | "allocated"
  | "dispatched";

export type QualityDisposition =
  | "not-inspected"
  | "awaiting-inspection"
  | "passed"
  | "failed"
  | "reinspection-pending"
  | "released";

export type LedgerStatus = "not-queued" | "pending" | "submitted" | "failed" | "confirmed";

export interface GarmentHold {
  reason: string;
  since: string;
  inspectionId: string;
  reworkCaseId?: string | undefined;
}

export interface Garment {
  id: string;
  orderId: string;
  publicId: string;
  productName: string;
  size: string;
  cuttingOutputId: string;
  stage: LifecycleStage;
  disposition: QualityDisposition;
  hold: GarmentHold | null;
  packageId?: string | undefined;
  shipmentId?: string | undefined;
}

export interface GarmentEvent {
  id: string;
  garmentId: string;
  at: string;
  label: string;
  detail?: string | undefined;
  actorId?: string | undefined;
  department?: Department | undefined;
}

export type InspectionKind = "incoming" | "final" | "reinspection";
export type InspectionStatus = "open" | "passed" | "failed";

export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface Inspection {
  id: string;
  kind: InspectionKind;
  subjectType: "lot" | "garment";
  subjectId: string;
  status: InspectionStatus;
  assigneeId?: string | undefined;
  checklist: ChecklistItem[];
  notes: string;
  defectReason?: string | undefined;
  submittedAt?: string | undefined;
  submittedBy?: string | undefined;
  createdAt: string;
  previousInspectionId?: string | undefined;
}

export type ReworkStatus = "awaiting-assignment" | "assigned" | "repaired" | "closed";

export interface ReworkCase {
  id: string;
  garmentId: string;
  inspectionId: string;
  defectReason: string;
  status: ReworkStatus;
  assignedDepartment?: Department | undefined;
  assignedBy?: string | undefined;
  repairNote?: string | undefined;
  repairedBy?: string | undefined;
  reinspectionId?: string | undefined;
  createdAt: string;
  history: { at: string; label: string; actorId?: string | undefined }[];
}

export type TaskKind =
  | "receive-lot"
  | "incoming-qc"
  | "issue-material"
  | "cut"
  | "stitch"
  | "finish"
  | "final-qc-presentation"
  | "rework"
  | "pack"
  | "warehouse-receive"
  | "allocate"
  | "dispatch";

export type TaskStatus = "open" | "claimed" | "done";

export interface Task {
  id: string;
  kind: TaskKind;
  title: string;
  department: Department;
  subjectType: "lot" | "order" | "garment" | "shipment" | "inspection" | "rework";
  subjectId: string;
  checkpoint?: SensorId | undefined;
  status: TaskStatus;
  assigneeId?: string | undefined;
  createdAt: string;
  observation?: { at: string; sensor: SensorId } | undefined;
  completedAt?: string | undefined;
}

export type PackageStatus = "open" | "sealed";

export interface Package {
  id: string;
  garmentIds: string[];
  status: PackageStatus;
  packedBy: string;
  createdAt: string;
}

export type ShipmentStatus = "draft" | "planned" | "departed";

export interface Shipment {
  id: string;
  destination: string;
  carrier: string;
  status: ShipmentStatus;
  garmentIds: string[];
  allocatedGarmentIds: string[];
  plannedBy: string;
  plannedDate: string;
  departedAt?: string | undefined;
  departedBy?: string | undefined;
}

export interface LedgerCommitment {
  id: string;
  subjectType: "lot" | "order" | "garment" | "shipment";
  subjectId: string;
  milestone: string;
  status: Exclude<LedgerStatus, "not-queued">;
  digest: string;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  lastError?: string | undefined;
}

export type AuditCategory =
  | "auth"
  | "admin"
  | "materials"
  | "production"
  | "quality"
  | "rework"
  | "logistics"
  | "workstation"
  | "ledger"
  | "settings";

export interface AuditEvent {
  id: string;
  at: string;
  actorId: string;
  category: AuditCategory;
  event: string;
  subjectType: string;
  subjectId: string;
  detail?: string | undefined;
}

export interface CheckpointSetting {
  sensor: SensorId;
  label: string;
  department: Department;
  enabled: boolean;
}

export interface Settings {
  device: { boardId: string; firmware: string; status: "online" | "offline" };
  checkpoints: CheckpointSetting[];
  business: {
    defaultCarrier: string;
    reinspectionRequiredAfterRework: boolean;
    publicJourneyEnabled: boolean;
    shipmentCutoff: string;
  };
}

export type TriggerOutcome =
  | "accepted"
  | "ignored-unarmed"
  | "rejected-wrong-checkpoint"
  | "ignored-duplicate";

export interface WorkstationSession {
  taskId?: string | undefined;
  armed: boolean;
  needsClear: boolean;
  log: { at: string; sensor: SensorId; outcome: TriggerOutcome; taskId?: string | undefined }[];
}

export interface DemoState {
  version: number;
  users: StaffUser[];
  lots: MaterialLot[];
  issues: MaterialIssue[];
  orders: ProductionOrder[];
  cuttingOutputs: CuttingOutput[];
  garments: Garment[];
  garmentEvents: GarmentEvent[];
  inspections: Inspection[];
  rework: ReworkCase[];
  tasks: Task[];
  packages: Package[];
  shipments: Shipment[];
  ledger: LedgerCommitment[];
  audit: AuditEvent[];
  settings: Settings;
  workstations: Record<string, WorkstationSession>;
  counters: Record<string, number>;
}
