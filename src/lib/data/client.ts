/**
 * WearTrailClient — the ONLY data boundary feature views use.
 *
 * Today: createMockClient() (src/mock/mock-client.ts) runs everything in the browser.
 * Later: implement this interface with fetch() calls to the Express API
 * (which talks to PostgreSQL on Supabase). Each method notes the suggested endpoint.
 * The server must derive the actor from its own session/token, never from the client.
 */
import type { PublicJourney, PublicProof } from "@/domain/public-types";
import type {
  AuditEvent,
  ChecklistItem,
  CuttingOutput,
  Department,
  Garment,
  GarmentEvent,
  Inspection,
  LedgerCommitment,
  MaterialIssue,
  MaterialLot,
  Package,
  ProductionOrder,
  ReworkCase,
  Role,
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

export interface WearTrailClient {
  // Session & directory — GET /staff (directory), GET /me
  listDemoAccounts(): Promise<StaffUser[]>;
  getUser(id: string): Promise<StaffUser | null>;
  /** Names/roles for display (all signed-in staff). */
  listDirectory(): Promise<StaffUser[]>;
  checkCredentialToken(token: string): Promise<"valid" | "expired" | "used" | "unknown">;
  recordSignIn(userId: string): Promise<void>;
  recordSignOut(): Promise<void>;

  // Home — GET /dashboard
  getDashboard(): Promise<DashboardData>;

  // Tasks — GET /tasks, POST /tasks/:id/claim, POST /tasks/:id/assign
  listTasks(): Promise<Task[]>;
  claimTask(taskId: string): Promise<void>;
  assignTask(taskId: string, userId: string): Promise<void>;

  // Workstation — GET /workstation, POST /workstation/{select,arm,trigger,clear,handover}
  getWorkstation(): Promise<WorkstationData>;
  selectWorkstationTask(taskId: string): Promise<void>;
  armCheckpoint(): Promise<void>;
  simulateTrigger(sensor: SensorId): Promise<TriggerOutcome>;
  clearCheckpoint(): Promise<void>;
  handOverTask(): Promise<void>;

  // Materials — GET /material-lots, GET /material-lots/:id, POST /material-lots, POST /material-lots/:id/issues
  listLots(): Promise<MaterialLot[]>;
  getLot(id: string): Promise<LotDetail | null>;
  receiveLot(input: { material: string; supplierRef: string; qty: number }): Promise<string>;
  issueMaterial(input: { lotId: string; orderId: string; qty: number }): Promise<string>;

  // Production — GET /production-orders(/:id), POST /production-orders, POST /production-orders/:id/cutting-outputs
  listOrders(): Promise<ProductionOrder[]>;
  getOrder(id: string): Promise<OrderDetail | null>;
  planOrder(input: { product: string; styleCode: string; qty: number; dueDate: string }): Promise<string>;
  recordCuttingOutput(input: { orderId: string; issueId: string; fabricUsed: number; size: string }): Promise<string>;

  // Garments — GET /garments(/:id)
  listGarments(): Promise<Garment[]>;
  getGarment(id: string): Promise<GarmentDetail | null>;

  // Quality — GET /inspections(/:id), POST /inspections/:id/result, POST /garments/:id/release-hold
  listInspections(): Promise<Inspection[]>;
  getInspection(id: string): Promise<InspectionDetail | null>;
  submitInspection(input: { inspectionId: string; checklist: ChecklistItem[]; notes: string; result: "pass" | "fail"; defectReason?: string | undefined }): Promise<void>;
  releaseHold(garmentId: string): Promise<void>;

  // Rework — GET /rework(/:id), POST /rework/:id/assign, POST /rework/:id/complete
  listRework(): Promise<ReworkCase[]>;
  getRework(id: string): Promise<ReworkDetail | null>;
  assignRework(caseId: string, department: Department): Promise<void>;
  completeRework(caseId: string, note: string): Promise<void>;

  // Fulfilment & shipments
  getFulfilment(): Promise<FulfilmentData>;
  packGarment(garmentId: string): Promise<string>;
  receiveStock(garmentId: string): Promise<void>;
  allocateStock(garmentId: string, shipmentId: string): Promise<void>;
  listShipments(): Promise<Shipment[]>;
  getShipment(id: string): Promise<ShipmentDetail | null>;
  planShipment(input: { destination: string; carrier: string; plannedDate: string }): Promise<string>;
  updateShipmentPlan(input: { shipmentId: string; garmentIds: string[]; markPlanned: boolean }): Promise<void>;
  confirmDeparture(shipmentId: string): Promise<void>;

  // Ledger, audit, reports
  listLedger(): Promise<LedgerCommitment[]>;
  retryLedger(id: string): Promise<void>;
  listAudit(): Promise<AuditEvent[]>;
  getReports(): Promise<ReportsData>;

  // Admin & settings
  listStaff(): Promise<StaffUser[]>;
  inviteUser(input: { username: string; displayName: string; role: Role; department: Department }): Promise<string>;
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
