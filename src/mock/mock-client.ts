/**
 * Browser-only mock implementation of WearTrailClient.
 * Replace with an Express-backed client by implementing the same interface.
 *
 * RFID integration seam:
 *   createMockClient() uses in-memory mock state for all RFID operations.
 *   The live client replaces resolveRfidScan/routineScan with SSE subscriptions
 *   and fetch() calls to Express, keeping identical DTOs.
 */
import type {
  ActionContextKind,
  ActionContextPayload,
  AuditCategory,
  DemoState,
  RfidStationCode,
  ScanOutcome,
  SensorId,
  StaffUser,
  Task,
} from "@/domain/types";
import type {
  DashboardData,
  RfidStationData,
  ReportsData,
  WearTrailClient,
} from "@/lib/data/client";
import { DemoError } from "./errors";
import * as E from "./engine";
import { projectJourney, projectProof } from "./projection";
import { getState, mutate, resetDemoState } from "./store";

const clone = <T>(v: T): T => structuredClone(v);
const ok = <T>(v: T) => Promise.resolve(clone(v));

export function createMockClient(getActorId: () => string | null): WearTrailClient {
  const actor = (s: DemoState = getState()): StaffUser => {
    const id = getActorId();
    const u = id ? s.users.find((x) => x.id === id) : undefined;
    if (!u) throw new DemoError("forbidden", "Sign in to continue.");
    if (u.status !== "active") throw new DemoError("forbidden", "This account is not active.");
    return u;
  };
  /** Run a mutation as the current actor; rejects with DemoError on failure. */
  const act = <T>(fn: (s: DemoState, u: StaffUser) => T): Promise<T> => {
    try {
      return Promise.resolve(mutate((s) => fn(s, actor(s))));
    } catch (e) {
      return Promise.reject(e);
    }
  };
  const read = <T>(fn: (s: DemoState, u: StaffUser) => T): Promise<T> => {
    try {
      const s = getState();
      return ok(fn(s, actor(s)));
    } catch (e) {
      return Promise.reject(e);
    }
  };
  const scopedTasks = (s: DemoState, u: StaffUser) => {
    if (u.role === "M" || u.role === "A") return s.tasks;
    if (u.username === "qc.incoming") {
      return s.tasks.filter((t) => t.kind === "incoming-qc" || t.department === "quality");
    }
    return s.tasks.filter((t) => t.department === u.department);
  };

  return {
    listDemoAccounts: () => ok(getState().users.filter((u) => u.username.endsWith(".demo"))),
    getUser: (id) => ok(getState().users.find((u) => u.id === id) ?? null),
    listDirectory: () => read((s) => s.users),
    checkCredentialToken: (token) => Promise.resolve(E.checkCredentialToken(getState(), token)),
    getCredentialTokenDetails: (token) => {
      const s = getState();
      const status = E.checkCredentialToken(s, token);
      const tok = s.credentialTokens?.find((t) => t.token === token);
      const user = tok ? s.users.find((u) => u.id === tok.userId) : undefined;
      return Promise.resolve({
        status,
        username: user?.username ?? (token.startsWith("demo-") ? "demo.user" : undefined),
        kind: tok?.kind ?? "reset",
      });
    },
    consumeCredentialToken: (token, newPassword) => {
      mutate((s) => E.consumeCredentialToken(s, token, newPassword));
      return Promise.resolve();
    },
    authenticate: (username, password) => {
      let authedUser: StaffUser;
      mutate((s) => {
        const res = E.authenticateStaff(s, username, password);
        authedUser = res.user;
      });
      return Promise.resolve(authedUser!);
    },
    changePassword: (currentPassword, newPassword) => {
      mutate((s) => E.changeStaffPassword(s, actor(s), currentPassword, newPassword));
      return Promise.resolve();
    },
    signOutOtherSessions: () => {
      mutate((s) => E.signOutOtherSessions(s, actor(s)));
      return Promise.resolve();
    },
    recordSignIn: (userId) => {
      mutate((s) => {
        const u = s.users.find((x) => x.id === userId);
        if (!u) throw new DemoError("not-found", "Unknown demo account.");
        if (u.status !== "active")
          throw new DemoError("forbidden", `${u.username} is ${u.status} and cannot sign in.`);
        E.recordSignIn(s, u);
      });
      return Promise.resolve();
    },
    recordSignOut: () => {
      try {
        mutate((s) => E.recordSignOut(s, actor(s)));
      } catch {
        /* already signed out */
      }
      return Promise.resolve();
    },

    getDashboard: () => read((s, u) => dashboard(s, u, scopedTasks(s, u))),

    listTasks: () =>
      read((s, u) => scopedTasks(s, u).sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    claimTask: (id) => act((s, u) => E.claimTask(s, u, id)),
    assignTask: (id, userId) => act((s, u) => E.assignTask(s, u, id, userId)),

    getWorkstation: () =>
      read((s, u) => {
        const session = s.workstations[u.id] ?? { armed: false, needsClear: false, log: [] };
        const tasks = scopedTasks(s, u).filter(
          (t) =>
            t.checkpoint &&
            t.status !== "done" &&
            (u.role === "M" ? true : t.department === u.department),
        );
        const selected = session.taskId ? s.tasks.find((t) => t.id === session.taskId) : undefined;
        return {
          session,
          tasks,
          selected,
          subjectLabel: selected
            ? `${selected.subjectType.toUpperCase()} ${selected.subjectId}`
            : undefined,
        };
      }),
    selectWorkstationTask: (id) => act((s, u) => E.selectWorkstationTask(s, u, id)),
    armCheckpoint: () => act((s, u) => E.armCheckpoint(s, u)),
    simulateTrigger: (sensor) => act((s, u) => E.simulateTrigger(s, u, sensor)),
    clearCheckpoint: () => act((s, u) => E.clearCheckpoint(s, u)),
    handOverTask: () => act((s, u) => E.handOverTask(s, u)),

    // ---------------------------------------------------------------- RFID station

    getRfidStationData: (stationCode: RfidStationCode) =>
      read((s, u): RfidStationData => {
        const cp = s.settings.checkpoints.find((c) => c.stationCode === stationCode);
        const stationName = cp?.stationName ?? stationCode;
        const stateEntry = s.rfidStationStates[u.id];
        const activeContextId = stateEntry?.activeContextId;
        const activeContext = activeContextId
          ? s.actionContexts.find(
              (c) => c.id === activeContextId && c.status !== "expired" && c.status !== "cancelled",
            )
          : undefined;
        const selectionId = stateEntry?.cuttingSourceSelectionId;
        const cuttingSourceSelection = selectionId
          ? s.cuttingSourceSelections.find((cs) => cs.id === selectionId && cs.active)
          : undefined;
        return {
          stationCode,
          stationName,
          operatorId: u.id,
          // In mock mode, bridge is always "disconnected" (synthetic)
          bridgeConnected: false,
          activeContext,
          lastScanOutcome: stateEntry?.lastScanOutcome,
          cuttingSourceSelection,
          lastConfirmedSubjectId: stateEntry?.lastConfirmedSubjectId,
        };
      }),

    prepareActionContext: (
      stationCode: RfidStationCode,
      kind: ActionContextKind,
      payload: ActionContextPayload,
    ) => act((s, u) => E.prepareActionContext(s, u, stationCode, kind, payload)),

    acknowledgeContext: (contextId: string) => act((s, u) => E.acknowledgeContext(s, u, contextId)),

    cancelContext: (contextId: string) => act((s, u) => E.cancelContext(s, u, contextId)),

    resolveRfidScan: (uid: string) => act((s, u) => E.resolveRfidScan(s, u, uid)),

    routineScan: (
      uid: string,
      stationCode: "stitching" | "finishing" | "warehouse" | "dispatch",
      _binId?: string,
    ) => act((s, u) => E.routineScan(s, u, uid, stationCode as any)),

    warehouseIntake: (tagUid: string, binId?: string) =>
      act((s, u) => {
        return E.receiveStock(s, u, tagUid, binId);
      }),

    dispatchBoxScan: (boxTagOrId: string, shipmentId?: string) =>
      act((s, u) => E.dispatchBoxScan(s, u, boxTagOrId, shipmentId)),

    simulateRfidScan: (uid: string) => act((s, u) => E.resolveRfidScan(s, u, uid)),

    // ---------------------------------------------------------------- materials

    listLots: () => read((s) => s.lots),
    getLot: (id) =>
      read((s) => {
        const lot = s.lots.find((l) => l.id === id);
        if (!lot) return null;
        const issues = s.issues.filter((i) => i.lotId === id);
        const rfidBinding = s.rfidTagBindings.find(
          (b) => b.subjectType === "lot" && b.subjectId === id && b.active,
        );
        return {
          lot,
          inspection: s.inspections.find((i) => i.id === lot.incomingInspectionId),
          issues,
          cuttingOutputs: s.cuttingOutputs.filter((c) => c.lotId === id),
          orders: s.orders,
          rfidBinding,
        };
      }),
    receiveLot: (input) => act((s, u) => E.receiveLot(s, u, input)),
    issueMaterial: (input) => act((s, u) => E.issueMaterial(s, u, input)),

    // ---------------------------------------------------------------- production

    listProductSpecs: () => read((s) => E.listProductSpecs(s)),
    saveProductSpec: (spec) => act((s, u) => E.saveProductSpec(s, u, spec)),
    listOrders: () =>
      read((s) =>
        s.orders.map((o) => {
          const orderIssues = s.issues.filter((i) => i.orderId === o.id);
          const lotIds = orderIssues.map((i) => i.lotId);
          return {
            ...o,
            lotId: (o as any).lotId || lotIds[0],
            lotIds: (o as any).lotIds || lotIds,
            lotCodes: (o as any).lotCodes || lotIds,
            issues: orderIssues.map((i) => ({
              id: i.id,
              lotId: i.lotId,
              lotCode: i.lotId,
              materialName: s.lots.find((l) => l.id === i.lotId)?.material || "Fabric Roll",
              quantity: i.qty,
              performedAt: i.issuedAt,
            })),
          };
        }),
      ),
    getOrder: (id) =>
      read((s) => {
        const order = s.orders.find((o) => o.id === id);
        if (!order) return null;
        return {
          order,
          issues: s.issues.filter((i) => i.orderId === id),
          cuttingOutputs: s.cuttingOutputs.filter((c) => c.orderId === id),
          garments: s.garments.filter((g) => g.orderId === id),
        };
      }),
    planOrder: (input) => act((s, u) => E.planOrder(s, u, input)),
    approveOrder: (orderId) => act((s, u) => E.approveOrder(s, u, orderId)),
    recordCuttingOutput: (input) => act((s, u) => E.recordCuttingOutput(s, u, input)),

    // ---------------------------------------------------------------- garments

    listGarments: () => read((s) => s.garments),
    getGarment: (id) =>
      read((s, u) => {
        const garment = s.garments.find((g) => g.id === id);
        if (!garment) return null;
        const cuttingOutput = s.cuttingOutputs.find((c) => c.id === garment.cuttingOutputId);
        const showLogistics = u.role === "M" || u.role === "L";
        const rfidBinding = s.rfidTagBindings.find(
          (b) => b.subjectType === "garment" && b.subjectId === id && b.active,
        );
        return {
          garment,
          events: s.garmentEvents
            .filter((e) => e.garmentId === id)
            .sort((a, b) => a.at.localeCompare(b.at)),
          cuttingOutput,
          lot: s.lots.find((l) => l.id === cuttingOutput?.lotId),
          order: s.orders.find((o) => o.id === garment.orderId),
          inspections: s.inspections.filter(
            (i) => i.subjectType === "garment" && i.subjectId === id,
          ),
          rework: s.rework.filter((r) => r.garmentId === id),
          pkg: showLogistics ? s.packages.find((p) => p.garmentIds.includes(id)) : undefined,
          shipment: showLogistics
            ? s.shipments.find((sh) => sh.allocatedGarmentIds.includes(id))
            : undefined,
          ledger: s.ledger.filter((l) => l.subjectId === id),
          rfidBinding,
        };
      }),
    replaceGarmentCard: (garmentId, newUid) =>
      act((s, u) => E.replaceGarmentCard(s, u, garmentId, newUid)),

    // ---------------------------------------------------------------- quality

    listInspections: () => read((s) => s.inspections),
    getInspection: (id) =>
      read((s) => {
        const inspection = s.inspections.find((i) => i.id === id);
        if (!inspection) return null;
        const garment =
          inspection.subjectType === "garment"
            ? s.garments.find((g) => g.id === inspection.subjectId)
            : undefined;
        return {
          inspection,
          garment,
          lot:
            inspection.subjectType === "lot"
              ? s.lots.find((l) => l.id === inspection.subjectId)
              : undefined,
          reworkCase: s.rework.find((r) => r.inspectionId === id || r.reinspectionId === id),
          latestForSubject: garment ? E.latestGarmentInspection(s, garment.id) : undefined,
        };
      }),
    submitInspection: (input) => act((s, u) => E.submitInspection(s, u, input)),
    submitIncomingQc: (input) => act((s, u) => E.submitIncomingQc(s, u, input)),
    releaseHold: (gid) => act((s, u) => E.releaseHold(s, u, gid)),

    // ---------------------------------------------------------------- rework

    listRework: () =>
      read((s, u) =>
        s.rework.filter((r) => u.role !== "P" || r.assignedDepartment === u.department),
      ),
    getRework: (id) =>
      read((s, u) => {
        const rc = s.rework.find((r) => r.id === id);
        if (!rc) return null;
        if (u.role === "P" && rc.assignedDepartment !== u.department)
          throw new DemoError("forbidden", "This rework case is assigned to another department.");
        const garment = s.garments.find((g) => g.id === rc.garmentId)!;
        return {
          reworkCase: rc,
          garment,
          inspections: s.inspections.filter((i) => i.subjectId === rc.garmentId),
        };
      }),
    assignRework: (id, dept) => act((s, u) => E.assignRework(s, u, id, dept)),
    completeRework: (id, note) => act((s, u) => E.completeRework(s, u, id, note)),

    // ---------------------------------------------------------------- fulfilment

    getFulfilment: () =>
      read((s) => ({
        awaitingPacking: s.garments.filter((g) => g.stage === "packing" && !g.packageId && !g.hold),
        packedAwaitingReceipt: s.garments.filter((g) => g.stage === "packing" && !!g.packageId),
        inStock: s.garments.filter((g) => g.stage === "warehouse" || g.stage === "allocated"),
        blocked: s.garments.filter((g) => !!g.hold),
        packages: s.packages,
        openShipments: s.shipments.filter((x) => x.status !== "departed"),
      })),
    packGarment: (gid, pkgId) => act((s, u) => E.packGarment(s, u, gid, pkgId)),
    createPackage: (rfidUid, customId) => act((s, u) => E.createPackage(s, u, rfidUid, customId)),
    sealPackage: (packageId) => act((s, u) => E.sealPackage(s, u, packageId)),
    receiveStock: (gid) => act((s, u) => E.receiveStock(s, u, gid)),
    allocateStock: (gid, sid) => act((s, u) => E.allocateStock(s, u, gid, sid)),
    listShipments: () => read((s) => s.shipments),
    getShipment: (id) =>
      read((s) => {
        const shipment = s.shipments.find((x) => x.id === id);
        if (!shipment) return null;
        return {
          shipment,
          garments: s.garments.filter((g) => shipment.garmentIds.includes(g.id)),
          eligibility: E.shipmentEligibility(s, shipment),
          dispatchTask: s.tasks.find((t) => t.kind === "dispatch" && t.subjectId === id),
          candidates: s.garments.filter(
            (g) => g.stage !== "dispatched" && (!g.shipmentId || g.shipmentId === id),
          ),
        };
      }),
    planShipment: (input) => act((s, u) => E.planShipment(s, u, input)),
    updateShipmentPlan: (input) => act((s, u) => E.updateShipmentPlan(s, u, input)),
    verifyGarmentDispatch: (shipmentId, garmentId) =>
      act((s, u) => E.verifyGarmentDispatch(s, u, shipmentId, garmentId)),
    confirmDeparture: (id) => act((s, u) => E.confirmDeparture(s, u, id)),

    // ---------------------------------------------------------------- ledger / audit / reports

    listLedger: () => read((s) => s.ledger),
    retryLedger: (id) => act((s, u) => E.retryLedger(s, u, id)),
    listAudit: () =>
      read((s, u) => {
        const scope: Partial<Record<StaffUser["role"], AuditCategory[]>> = {
          A: ["auth", "admin", "ledger", "settings", "workstation", "rfid"],
          Q: ["quality", "rework", "materials"],
        };
        const allowed = scope[u.role];
        return allowed ? s.audit.filter((a) => allowed.includes(a.category)) : s.audit;
      }),
    getReports: () => read((s, u) => reports(s, u)),

    // ---------------------------------------------------------------- admin

    listStaff: () =>
      read((s, u) => {
        if (u.role !== "A") throw new DemoError("forbidden", "Administrator only.");
        return s.users;
      }),
    inviteUser: (input) => act((s, u) => E.inviteUser(s, u, input)),
    updateUserScope: (input) => act((s, u) => E.updateUserScope(s, u, input)),
    setUserSuspended: (id, v) => act((s, u) => E.setUserSuspended(s, u, id, v)),
    issueReset: (id) => act((s, u) => E.issueReset(s, u, id)),
    getSettings: () => read((s) => s.settings),
    updateCheckpoint: (input) => act((s, u) => E.updateCheckpoint(s, u, input)),
    updateBusinessSettings: (input) => act((s, u) => E.updateBusinessSettings(s, u, input)),

    // ---------------------------------------------------------------- public

    getPublicJourney: (pid) => ok(projectJourney(getState(), pid)),
    getPublicProof: (pid) => ok(projectProof(getState(), pid)),

    resetDemo: () => {
      resetDemoState();
      return Promise.resolve();
    },
  };
}

function dashboard(s: DemoState, u: StaffUser, tasks: Task[]): DashboardData {
  const open = tasks.filter((t) => t.status !== "done");
  const held = s.garments.filter((g) => g.hold);
  const openInsp = s.inspections.filter((i) => i.status === "open");
  const failedLedger = s.ledger.filter((l) => l.status === "failed");
  const awaitingLots = s.lots.filter(
    (l) => l.status === "awaiting-inspection",
  );
  const activeShipments = s.shipments.filter((x) => x.status !== "departed");

  const metricsByRole: Record<StaffUser["role"], DashboardData["metrics"]> = {
    A: [
      { label: "Active staff", value: s.users.filter((x) => x.status === "active").length },
      { label: "Failed commitments", value: failedLedger.length },
      {
        label: "Pending commitments",
        value: s.ledger.filter((l) => l.status === "pending" || l.status === "submitted").length,
      },
      {
        label: "RFID stations enabled",
        value: s.settings.checkpoints.filter((c) => c.enabled).length,
      },
    ],
    M: [
      { label: "Open tasks", value: open.length },
      { label: "Garments on hold", value: held.length },
      { label: "Open inspections", value: openInsp.length },
      { label: "Shipments in progress", value: activeShipments.length },
    ],
    O: [
      { label: "My open tasks", value: open.length },
      { label: "Lots awaiting inspection", value: awaitingLots.length },
      { label: "Accepted lots", value: s.lots.filter((l) => l.status === "accepted").length },
      {
        label: "Available stock (m)",
        value: Math.round(
          s.lots
            .filter((l) => l.status === "accepted" && l.unit === "m")
            .reduce((a, l) => a + l.balanceQty, 0),
        ),
      },
    ],
    P: [
      { label: "My open tasks", value: open.length },
      {
        label: "Rework assigned to us",
        value: s.rework.filter(
          (r) => r.assignedDepartment === u.department && r.status === "assigned",
        ).length,
      },
      {
        label: "Garments in production",
        value: s.garments.filter((g) => ["cutting", "stitching", "finishing"].includes(g.stage))
          .length,
      },
      {
        label: "Orders in progress",
        value: s.orders.filter((o) => o.status === "in-progress").length,
      },
    ],
    Q: (() => {
      const isIncoming =
        u.username?.toLowerCase() === "qc.incoming" ||
        u.department?.toLowerCase() === "receiving" ||
        u.department?.toLowerCase() === "raw-store";

      if (isIncoming) {
        const readyForQc = awaitingLots.filter((l) => Boolean(l.rfidUid) && l.rfidUid !== "unassigned");
        const awaitingRec = awaitingLots.filter((l) => !l.rfidUid || l.rfidUid === "unassigned");
        const actionableOpen = open.filter((t) => {
          if (t.kind === "incoming-qc") {
            return readyForQc.some((l) => l.id === t.subjectId);
          }
          return true;
        });
        return [
          { label: "My open tasks", value: actionableOpen.length },
          { label: "Lots ready for QC", value: readyForQc.length },
          { label: "Awaiting receiving", value: awaitingRec.length },
          { label: "Cleared fabric lots", value: s.lots.filter((l) => l.status === "accepted").length },
        ];
      }

      return [
        { label: "Open inspections", value: openInsp.length },
        { label: "Garments on hold", value: held.length },
        { label: "Reinspections", value: openInsp.filter((i) => i.kind === "reinspection").length },
        { label: "Lots awaiting inspection", value: awaitingLots.length },
      ];
    })(),
    L: [
      { label: "My open tasks", value: open.length },
      {
        label: "Awaiting packing",
        value: s.garments.filter((g) => g.stage === "packing" && !g.packageId && !g.hold).length,
      },
      {
        label: "In finished stock",
        value: s.garments.filter((g) => g.stage === "warehouse" || g.stage === "allocated").length,
      },
      { label: "Shipments in progress", value: activeShipments.length },
    ],
  };

  const alerts: DashboardData["alerts"] = [];
  const isIncomingQc =
    u.role === "Q" &&
    (u.username?.toLowerCase() === "qc.incoming" ||
      u.department?.toLowerCase() === "receiving" ||
      u.department?.toLowerCase() === "raw-store");

  if (!isIncomingQc && ["M", "Q", "P", "L"].includes(u.role))
    held.forEach((g) =>
      alerts.push({
        tone: "danger",
        message: `${g.id} is on quality hold.`,
        href: `/staff/garments/${g.id}`,
      }),
    );
  if (["M", "L"].includes(u.role))
    activeShipments.forEach((sh) => {
      const blocked = sh.garmentIds.filter((id) => s.garments.find((g) => g.id === id)?.hold);
      if (blocked.length)
        alerts.push({
          tone: "warning",
          message: `${sh.id} includes held garments (${blocked.join(", ")}) — departure is blocked.`,
          href: `/staff/shipments/${sh.id}`,
        });
    });
  if (["A", "M"].includes(u.role))
    failedLedger.forEach((l) =>
      alerts.push({
        tone: "warning",
        message: `Commitment ${l.id} failed (${l.lastError ?? "unknown"}).`,
        href: "/staff/ledger",
      }),
    );
  if (["M", "Q"].includes(u.role)) {
    s.lots
      .filter((l) => l.status === "rejected")
      .forEach((l) =>
        alerts.push({
          tone: "danger",
          message: `Material Lot ${l.id} failed incoming QC — quarantined from production.`,
          href: "/staff/quality",
        }),
      );
    s.lots
      .filter((l) => (l.heldQty ?? 0) > 0)
      .forEach((l) =>
        alerts.push({
          tone: "warning",
          message: `Material Lot ${l.id} has ${l.heldQty}${l.unit ?? "m"} on quality hold in quarantine.`,
          href: "/staff/quality",
        }),
      );
  }
  if (isIncomingQc) {
    const readyForQc = awaitingLots.filter((l) => Boolean(l.rfidUid) && l.rfidUid !== "unassigned");
    if (readyForQc.length > 0) {
      alerts.push({
        tone: "info",
        message: `${readyForQc.length} incoming fabric roll(s) ready in quarantine for QC evaluation.`,
        href: "/staff/quality",
      });
    }
  }

  const assigned = open
    .filter((t) => u.role === "M" || t.assigneeId === u.id || !t.assigneeId)
    .slice(0, 6);
  return { metrics: metricsByRole[u.role], assigned, alerts };
}

function reports(s: DemoState, u: StaffUser): ReportsData {
  if (u.role === "Q") {
    const kinds = ["incoming", "final", "reinspection"] as const;
    return {
      counts: [
        { label: "Inspections", value: s.inspections.length },
        { label: "Passed", value: s.inspections.filter((i) => i.status === "passed").length },
        { label: "Failed", value: s.inspections.filter((i) => i.status === "failed").length },
        { label: "Open", value: s.inspections.filter((i) => i.status === "open").length },
      ],
      columns: ["Open", "Passed", "Failed"],
      rows: kinds.map((k) => ({
        label: `${k.charAt(0).toUpperCase()}${k.slice(1)} inspections`,
        columns: {
          Open: s.inspections.filter((i) => i.kind === k && i.status === "open").length,
          Passed: s.inspections.filter((i) => i.kind === k && i.status === "passed").length,
          Failed: s.inspections.filter((i) => i.kind === k && i.status === "failed").length,
        },
      })),
    };
  }
  if (u.role === "A") {
    const statuses = ["pending", "submitted", "failed", "confirmed"] as const;
    return {
      counts: [
        { label: "Staff accounts", value: s.users.length },
        { label: "Suspended", value: s.users.filter((x) => x.status === "suspended").length },
        { label: "Commitments", value: s.ledger.length },
        { label: "Audit events", value: s.audit.length },
      ],
      columns: ["Count"],
      rows: statuses.map((st) => ({
        label: `Commitments ${st}`,
        columns: { Count: s.ledger.filter((l) => l.status === st).length },
      })),
    };
  }
  const stages = [
    "cutting",
    "stitching",
    "finishing",
    "final-qc",
    "rework",
    "packing",
    "warehouse",
    "allocated",
    "dispatched",
  ] as const;
  return {
    counts: [
      { label: "Lots", value: s.lots.length },
      { label: "Orders", value: s.orders.length },
      { label: "Garments", value: s.garments.length },
      {
        label: "Shipments departed",
        value: s.shipments.filter((x) => x.status === "departed").length,
      },
    ],
    columns: ["Garments", "On hold"],
    rows: stages.map((st) => ({
      label: `Stage: ${st}`,
      columns: {
        Garments: s.garments.filter((g) => g.stage === st).length,
        "On hold": s.garments.filter((g) => g.stage === st && g.hold).length,
      },
    })),
  };
}
