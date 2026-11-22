/**
 * Shared HTTP Client for WearTrail.
 * Owned by Member 4 (Staff access, shared UI and public journey).
 *
 * Provides typed HTTP transport against the Express backend, bearer token / cookie handling,
 * structured ApiError normalization, and WearTrailClient adapter implementation.
 *
 * CRITICAL RULE:
 * Unimplemented domain endpoints for Milestones 2–5 explicitly fail with typed 501 ApiError
 * ("WT_ERR_NOT_YET_IMPLEMENTED") rather than silently falling back to mock successes.
 */
import type {
  ActionContextKind,
  ActionContextPayload,
  AuditEvent,
  ChecklistItem,
  Department,
  Garment,
  Inspection,
  LifecycleStage,
  MaterialLot,
  ProductSpecification,
  ProductionOrder,
  RfidStationCode,
  RfidStationState,
  ReworkCase,
  Role,
  ScanOutcome,
  SensorId,
  Settings,
  Shipment,
  StaffUser,
  Task,
  TriggerOutcome,
} from "@/domain/types";
import type { PublicJourney, PublicProof } from "@/domain/public-types";
import type {
  DashboardData,
  FulfilmentData,
  GarmentDetail,
  InspectionDetail,
  LotDetail,
  OrderDetail,
  ReportsData,
  RfidStationData,
  ReworkDetail,
  ShipmentDetail,
  WearTrailClient,
  WorkstationData,
} from "./client";

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const AUTH_STORAGE_KEY = "weartrail_auth_token";

let memoryAuthToken: string | null = null;

export function getStoredAuthToken(): string | null {
  if (typeof window === "undefined") return memoryAuthToken;
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY) ?? memoryAuthToken;
  } catch {
    return memoryAuthToken;
  }
}

export function setStoredAuthToken(token: string | null): void {
  memoryAuthToken = token;
  if (typeof window === "undefined") return;
  try {
    if (token) {
      localStorage.setItem(AUTH_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch {
    // Ignore localStorage access failures
  }
}

export interface HttpRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

/**
 * Standard typed JSON request helper.
 */
export async function httpRequest<T = unknown>(
  path: string,
  options: HttpRequestOptions = {},
): Promise<T> {
  const root =
    (typeof import.meta !== "undefined" && import.meta.env?.["VITE_API_BASE_URL"]) ||
    (typeof process !== "undefined" && process.env?.["VITE_API_BASE_URL"]) ||
    "http://localhost:4000";
  const url = path.startsWith("http") ? path : `${root}${path}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const token = getStoredAuthToken();
  if (token && !headers["Authorization"] && !headers["authorization"]) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    body = options.body instanceof FormData ? options.body : JSON.stringify(options.body);
  }

  const fetchInit: RequestInit = {
    headers,
    credentials: options.credentials ?? "include",
  };
  if (options.method) fetchInit.method = options.method;
  if (options.mode) fetchInit.mode = options.mode;
  if (options.cache) fetchInit.cache = options.cache;
  if (body !== undefined) {
    fetchInit.body = body;
  }

  let res: Response;
  try {
    res = await fetch(url, fetchInit);
  } catch (netErr) {
    throw new ApiError(
      0,
      "WT_ERR_NETWORK",
      `Unable to connect to WearTrail server at ${root}. Please ensure the backend is running.`,
      netErr,
    );
  }

  // Handle empty / 204 No Content
  if (res.status === 204) {
    return undefined as unknown as T;
  }

  let payload: Record<string, unknown> | null = null;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      payload = (await res.json()) as Record<string, unknown>;
    } catch {
      payload = null;
    }
  } else {
    const text = await res.text();
    payload = { message: text };
  }

  if (!res.ok) {
    const errorObj = payload?.["error"] as Record<string, unknown> | undefined;
    const errorCode =
      (errorObj?.["code"] as string | undefined) ??
      (payload?.["code"] as string | undefined) ??
      `WT_ERR_HTTP_${res.status}`;
    const errorMessage =
      (errorObj?.["message"] as string | undefined) ??
      (payload?.["message"] as string | undefined) ??
      `Request to ${path} failed with HTTP status ${res.status}.`;
    const details = errorObj?.["details"] ?? payload?.["details"];

    throw new ApiError(res.status, errorCode, errorMessage, details);
  }

  // If Express response is wrapped in standard sendSuccess envelope { success: true, data: T }
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    ((payload as { success?: boolean })["success"] === true ||
      (payload as { ok?: boolean })["ok"] === true)
  ) {
    return (payload as { data: T })["data"];
  }

  return payload as T;
}

export function notImplemented(methodName: string): never {
  throw new ApiError(
    501,
    "WT_ERR_NOT_YET_IMPLEMENTED",
    `[Milestone 1 Live Client] Method '${methodName}' is not yet connected to the backend. It will be implemented in subsequent milestones.`,
  );
}

function mapDbStageToLifecycleStage(stage: string): LifecycleStage {
  switch (stage) {
    case "cut":
      return "stitching";
    case "stitched":
      return "finishing";
    case "finished":
      return "final-qc";
    case "packed":
      return "warehouse";
    case "warehoused":
      return "allocated";
    case "dispatched":
      return "dispatched";
    default:
      return (stage as LifecycleStage) || "cutting";
  }
}

/**
 * Creates the real HTTP-backed WearTrailClient.
 */
export function createHttpClient(): WearTrailClient {
  const req = httpRequest;

  return {
    // -------------------------------------------------------------
    // Milestone 1: Staff Authentication, Accounts, Sessions & Directory
    // -------------------------------------------------------------
    async authenticate(username: string, password: string): Promise<StaffUser> {
      const res = await req<{ user: StaffUser; token: string }>("/api/auth/login", {
        method: "POST",
        body: { username, password },
      });
      setStoredAuthToken(res.token);
      return res.user;
    },

    async getUser(_id: string): Promise<StaffUser | null> {
      try {
        const res = await req<{ user: StaffUser }>("/api/auth/me", { method: "GET" });
        return res.user;
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          setStoredAuthToken(null);
          return null;
        }
        throw err;
      }
    },

    async recordSignIn(_userId: string): Promise<void> {
      // In live mode, session is established via authenticate().
    },

    async recordSignOut(): Promise<void> {
      try {
        await req<{ loggedOut: boolean }>("/api/auth/logout", {
          method: "POST",
        });
      } finally {
        setStoredAuthToken(null);
      }
    },

    async listDirectory(): Promise<StaffUser[]> {
      try {
        return await req<StaffUser[]>("/api/staff/users", { method: "GET" });
      } catch {
        const me = await req<{ user: StaffUser }>("/api/auth/me", { method: "GET" });
        return me ? [me.user] : [];
      }
    },

    async listDemoAccounts(): Promise<StaffUser[]> {
      return [];
    },

    async checkCredentialToken(
      token: string,
    ): Promise<"valid" | "expired" | "used" | "revoked" | "unknown"> {
      const details = await this.getCredentialTokenDetails(token);
      return details.status;
    },

    async getCredentialTokenDetails(token: string): Promise<{
      status: "valid" | "expired" | "used" | "revoked" | "unknown";
      username?: string | undefined;
      kind?: "invite" | "reset" | undefined;
    }> {
      try {
        return await req<{
          status: "valid" | "expired" | "used" | "revoked" | "unknown";
          username?: string;
          kind?: "invite" | "reset";
        }>(`/api/auth/tokens/${encodeURIComponent(token.trim())}`, { method: "GET" });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return { status: "unknown" };
        }
        throw err;
      }
    },

    async consumeCredentialToken(token: string, newPassword: string): Promise<void> {
      await req<{ consumed: boolean }>(
        `/api/auth/tokens/${encodeURIComponent(token.trim())}/consume`,
        {
          method: "POST",
          body: { newPassword },
        },
      );
    },

    async changePassword(currentPassword: string, newPassword: string): Promise<void> {
      await req<{ changed: boolean }>("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
    },

    async signOutOtherSessions(): Promise<void> {
      await req<{ signedOutOthers: boolean }>("/api/auth/sessions/others", {
        method: "DELETE",
      });
    },

    // -------------------------------------------------------------
    // Milestones 5 Domain APIs (Dashboard, Tasks, Audit, Reports)
    // -------------------------------------------------------------
    async getDashboard(): Promise<DashboardData> {
      return await req<DashboardData>("/api/staff/dashboard", { method: "GET" });
    },
    async listTasks(): Promise<Task[]> {
      const raw = await req<any[]>("/api/tasks", { method: "GET" });
      return (raw || []).map((t) => {
        if (t.department && t.kind) return t as Task;
        let subjectType: Task["subjectType"] = "garment";
        let subjectId = t.id;
        if (t.garmentId) {
          subjectType = "garment";
          subjectId = t.garmentId;
        } else if (t.materialLotId) {
          subjectType = "lot";
          subjectId = t.materialLotId;
        } else if (t.productionOrderId) {
          subjectType = "order";
          subjectId = t.productionOrderId;
        } else if (t.shipmentId) {
          subjectType = "shipment";
          subjectId = t.shipmentId;
        }
        let status: Task["status"] = "open";
        if (t.status === "completed" || t.status === "done") {
          status = "done";
        } else if (t.status === "claimed" || t.status === "in_progress") {
          status = "claimed";
        }
        const rawDept = (t.departmentCode || t.department || "").replace(/_/g, "-");
        return {
          id: t.id,
          kind: (t.actionCode || t.kind || "incoming-qc") as Task["kind"],
          title:
            t.title ||
            (t.actionCode
              ? t.actionCode.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
              : `Task ${t.id}`),
          department: rawDept as any,
          subjectType,
          subjectId,
          checkpoint: t.checkpointCode ?? t.checkpoint,
          status,
          assigneeId: t.assigneeId,
          createdAt: t.createdAt,
          completedAt: t.completedAt,
        };
      });
    },
    async claimTask(taskId: string): Promise<void> {
      await req(`/api/tasks/${encodeURIComponent(taskId)}/claim`, { method: "POST" });
    },
    async assignTask(taskId: string, userId: string): Promise<void> {
      await req(`/api/tasks/${encodeURIComponent(taskId)}/assign`, {
        method: "POST",
        body: { userId },
      });
    },
    async getWorkstation(): Promise<WorkstationData> {
      return {
        session: { armed: false, needsClear: false, log: [] },
        tasks: [],
        selected: undefined,
        subjectLabel: "Retired IR Workflow",
      };
    },
    async selectWorkstationTask(_taskId: string): Promise<void> {
      // Retired IR checkpoint workflow
    },
    async armCheckpoint(): Promise<void> {
      // Retired IR checkpoint workflow
    },
    async simulateTrigger(_sensor: SensorId): Promise<TriggerOutcome> {
      return "ignored-unarmed";
    },
    async clearCheckpoint(): Promise<void> {
      // Retired IR checkpoint workflow
    },
    async handOverTask(): Promise<void> {
      // Retired IR checkpoint workflow
    },
    async getRfidStationData(stationCode: RfidStationCode): Promise<RfidStationData> {
      const data = await req<RfidStationData>(`/api/rfid/station/${stationCode}`, { method: "GET" });
      if (data?.activeContext && (data.activeContext.status as string) === "armed") {
        data.activeContext.status = "ready";
      }
      return data;
    },
    async prepareActionContext(
      stationCode: RfidStationCode,
      kind: ActionContextKind,
      payload: ActionContextPayload,
    ): Promise<string> {
      const res = await req<{ contextId: string }>("/api/rfid/contexts", {
        method: "POST",
        body: { stationCode, kind, payload },
      });
      return res.contextId;
    },
    async acknowledgeContext(contextId: string): Promise<void> {
      await req(`/api/rfid/contexts/${contextId}/ack`, { method: "PUT" });
    },
    async cancelContext(contextId: string): Promise<void> {
      await req(`/api/rfid/contexts/${contextId}`, { method: "DELETE" });
    },
    async resolveRfidScan(uid: string): Promise<ScanOutcome> {
      return await req<ScanOutcome>("/api/rfid/ui-scan", {
        method: "POST",
        body: { uid },
      });
    },
    async routineScan(uid: string, stationCode: "stitching" | "finishing" | "dispatch"): Promise<ScanOutcome> {
      return await req<ScanOutcome>("/api/rfid/routine-scan", {
        method: "POST",
        body: { uid, stationCode },
      });
    },
    async dispatchBoxScan(boxTagOrId: string, shipmentId?: string): Promise<ScanOutcome> {
      return await req<ScanOutcome>("/api/fulfilment/dispatch-box", {
        method: "POST",
        body: { boxTagOrId, shipmentId },
      });
    },
    async simulateRfidScan(uid: string): Promise<ScanOutcome> {
      return await req<ScanOutcome>("/api/rfid/ui-scan", {
        method: "POST",
        body: { uid },
      });
    },
    async listLots(): Promise<MaterialLot[]> {
      const raw = await req<any[]>("/api/materials/lots", { method: "GET" });
      return (raw || []).map((l: any) => ({
        id: l.code || l.id,
        lotId: l.id,
        code: l.code || l.id,
        material: l.materialName || l.material || "Unknown Material",
        supplierRef: l.supplierLotRef || l.supplierRef || "—",
        receivedQty: Number(l.receivedQuantity ?? l.receivedQty ?? 0),
        balanceQty: Number(l.availableAcceptedQuantity ?? l.balanceQty ?? 0),
        unit: l.unit || "m",
        receivedAt: l.receivedAt || new Date().toISOString(),
        receivedBy: l.receivedByName || l.receivedBy || "Staff",
        status:
          l.status ||
          (Number(l.availableAcceptedQuantity ?? l.balanceQty ?? 0) > 0
            ? "accepted"
            : "awaiting-inspection"),
        rfidUid: l.activeTagUid || l.rfidUid || undefined,
      }));
    },
    async getLot(id: string): Promise<LotDetail | null> {
      try {
        const raw = await req<any>(`/api/materials/lots/${encodeURIComponent(id)}`, { method: "GET" });
        if (!raw) return null;
        const lot: MaterialLot = {
          id: raw.code || raw.id,
          material: raw.materialName || raw.material || "Unknown Material",
          supplierRef: raw.supplierLotRef || raw.supplierRef || "—",
          receivedQty: Number(raw.receivedQuantity ?? raw.receivedQty ?? 0),
          balanceQty: Number(raw.availableAcceptedQuantity ?? raw.balanceQty ?? 0),
          unit: raw.unit || "m",
          receivedAt: raw.receivedAt || new Date().toISOString(),
          receivedBy: raw.receivedByName || raw.receivedBy || "Staff",
          status: raw.status || "accepted",
          rfidUid: raw.activeTagUid || raw.rfidUid || undefined,
        };
        return {
          lot,
          issues: raw.issues || [],
          cuttingOutputs: raw.cuttingOutputs || [],
          orders: raw.orders || [],
        };
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    async receiveLot(input: {
      material: string;
      supplierRef: string;
      qty: number;
      unit?: "m" | "kg" | "pcs";
    }): Promise<string> {
      const res = await req<{ lotId?: string; lotCode?: string; id?: string }>("/api/materials/lots", {
        method: "POST",
        body: {
          materialName: input.material,
          supplierRef: input.supplierRef,
          quantity: input.qty,
          unit: input.unit || "m",
        },
      });
      return res.lotCode || res.lotId || res.id || String(res);
    },
    async issueMaterial(input: { lotId: string; orderId: string; qty: number }): Promise<string> {
      const res = await req<{ issueId?: string; id?: string }>(
        `/api/materials/lots/${encodeURIComponent(input.lotId)}/issues`,
        {
          method: "POST",
          body: {
            orderId: input.orderId,
            quantity: input.qty,
          },
        },
      );
      return res.issueId || res.id || String(res);
    },
    async listProductSpecs(): Promise<ProductSpecification[]> {
      return await req<ProductSpecification[]>("/api/production/specs", { method: "GET" });
    },
    async saveProductSpec(input: Omit<ProductSpecification, "version">): Promise<string> {
      const res = await req<{ specId?: string; id?: string }>("/api/production/specs", {
        method: "POST",
        body: input,
      });
      return res.specId || res.id || String(res);
    },
    async listOrders(): Promise<ProductionOrder[]> {
      const raw = await req<any[]>("/api/production/orders", { method: "GET" });
      return (raw || []).map((o: any) => ({
        id: o.code || o.id,
        product: o.productName || o.product || "Unknown Product",
        styleCode: o.styleCode || "—",
        plannedQty: Number(o.plannedQuantity ?? o.plannedQty ?? 0),
        status: o.status || "draft",
        dueDate: o.plannedFor || o.dueDate || new Date().toISOString(),
        plannedBy: o.createdByName || o.plannedBy || "Staff",
        approvedBy: o.approvedByName || o.approvedBy || undefined,
        approvedAt: o.approvedAt || undefined,
      }));
    },
    async getOrder(id: string): Promise<OrderDetail | null> {
      try {
        return await req<OrderDetail>(`/api/production/orders/${encodeURIComponent(id)}`, { method: "GET" });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    async planOrder(input: {
      product: string;
      styleCode: string;
      qty: number;
      dueDate: string;
    }): Promise<string> {
      const res = await req<{ orderId?: string; code?: string; id?: string }>(
        "/api/production/orders",
        {
          method: "POST",
          body: {
            product: input.product,
            styleCode: input.styleCode,
            qty: input.qty,
            dueDate: input.dueDate,
          },
        },
      );
      return res.code || res.orderId || res.id || String(res);
    },
    async approveOrder(orderId: string): Promise<void> {
      await req(`/api/production/orders/${encodeURIComponent(orderId)}/approve`, { method: "POST" });
    },
    async recordCuttingOutput(input: {
      orderId: string;
      issueId: string;
      fabricUsed: number;
      size: string;
    }): Promise<string> {
      const res = await req<string | { garmentCode?: string; id?: string }>(
        `/api/production/orders/${encodeURIComponent(input.orderId)}/cutting-outputs`,
        {
          method: "POST",
          body: input,
        },
      );
      if (typeof res === "string") return res;
      return res.garmentCode || res.id || String(res);
    },
    async listGarments(): Promise<Garment[]> {
      const raw = await req<any[]>("/api/production/garments", { method: "GET" });
      return (raw || []).map((g: any) => ({
        id: g.code || g.id,
        orderId: g.productionOrderCode || g.productionOrderId || g.orderId || "",
        publicId: g.publicId || "",
        productName: g.productName || "Unknown Garment",
        size: g.sizeLabel || g.size || "M",
        cuttingOutputId: g.cuttingJobId || g.cuttingOutputId || "",
        stage: mapDbStageToLifecycleStage(g.stage),
        disposition: g.qualityDisposition || g.disposition || "awaiting_inspection",
        hold: null,
        rfidUid: g.activeTagUid || g.rfidUid || undefined,
      }));
    },
    async getGarment(id: string): Promise<GarmentDetail | null> {
      try {
        return await req<GarmentDetail>(`/api/production/garments/${encodeURIComponent(id)}`, { method: "GET" });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    async replaceGarmentCard(garmentId: string, newUid: string): Promise<ScanOutcome> {
      return await req<ScanOutcome>(`/api/production/garments/${encodeURIComponent(garmentId)}/replace-card`, {
        method: "POST",
        body: { newUid },
      });
    },
    async listInspections(): Promise<Inspection[]> {
      return await req<Inspection[]>("/api/quality/inspections", { method: "GET" });
    },
    async getInspection(id: string): Promise<InspectionDetail | null> {
      try {
        return await req<InspectionDetail>(`/api/quality/inspections/${encodeURIComponent(id)}`, { method: "GET" });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    async submitInspection(input: {
      inspectionId: string;
      checklist: ChecklistItem[];
      notes: string;
      result: "pass" | "fail";
      defectReason?: string | undefined;
    }): Promise<void> {
      await req(`/api/quality/inspections/${encodeURIComponent(input.inspectionId)}/result`, {
        method: "POST",
        body: {
          checklist: input.checklist,
          notes: input.notes,
          result: input.result,
          defectReason: input.defectReason,
        },
      });
    },
    async submitIncomingQc(input: {
      lotId: string;
      inspectionId: string;
      acceptedQty: number;
      heldQty: number;
      rejectedQty: number;
      checklist: ChecklistItem[];
      notes: string;
      result: "pass" | "fail";
      defectReason?: string | undefined;
    }): Promise<void> {
      await req("/api/quality/incoming-qc", {
        method: "POST",
        body: {
          lotId: input.lotId,
          inspectionId: input.inspectionId,
          acceptedQuantity: input.acceptedQty,
          heldQuantity: input.heldQty,
          rejectedQuantity: input.rejectedQty,
          checklist: input.checklist,
          notes: input.notes,
          result: input.result,
          defectReason: input.defectReason,
        },
      });
    },
    async releaseHold(garmentId: string): Promise<void> {
      await req(`/api/quality/garments/${encodeURIComponent(garmentId)}/release-hold`, {
        method: "POST",
        body: {},
      });
    },
    async listRework(): Promise<ReworkCase[]> {
      return await req<ReworkCase[]>("/api/quality/rework", { method: "GET" });
    },
    async getRework(id: string): Promise<ReworkDetail | null> {
      try {
        return await req<ReworkDetail>(`/api/quality/rework/${encodeURIComponent(id)}`, { method: "GET" });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    async assignRework(caseId: string, department: Department): Promise<void> {
      await req(`/api/quality/rework/${encodeURIComponent(caseId)}/assign`, {
        method: "POST",
        body: { departmentCode: department },
      });
    },
    async completeRework(caseId: string, note: string): Promise<void> {
      await req(`/api/quality/rework/${encodeURIComponent(caseId)}/complete`, {
        method: "POST",
        body: { note },
      });
    },
    async getFulfilment(): Promise<FulfilmentData> {
      return await req<FulfilmentData>("/api/fulfilment", { method: "GET" });
    },
    async packGarment(garmentId: string): Promise<string> {
      const res = await req<{ packageId?: string; id?: string }>("/api/fulfilment/pack", {
        method: "POST",
        body: { garmentId },
      });
      return res.packageId || res.id || String(res);
    },
    async createPackage(): Promise<string> {
      const res = await req<{ packageId?: string; id?: string }>("/api/fulfilment/packages", {
        method: "POST",
        body: {},
      });
      return res.packageId || res.id || String(res);
    },
    async sealPackage(packageId: string): Promise<void> {
      await req(`/api/fulfilment/packages/${encodeURIComponent(packageId)}/seal`, {
        method: "POST",
        body: {},
      });
    },
    async receiveStock(garmentId: string): Promise<void> {
      await req("/api/fulfilment/receive-stock", {
        method: "POST",
        body: { garmentId },
      });
    },
    async allocateStock(garmentId: string, shipmentId: string): Promise<void> {
      await req(`/api/fulfilment/shipments/${encodeURIComponent(shipmentId)}/allocate`, {
        method: "POST",
        body: { garmentId },
      });
    },
    async listShipments(): Promise<Shipment[]> {
      return await req<Shipment[]>("/api/fulfilment/shipments", { method: "GET" });
    },
    async getShipment(id: string): Promise<ShipmentDetail | null> {
      try {
        return await req<ShipmentDetail>(`/api/fulfilment/shipments/${encodeURIComponent(id)}`, { method: "GET" });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    async planShipment(input: {
      destination: string;
      carrier: string;
      plannedDate: string;
    }): Promise<string> {
      const res = await req<{ shipmentId?: string; id?: string; code?: string }>(
        "/api/fulfilment/shipments",
        {
          method: "POST",
          body: input,
        },
      );
      return res.shipmentId || res.id || res.code || String(res);
    },
    async updateShipmentPlan(input: {
      shipmentId: string;
      garmentIds: string[];
      markPlanned: boolean;
    }): Promise<void> {
      await req(`/api/fulfilment/shipments/${encodeURIComponent(input.shipmentId)}/plan`, {
        method: "POST",
        body: {
          garmentIds: input.garmentIds,
          markPlanned: input.markPlanned,
        },
      });
    },
    async verifyGarmentDispatch(shipmentId: string, garmentId: string): Promise<void> {
      await req(`/api/fulfilment/shipments/${encodeURIComponent(shipmentId)}/verify-dispatch`, {
        method: "POST",
        body: { garmentId },
      });
    },
    async confirmDeparture(shipmentId: string): Promise<void> {
      await req(`/api/fulfilment/shipments/${encodeURIComponent(shipmentId)}/depart`, {
        method: "POST",
        body: {},
      });
    },
    async listLedger(): Promise<any[]> {
      return await req<any[]>("/api/staff/ledger", { method: "GET" });
    },
    async retryLedger(id: string): Promise<void> {
      await req(`/api/staff/ledger/${encodeURIComponent(id)}/retry`, {
        method: "POST",
        body: {},
      });
    },
    async listAudit(): Promise<AuditEvent[]> {
      return await req<AuditEvent[]>("/api/staff/audit", { method: "GET" });
    },
    async getReports(): Promise<ReportsData> {
      return await req<ReportsData>("/api/staff/reports", { method: "GET" });
    },
    async listStaff(): Promise<StaffUser[]> {
      return await req<StaffUser[]>("/api/staff/users", { method: "GET" });
    },
    async inviteUser(input: {
      username: string;
      displayName: string;
      role: Role;
      department: Department;
    }): Promise<string> {
      const res = await req<{ inviteToken: string }>("/api/staff/users/invite", {
        method: "POST",
        body: input,
      });
      return res.inviteToken;
    },
    async updateUserScope(input: {
      userId: string;
      role: Role;
      department: Department;
    }): Promise<void> {
      await req<{ updated: boolean }>(
        `/api/staff/users/${encodeURIComponent(input.userId)}/scope`,
        {
          method: "PATCH",
          body: { role: input.role, department: input.department },
        },
      );
    },
    async setUserSuspended(userId: string, suspended: boolean): Promise<void> {
      await req<{ suspended: boolean }>(
        `/api/staff/users/${encodeURIComponent(userId)}/suspend`,
        {
          method: "PATCH",
          body: { suspended },
        },
      );
    },
    async issueReset(userId: string): Promise<string> {
      const res = await req<{ token: string }>(
        `/api/staff/users/${encodeURIComponent(userId)}/reset-token`,
        {
          method: "POST",
        },
      );
      return res.token;
    },
    async getSettings(): Promise<Settings> {
      return await req<Settings>("/api/staff/settings", { method: "GET" });
    },
    async updateCheckpoint(input: {
      sensor: SensorId;
      label: string;
      enabled: boolean;
    }): Promise<void> {
      await req(`/api/staff/settings/checkpoints/${encodeURIComponent(input.sensor)}`, {
        method: "PATCH",
        body: input,
      });
    },
    async updateBusinessSettings(input: Partial<Settings["business"]>): Promise<void> {
      await req("/api/staff/settings/business", {
        method: "PATCH",
        body: input,
      });
    },
    async getPublicJourney(publicId: string): Promise<PublicJourney | null> {
      try {
        return await req<PublicJourney>(`/api/public/journey/${encodeURIComponent(publicId.trim())}`, {
          method: "GET",
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return null;
        }
        throw err;
      }
    },
    async getPublicProof(publicId: string): Promise<PublicProof | null> {
      try {
        return await req<PublicProof>(`/api/public/proof/${encodeURIComponent(publicId.trim())}`, {
          method: "GET",
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return null;
        }
        throw err;
      }
    },
    async resetDemo(): Promise<void> {
      /* In live mode, demo reset is a no-op */
    },
  };
}
