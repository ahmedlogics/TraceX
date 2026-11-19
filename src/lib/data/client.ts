/**
 * WearTrailClient — the ONLY data boundary feature views use.
 *
 * Today: createMockClient() (src/mock/mock-client.ts) runs everything in the browser.
 * Later: implement this interface with fetch() calls to the Express API
 * (which talks to PostgreSQL on Supabase). Each method notes the suggested endpoint.
 * The server must derive the actor from its own session/token, never from the client.
 *
 * RFID integration seam:
 *   - prepareActionContext / acknowledgeContext / cancelContext / resolveRfidScan
 *     correspond to POST /rfid/contexts, PUT /rfid/contexts/:id/ack,
 *     DELETE /rfid/contexts/:id, POST /rfid/scan.
 *   - routineScan corresponds to POST /rfid/routine-scan.
 *   - The Express bridge receives JSON lines from the USB serial port, authenticates
 *     the device credential, and broadcasts scan results as Server-Sent Events.
 *     React subscribes through RfidTransport (src/mock/rfid-transport.ts in mock mode).
 *   - getStationState returns current scan feedback for persistent panel display.
 */
import type { PublicJourney, PublicProof } from "@/domain/public-types";
import type {
  ActionContext,
  ActionContextKind,
  ActionContextPayload,
  AuditEvent,
  ChecklistItem,
  CuttingOutput,
  CuttingSourceSelection,
  Department,
  Garment,
  GarmentEvent,
  Inspection,
  LedgerCommitment,
  MaterialIssue,
  MaterialLot,
  Package,
  ProductSpecification,
  ProductionOrder,
  RfidStationCode,
  RfidStationState,
  RfidTagBinding,
  ReworkCase,
  Role,
  ScanOutcome,
  SensorId,
  Settings,
  Shipment,
  StaffUser,
  Task,
  TriggerOutcome,
  WorkstationSession,
} from "@/domain/types";

export interface EligibilityCheck {
  label: string;
  ok: boolean;
  detail?: string | undefined;
}

export interface DashboardData {
  metrics: { label: string; value: number; hint?: string | undefined }[];
  assigned: Task[];
  alerts: { tone: "danger" | "warning" | "info"; message: string; href?: string | undefined }[];
}

export interface LotDetail {
  lot: MaterialLot;
  inspection?: Inspection | undefined;
  issues: MaterialIssue[];
  cuttingOutputs: CuttingOutput[];
  orders: ProductionOrder[];
  rfidBinding?: RfidTagBinding | undefined;
}

export interface OrderDetail {
  order: ProductionOrder;
  issues: MaterialIssue[];
  cuttingOutputs: CuttingOutput[];
  garments: Garment[];
}

export interface GarmentDetail {
  garment: Garment;
  events: GarmentEvent[];
  cuttingOutput?: CuttingOutput | undefined;
  lot?: MaterialLot | undefined;
  order?: ProductionOrder | undefined;
  inspections: Inspection[];
  rework: ReworkCase[];
  pkg?: Package | undefined;
  shipment?: Shipment | undefined;
  ledger: LedgerCommitment[];
  rfidBinding?: RfidTagBinding | undefined;
}

export interface InspectionDetail {
  inspection: Inspection;
  garment?: Garment | undefined;
  lot?: MaterialLot | undefined;
  reworkCase?: ReworkCase | undefined;
  latestForSubject?: Inspection | undefined;
}

export interface ReworkDetail {
  reworkCase: ReworkCase;
  garment: Garment;
  inspections: Inspection[];
}

export interface FulfilmentData {
  awaitingPacking: Garment[];
  packedAwaitingReceipt: Garment[];
  inStock: Garment[];
  blocked: Garment[];
  packages: Package[];
  openShipments: Shipment[];
}

export interface ShipmentDetail {
  shipment: Shipment;
  garments: Garment[];
  eligibility: EligibilityCheck[];
  dispatchTask?: Task | undefined;
  candidates: Garment[];
}

export interface WorkstationData {
  session: WorkstationSession;
  tasks: Task[];
  selected?: Task | undefined;
  subjectLabel?: string | undefined;
}

export interface ReportsData {
  counts: { label: string; value: number }[];
  rows: { label: string; columns: Record<string, string | number> }[];
  columns: string[];
}

/** Current state of a staff member's RFID station session. */
export interface RfidStationData {
  stationCode: RfidStationCode;
  stationName: string;
  operatorId: string;
  bridgeConnected: boolean;
  /** Active context, if any. */
  activeContext?: ActionContext | undefined;
  /** Last scan result for persistent panel feedback. */
  lastScanOutcome?: ScanOutcome | undefined;
  /** Cutting: confirmed source selection still active. */
  cuttingSourceSelection?: CuttingSourceSelection | undefined;
  /** Last confirmed subject (garment/lot id shown in panel). */
  lastConfirmedSubjectId?: string | undefined;
}

export interface WearTrailClient {
  // Session & directory — GET /staff (directory), GET /me, POST /auth/login
  listDemoAccounts(): Promise<StaffUser[]>;
  getUser(id: string): Promise<StaffUser | null>;
  /** Names/roles for display (all signed-in staff). */
  listDirectory(): Promise<StaffUser[]>;
  checkCredentialToken(
    token: string,
  ): Promise<"valid" | "expired" | "used" | "revoked" | "unknown">;
  getCredentialTokenDetails(token: string): Promise<{
    status: "valid" | "expired" | "used" | "revoked" | "unknown";
    username?: string | undefined;
    kind?: "invite" | "reset" | undefined;
  }>;
  consumeCredentialToken(token: string, newPassword: string): Promise<void>;
  authenticate(username: string, password: string): Promise<StaffUser>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  signOutOtherSessions(): Promise<void>;
  recordSignIn(userId: string): Promise<void>;
  recordSignOut(): Promise<void>;

  // Home — GET /dashboard
  getDashboard(): Promise<DashboardData>;

  // Tasks — GET /tasks, POST /tasks/:id/claim, POST /tasks/:id/assign
  listTasks(): Promise<Task[]>;
  claimTask(taskId: string): Promise<void>;
  assignTask(taskId: string, userId: string): Promise<void>;

  // Workstation (legacy IR path) — GET /workstation, POST /workstation/{select,arm,trigger,clear,handover}
  getWorkstation(): Promise<WorkstationData>;
  selectWorkstationTask(taskId: string): Promise<void>;
  armCheckpoint(): Promise<void>;
  simulateTrigger(sensor: SensorId): Promise<TriggerOutcome>;
  clearCheckpoint(): Promise<void>;
  handOverTask(): Promise<void>;

  // RFID Station — GET /rfid/station, POST /rfid/contexts, PUT /rfid/contexts/:id/ack,
  //                DELETE /rfid/contexts/:id, POST /rfid/scan, POST /rfid/routine-scan
  getRfidStationData(stationCode: RfidStationCode): Promise<RfidStationData>;
  prepareActionContext(
    stationCode: RfidStationCode,
    kind: ActionContextKind,
    payload: ActionContextPayload,
  ): Promise<string>;
  acknowledgeContext(contextId: string): Promise<void>;
  cancelContext(contextId: string): Promise<void>;
  /** Resolve a tag UID scan: returns the outcome (accepted or rejected with reason). */
  resolveRfidScan(uid: string): Promise<ScanOutcome>;
  /** Routine scan at Stitching or Finishing: identifies garment and advances stage. */
  routineScan(uid: string, stationCode: "stitching" | "finishing"): Promise<ScanOutcome>;
  /** Staff-only: simulate a scan event (mock only). */
  simulateRfidScan(uid: string): Promise<ScanOutcome>;

  // Materials — GET /material-lots, GET /material-lots/:id, POST /material-lots, POST /material-lots/:id/issues
  listLots(): Promise<MaterialLot[]>;
  getLot(id: string): Promise<LotDetail | null>;
  receiveLot(input: {
    material: string;
    supplierRef: string;
    qty: number;
    unit?: "m" | "kg" | "pcs";
  }): Promise<string>;
  issueMaterial(input: { lotId: string; orderId: string; qty: number }): Promise<string>;

  // Production — GET /production-orders(/:id), POST /production-orders, POST /production-orders/:id/approve,
  //              POST /production-orders/:id/cutting-outputs
  listProductSpecs(): Promise<ProductSpecification[]>;
  saveProductSpec(input: Omit<ProductSpecification, "version">): Promise<string>;
  listOrders(): Promise<ProductionOrder[]>;
  getOrder(id: string): Promise<OrderDetail | null>;
  planOrder(input: {
    product: string;
    styleCode: string;
    qty: number;
    dueDate: string;
  }): Promise<string>;
  approveOrder(orderId: string): Promise<void>;
  recordCuttingOutput(input: {
    orderId: string;
    issueId: string;
    fabricUsed: number;
    size: string;
  }): Promise<string>;

  // Garments — GET /garments(/:id)
  listGarments(): Promise<Garment[]>;
  getGarment(id: string): Promise<GarmentDetail | null>;
  replaceGarmentCard(garmentId: string, newUid: string): Promise<ScanOutcome>;

  // Quality — GET /inspections(/:id), POST /inspections/:id/result, POST /garments/:id/release-hold
  listInspections(): Promise<Inspection[]>;
  getInspection(id: string): Promise<InspectionDetail | null>;
  submitInspection(input: {
    inspectionId: string;
    checklist: ChecklistItem[];
    notes: string;
    result: "pass" | "fail";
    defectReason?: string | undefined;
  }): Promise<void>;
  submitIncomingQc(input: {
    lotId: string;
    inspectionId: string;
    acceptedQty: number;
    heldQty: number;
    rejectedQty: number;
    checklist: ChecklistItem[];
    notes: string;
    result: "pass" | "fail";
    defectReason?: string | undefined;
  }): Promise<void>;
  releaseHold(garmentId: string): Promise<void>;

  // Rework — GET /rework(/:id), POST /rework/:id/assign, POST /rework/:id/complete
  listRework(): Promise<ReworkCase[]>;
  getRework(id: string): Promise<ReworkDetail | null>;
  assignRework(caseId: string, department: Department): Promise<void>;
  completeRework(caseId: string, note: string): Promise<void>;

  // Fulfilment & shipments
  getFulfilment(): Promise<FulfilmentData>;
  packGarment(garmentId: string): Promise<string>;
  createPackage(): Promise<string>;
  sealPackage(packageId: string): Promise<void>;
  receiveStock(garmentId: string): Promise<void>;
  allocateStock(garmentId: string, shipmentId: string): Promise<void>;
  listShipments(): Promise<Shipment[]>;
  getShipment(id: string): Promise<ShipmentDetail | null>;
  planShipment(input: {
    destination: string;
    carrier: string;
    plannedDate: string;
  }): Promise<string>;
  updateShipmentPlan(input: {
    shipmentId: string;
    garmentIds: string[];
    markPlanned: boolean;
  }): Promise<void>;
  verifyGarmentDispatch(shipmentId: string, garmentId: string): Promise<void>;
  confirmDeparture(shipmentId: string): Promise<void>;

  // Ledger, audit, reports
  listLedger(): Promise<LedgerCommitment[]>;
  retryLedger(id: string): Promise<void>;
  listAudit(): Promise<AuditEvent[]>;
  getReports(): Promise<ReportsData>;

  // Admin & settings
  listStaff(): Promise<StaffUser[]>;
  inviteUser(input: {
    username: string;
    displayName: string;
    role: Role;
    department: Department;
  }): Promise<string>;
  updateUserScope(input: { userId: string; role: Role; department: Department }): Promise<void>;
  setUserSuspended(userId: string, suspended: boolean): Promise<void>;
  issueReset(userId: string): Promise<string>;
  getSettings(): Promise<Settings>;
  updateCheckpoint(input: { sensor: SensorId; label: string; enabled: boolean }): Promise<void>;
  updateBusinessSettings(input: Partial<Settings["business"]>): Promise<void>;

  // Public (anonymous) — GET /public/products/:publicId, GET /public/products/:publicId/proof
  getPublicJourney(publicId: string): Promise<PublicJourney | null>;
  getPublicProof(publicId: string): Promise<PublicProof | null>;

  // Demo only
  resetDemo(): Promise<void>;
}
