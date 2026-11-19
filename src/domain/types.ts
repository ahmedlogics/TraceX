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

export type CredentialTokenStatus = "valid" | "expired" | "used" | "revoked";

export interface StaffCredentialToken {
  id: string;
  token: string;
  userId: string;
  kind: "invite" | "reset";
  status: CredentialTokenStatus;
  createdAt: string;
  expiresAt: string;
  usedAt?: string | undefined;
}

export interface StaffSession {
  id: string;
  userId: string;
  token: string;
  status: "active" | "revoked";
  createdAt: string;
  expiresAt: string;
  lastActiveAt: string;
  revokedAt?: string | undefined;
}

// ---------------------------------------------------------------- Product Specifications

export interface ProductSpecification {
  id: string;
  name: string;
  styleCode: string;
  category: "shirt" | "trouser" | "jacket" | "other";
  standardConsumptionMeters: number;
  sizeVariants: string[];
  active: boolean;
  version: number;
  description?: string | undefined;
}
}

// ---------------------------------------------------------------- RFID station / reader types

/** Nine logical RFID station codes matching the WearTrail database. */
export type RfidStationCode =
  | "fabric_receiving"
  | "fabric_issue"
  | "cutting"
  | "stitching"
  | "finishing"
  | "final_qc"
  | "packing"
  | "warehouse"
  | "dispatch";

/** Checkpoint / sensor ID.  Nine RFID readers + legacy IR codes kept for compatibility. */
export type SensorId =
  "S1" | "RAW_ISSUE" | "S2" | "S3" | "S4" | "FINAL_QC" | "S5" | "WAREHOUSE" | "S6";

/** RFID UID as normalised uppercase hex (4, 7 or 10 bytes). */
export type RfidUid = string;

/** Lifecycle of a mock-adapter action context. */
export type ActionContextStatus =
  "awaiting_ack" | "ready" | "processing" | "confirmed" | "expired" | "cancelled";

/** Station kind determines which panel is active. */
export type StationKind = "receiving" | "issue" | "cutting" | "routine" | "qa" | "fulfilment";

/** Typed DTO for a single reader session owned by one operator. */
export interface ReaderSession {
  /** Server-generated UUID for this session instance. */
  id: string;
  stationCode: RfidStationCode;
  operatorId: string;
  /** Whether the USB bridge reports this reader as connected. */
  connected: boolean;
  /** Whether the session is live (not expired/closed). */
  active: boolean;
  openedAt: string;
  expiresAt: string;
}

/** DTO for the current state of a station's reader. */
export interface StationReaderState {
  stationCode: RfidStationCode;
  checkpoint: SensorId;
  stationName: string;
  readerSession: ReaderSession | null;
  bridgeConnected: boolean;
  /** Most recent tag scan at this station (UID + timestamp). */
  lastScan: { uid: RfidUid; at: string } | null;
}

/** Immutable one-use action context — created server-side, consumed by one scan. */
export interface ActionContext {
  id: string; // server-generated UUID
  stationCode: RfidStationCode;
  operatorId: string;
  kind: ActionContextKind;
  /** Frozen payload at creation time — cannot be edited. */
  payload: ActionContextPayload;
  status: ActionContextStatus;
  createdAt: string;
  expiresAt: string;
  acknowledgedAt?: string | undefined;
  closedAt?: string | undefined;
}

export type ActionContextKind =
  | "assign_bundle_card" // Receiving: bind a fresh card to a lot
  | "confirm_issue" // Fabric Issue: scan bundle to confirm issue
  | "select_cutting_source" // Cutting: scan bundle to confirm source
  | "bind_garment_tag" // Cutting: scan fresh card to create a garment
  | "submit_qc" // QA: carry Pass/Fail + defect reason; no garment ID yet
  | "pack_garment" // Packing: scan garment into selected package
  | "warehouse_receive" // Warehouse: scan garment into selected bin
  | "dispatch_garment"; // Dispatch: scan garment against selected shipment

export type ActionContextPayload =
  | AssignBundleCardPayload
  | ConfirmIssuePayload
  | SelectCuttingSourcePayload
  | BindGarmentTagPayload
  | SubmitQcPayload
  | PackGarmentPayload
  | WarehouseReceivePayload
  | DispatchGarmentPayload;

export interface AssignBundleCardPayload {
  kind: "assign_bundle_card";
  lotId: string;
}

export interface ConfirmIssuePayload {
  kind: "confirm_issue";
  lotId: string;
  orderId: string;
  qty: number;
}

export interface SelectCuttingSourcePayload {
  kind: "select_cutting_source";
  orderId: string;
  issueId: string;
  consumedQty: number;
  wasteQty: number;
}

export interface BindGarmentTagPayload {
  kind: "bind_garment_tag";
  cuttingSourceSelectionId: string; // references confirmed source selection
  orderId: string;
  size: string;
}

export interface SubmitQcPayload {
  kind: "submit_qc";
  result: "pass" | "fail";
  defectReason?: string | undefined;
  checklist: ChecklistItem[];
  notes: string;
}

export interface PackGarmentPayload {
  kind: "pack_garment";
  packageId: string; // pre-selected open package
}

export interface WarehouseReceivePayload {
  kind: "warehouse_receive";
  binId: string;
}

export interface DispatchGarmentPayload {
  kind: "dispatch_garment";
  shipmentId: string;
}

/** Outcome of resolving an RFID scan against an action context. */
export type ScanResolution =
  | "accepted"
  | "rejected_unknown_card"
  | "rejected_wrong_subject_type"
  | "rejected_wrong_stage"
  | "rejected_duplicate"
  | "rejected_no_context"
  | "rejected_expired_context"
  | "rejected_business_rule"
  | "rejected_active_card";

export interface ScanOutcome {
  uid: RfidUid;
  resolution: ScanResolution;
  contextId?: string | undefined;
  /** Resolved garment/lot ID if identified. */
  subjectId?: string | undefined;
  /** Garment code shown after successful identification. */
  garmentCode?: string | undefined;
  /** Product name shown after successful identification. */
  productName?: string | undefined;
  /** Human-readable rejection reason. */
  rejectReason?: string | undefined;
  at: string;
}

/** Tag binding: maps a UID to a lot or garment. */
export interface RfidTagBinding {
  id: string;
  uid: RfidUid;
  subjectType: "lot" | "garment";
  subjectId: string;
  boundAt: string;
  boundBy: string;
  active: boolean;
  unboundAt?: string | undefined;
}

/** A confirmed source selection at Cutting. */
export interface CuttingSourceSelection {
  id: string;
  orderId: string;
  issueId: string;
  lotId: string;
  consumedQty: number;
  wasteQty: number;
  confirmedAt: string;
  confirmedBy: string;
  /** True while this source is selected for garment assignments. */
  active: boolean;
}

/** Mapping of one RFID reader position to its station. */
export interface RfidStationMapping {
  stationCode: RfidStationCode;
  stationName: string;
  checkpoint: SensorId;
  /** Board reader index as measured in bench verification (null = not yet verified). */
  measuredReaderIndex: number | null;
  verified: boolean;
  active: boolean;
}

// ---------------------------------------------------------------- existing types

export type LotStatus = "awaiting-inspection" | "accepted" | "rejected";

export interface MaterialLot {
  id: string;
  material: string;
  supplierRef: string;
  receivedQty: number;
  balanceQty: number;
  unit: "m" | "kg" | "pcs";
  receivedAt: string;
  receivedBy: string;
  status: LotStatus;
  incomingInspectionId?: string | undefined;
  /** Active RFID card UID, if bound. */
  rfidUid?: RfidUid | undefined;
}

export interface MaterialIssue {
  id: string;
  lotId: string;
  orderId: string;
  qty: number;
  at: string;
  by: string;
}

export type OrderStatus = "draft" | "planned" | "approved" | "in-progress" | "completed";

export interface ProductionOrder {
  id: string;
  product: string;
  styleCode: string;
  plannedQty: number;
  status: OrderStatus;
  dueDate: string;
  plannedBy: string;
  approvedBy?: string | undefined;
  approvedAt?: string | undefined;
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
  /** Active RFID card UID, if bound. */
  rfidUid?: RfidUid | undefined;
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
  /** Set when scan-confirmed (RFID flow). */
  rfidScanId?: string | undefined;
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
  | "settings"
  | "rfid";

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
  stationCode: RfidStationCode;
  stationName: string;
  enabled: boolean;
  verified: boolean;
  measuredReaderIndex: number | null;
}

export interface Settings {
  device: {
    boardId: string;
    firmware: string;
    status: "online" | "offline" | "disconnected";
    mappingVersion: number;
    bridgeSessionId?: string | undefined;
  };
  checkpoints: CheckpointSetting[];
  business: {
    defaultCarrier: string;
    reinspectionRequiredAfterRework: boolean;
    publicJourneyEnabled: boolean;
    shipmentCutoff: string;
  };
}

/** IR-compatible trigger outcome (kept for legacy workstation view). */
export type TriggerOutcome =
  "accepted" | "ignored-unarmed" | "rejected-wrong-checkpoint" | "ignored-duplicate";

export interface WorkstationSession {
  taskId?: string | undefined;
  armed: boolean;
  needsClear: boolean;
  log: { at: string; sensor: SensorId; outcome: TriggerOutcome; taskId?: string | undefined }[];
}

/** Active RFID station state for a staff session. */
export interface RfidStationState {
  stationCode: RfidStationCode;
  operatorId: string;
  /** Currently active action context, if any. */
  activeContextId?: string | undefined;
  /** Most recent scan outcome for persistent feedback. */
  lastScanOutcome?: ScanOutcome | undefined;
  /** For Cutting: the confirmed source selection. */
  cuttingSourceSelectionId?: string | undefined;
  /** For Cutting/Issue/Packing etc: last confirmed garment/lot ID. */
  lastConfirmedSubjectId?: string | undefined;
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
  // Member 4: Real credentials, sessions, and tokens
  credentials?: Record<string, string>; // userId -> passwordHash
  sessions?: StaffSession[];
  credentialTokens?: StaffCredentialToken[];
  // RFID additions
  rfidTagBindings: RfidTagBinding[];
  actionContexts: ActionContext[];
  cuttingSourceSelections: CuttingSourceSelection[];
  rfidStationStates: Record<string, RfidStationState>; // keyed by operatorId
  rfidScanLog: ScanOutcome[]; // most recent first, capped at 50
  productSpecs?: ProductSpecification[] | undefined;
}
