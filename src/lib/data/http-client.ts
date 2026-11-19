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

export function getStoredAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredAuthToken(token: string | null): void {
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
  const root = import.meta.env["VITE_API_BASE_URL"] || "http://localhost:4000";
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

  // If Express response is wrapped in standard sendSuccess envelope { ok: true, data: T }
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    (payload as { ok?: boolean })["ok"] === true
  ) {
    return (payload as { data: T })["data"];
  }

  return payload as T;
}

function notImplemented(methodName: string): never {
  throw new ApiError(
    501,
    "WT_ERR_NOT_YET_IMPLEMENTED",
    `[Milestone 1 Live Client] Method '${methodName}' is not yet connected to the backend. It will be implemented in subsequent milestones.`,
  );
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
      notImplemented("listTasks");
    },
    async claimTask(_taskId: string): Promise<void> {
      notImplemented("claimTask");
    },
    async assignTask(_taskId: string, _userId: string): Promise<void> {
      notImplemented("assignTask");
    },
    async getWorkstation(): Promise<WorkstationData> {
      notImplemented("getWorkstation");
    },
    async selectWorkstationTask(_taskId: string): Promise<void> {
      notImplemented("selectWorkstationTask");
    },
    async armCheckpoint(): Promise<void> {
      notImplemented("armCheckpoint");
    },
    async simulateTrigger(_sensor: SensorId): Promise<TriggerOutcome> {
      notImplemented("simulateTrigger");
    },
    async clearCheckpoint(): Promise<void> {
      notImplemented("clearCheckpoint");
    },
    async handOverTask(): Promise<void> {
      notImplemented("handOverTask");
    },
    async getRfidStationData(_stationCode: RfidStationCode): Promise<RfidStationData> {
      notImplemented("getRfidStationData");
    },
    async prepareActionContext(
      _stationCode: RfidStationCode,
      _kind: ActionContextKind,
      _payload: ActionContextPayload,
    ): Promise<string> {
      notImplemented("prepareActionContext");
    },
    async acknowledgeContext(_contextId: string): Promise<void> {
      notImplemented("acknowledgeContext");
    },
    async cancelContext(_contextId: string): Promise<void> {
      notImplemented("cancelContext");
    },
    async resolveRfidScan(_uid: string): Promise<ScanOutcome> {
      notImplemented("resolveRfidScan");
    },
    async routineScan(_uid: string, _stationCode: "stitching" | "finishing"): Promise<ScanOutcome> {
      notImplemented("routineScan");
    },
    async simulateRfidScan(_uid: string): Promise<ScanOutcome> {
      notImplemented("simulateRfidScan");
    },
    async listLots(): Promise<MaterialLot[]> {
      notImplemented("listLots");
    },
    async getLot(_id: string): Promise<LotDetail | null> {
      notImplemented("getLot");
    },
    async receiveLot(_input: {
      material: string;
      supplierRef: string;
      qty: number;
      unit?: "m" | "kg" | "pcs";
    }): Promise<string> {
      notImplemented("receiveLot");
    },
    async issueMaterial(_input: { lotId: string; orderId: string; qty: number }): Promise<string> {
      notImplemented("issueMaterial");
    },
    async listProductSpecs(): Promise<ProductSpecification[]> {
      notImplemented("listProductSpecs");
    },
    async saveProductSpec(_input: Omit<ProductSpecification, "version">): Promise<string> {
      notImplemented("saveProductSpec");
    },
    async listOrders(): Promise<ProductionOrder[]> {
      notImplemented("listOrders");
    },
    async getOrder(_id: string): Promise<OrderDetail | null> {
      notImplemented("getOrder");
    },
    async planOrder(_input: {
      product: string;
      styleCode: string;
      qty: number;
      dueDate: string;
    }): Promise<string> {
      notImplemented("planOrder");
    },
    async approveOrder(_orderId: string): Promise<void> {
      notImplemented("approveOrder");
    },
    async recordCuttingOutput(_input: {
      orderId: string;
      issueId: string;
      fabricUsed: number;
      size: string;
    }): Promise<string> {
      notImplemented("recordCuttingOutput");
    },
    async listGarments(): Promise<Garment[]> {
      notImplemented("listGarments");
    },
    async getGarment(_id: string): Promise<GarmentDetail | null> {
      notImplemented("getGarment");
    },
    async replaceGarmentCard(_garmentId: string, _newUid: string): Promise<ScanOutcome> {
      notImplemented("replaceGarmentCard");
    },
    async listInspections(): Promise<Inspection[]> {
      notImplemented("listInspections");
    },
    async getInspection(_id: string): Promise<InspectionDetail | null> {
      notImplemented("getInspection");
    },
    async submitInspection(_input: {
      inspectionId: string;
      checklist: ChecklistItem[];
      notes: string;
      result: "pass" | "fail";
      defectReason?: string | undefined;
    }): Promise<void> {
      notImplemented("submitInspection");
    },
    async submitIncomingQc(_input: {
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
      notImplemented("submitIncomingQc");
    },
    async releaseHold(_garmentId: string): Promise<void> {
      notImplemented("releaseHold");
    },
    async listRework(): Promise<ReworkCase[]> {
      notImplemented("listRework");
    },
    async getRework(_id: string): Promise<ReworkDetail | null> {
      notImplemented("getRework");
    },
    async assignRework(_caseId: string, _department: Department): Promise<void> {
      notImplemented("assignRework");
    },
    async completeRework(_caseId: string, _note: string): Promise<void> {
      notImplemented("completeRework");
    },
    async getFulfilment(): Promise<FulfilmentData> {
      notImplemented("getFulfilment");
    },
    async packGarment(_garmentId: string): Promise<string> {
      notImplemented("packGarment");
    },
    async createPackage(): Promise<string> {
      notImplemented("createPackage");
    },
    async sealPackage(_packageId: string): Promise<void> {
      notImplemented("sealPackage");
    },
    async receiveStock(_garmentId: string): Promise<void> {
      notImplemented("receiveStock");
    },
    async allocateStock(_garmentId: string, _shipmentId: string): Promise<void> {
      notImplemented("allocateStock");
    },
    async listShipments(): Promise<Shipment[]> {
      notImplemented("listShipments");
    },
    async getShipment(_id: string): Promise<ShipmentDetail | null> {
      notImplemented("getShipment");
    },
    async planShipment(_input: {
      carrier: string;
      destination: string;
      plannedDate: string;
      garmentIds: string[];
    }): Promise<string> {
      notImplemented("planShipment");
    },
    async updateShipmentPlan(_input: {
      shipmentId: string;
      carrier?: string;
      destination?: string;
      plannedDate?: string;
      garmentIds?: string[];
    }): Promise<void> {
      notImplemented("updateShipmentPlan");
    },
    async verifyGarmentDispatch(_shipmentId: string, _garmentId: string): Promise<void> {
      notImplemented("verifyGarmentDispatch");
    },
    async confirmDeparture(_shipmentId: string): Promise<void> {
      notImplemented("confirmDeparture");
    },
    async listLedger() {
      notImplemented("listLedger");
    },
    async retryLedger(_id: string): Promise<void> {
      notImplemented("retryLedger");
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
    async updateCheckpoint(_input: {
      sensor: SensorId;
      label: string;
      enabled: boolean;
    }): Promise<void> {
      notImplemented("updateCheckpoint");
    },
    async updateBusinessSettings(_input: Partial<Settings["business"]>): Promise<void> {
      notImplemented("updateBusinessSettings");
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
      notImplemented("resetDemo");
    },
  };
}
