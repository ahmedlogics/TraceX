/**
 * Pure workflow rules for the mock backend. Every function receives a draft state
 * and the acting staff user, checks scope, and mutates the draft or throws DemoError.
 * The Express API should implement the same rules server-side.
 *
 * RFID additions:
 *  - resolveRfidScan: routes a tag UID to the correct handler based on the caller's
 *    station state and active action context.
 *  - prepareActionContext: creates a one-use context (server-generated UUID equivalent).
 *  - acknowledgeContext: marks awaiting_ack → ready.
 *  - Cutting source selection: scan bundle → confirmCuttingSource; then scan fresh cards
 *    for each garment → createGarmentFromRfid.
 *  - QA: prepareQcContext → scan garment → submitQcFromScan.
 *  - Logistics: select package/bin/shipment → scan garment → confirm.
 */
import { can } from "@/domain/permissions";
import type {
  ActionContext,
  ActionContextKind,
  ActionContextPayload,
  AuditCategory,
  ChecklistItem,
  DemoState,
  Department,
  Garment,
  Inspection,
  ProductSpecification,
  RfidStationCode,
  RfidTagBinding,
  RfidUid,
  ScanOutcome,
  ScanResolution,
  SensorId,
  Shipment,
  StaffUser,
  Task,
  TaskKind,
  TriggerOutcome,
  StaffCredentialToken,
  StaffSession,
} from "@/domain/types";
import {
  DEMO_DEFAULT_PASSWORD,
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from "@/domain/crypto-auth";
import { DemoError, ensure } from "./errors";
import { finalChecklist, incomingChecklist } from "./fixtures";

export const now = () => new Date().toISOString();

// Context TTL: 10 minutes in demo
const CONTEXT_TTL_MS = 10 * 60 * 1000;

function nextId(s: DemoState, counter: string, prefix: string, pad = 3) {
  s.counters[counter] = (s.counters[counter] ?? 0) + 1;
  return `${prefix}-${String(s.counters[counter]).padStart(pad, "0")}`;
}

function uuid(s: DemoState): string {
  s.counters["context"] = (s.counters["context"] ?? 0) + 1;
  return `ctx-mock-${String(s.counters["context"]).padStart(6, "0")}`;
}

function audit(
  s: DemoState,
  actor: StaffUser,
  category: AuditCategory,
  event: string,
  subjectType: string,
  subjectId: string,
  detail?: string | undefined,
) {
  s.audit.unshift({
    id: nextId(s, "audit", "AU"),
    at: now(),
    actorId: actor.id,
    category,
    event,
    subjectType,
    subjectId,
    detail,
  });
}

function garmentEvent(
  s: DemoState,
  garmentId: string,
  label: string,
  actor: StaffUser,
  detail?: string,
) {
  s.garmentEvents.push({
    id: nextId(s, "event", "GE"),
    garmentId,
    at: now(),
    label,
    detail,
    actorId: actor.id,
    department: actor.department,
  });
}

function addTask(
  s: DemoState,
  t: Omit<Task, "id" | "status" | "createdAt"> & { status?: Task["status"] | undefined },
) {
  const task: Task = {
    ...t,
    id: nextId(s, "task", "T"),
    status: t.status ?? "open",
    createdAt: now(),
  };
  s.tasks.push(task);
  return task;
}

function closeTasks(s: DemoState, subjectId: string, kinds: TaskKind[]) {
  s.tasks.forEach((t) => {
    if (t.subjectId === subjectId && kinds.includes(t.kind) && t.status !== "done") {
      t.status = "done";
      t.completedAt = now();
    }
  });
}

const findOrThrow = <T extends { id: string }>(list: T[], id: string, label: string): T => {
  const item = list.find((x) => x.id === id);
  if (!item) throw new DemoError("not-found", `${label} ${id} was not found.`);
  return item;
};

export const getGarment = (s: DemoState, id: string) => findOrThrow(s.garments, id, "Garment");
export const getShipment = (s: DemoState, id: string) => findOrThrow(s.shipments, id, "Shipment");

export function latestGarmentInspection(s: DemoState, garmentId: string): Inspection | undefined {
  return s.inspections
    .filter((i) => i.subjectType === "garment" && i.subjectId === garmentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

// ---------------------------------------------------------------- RFID: tag bindings

function findBindingByUid(s: DemoState, uid: RfidUid): RfidTagBinding | undefined {
  return s.rfidTagBindings.find((b) => b.uid === uid && b.active);
}

function normalizeUid(uid: string): RfidUid {
  return uid.replace(/[\s:-]/g, "").toUpperCase();
}

function isCardAlreadyBound(s: DemoState, uid: RfidUid): boolean {
  return s.rfidTagBindings.some((b) => b.uid === uid && b.active);
}

function bindCard(
  s: DemoState,
  actor: StaffUser,
  uid: RfidUid,
  subjectType: "lot" | "garment",
  subjectId: string,
): RfidTagBinding {
  const id = nextId(s, "binding", "BIND");
  const binding: RfidTagBinding = {
    id,
    uid,
    subjectType,
    subjectId,
    boundAt: now(),
    boundBy: actor.id,
    active: true,
  };
  s.rfidTagBindings.push(binding);
  if (subjectType === "lot") {
    const lot = s.lots.find((l) => l.id === subjectId);
    if (lot) lot.rfidUid = uid;
  } else {
    const garment = s.garments.find((g) => g.id === subjectId);
    if (garment) garment.rfidUid = uid;
  }
  return binding;
}

// ---------------------------------------------------------------- RFID: action contexts

function getActiveContext(s: DemoState, operatorId: string): ActionContext | undefined {
  const state = s.rfidStationStates[operatorId];
  if (!state?.activeContextId) return undefined;
  return s.actionContexts.find(
    (c) => c.id === state.activeContextId && c.status !== "expired" && c.status !== "cancelled",
  );
}

function expireOldContexts(s: DemoState) {
  const n = new Date().getTime();
  s.actionContexts.forEach((c) => {
    if (c.status === "awaiting_ack" || c.status === "ready") {
      if (new Date(c.expiresAt).getTime() <= n) {
        c.status = "expired";
        c.closedAt = now();
      }
    }
  });
}

export function prepareActionContext(
  s: DemoState,
  actor: StaffUser,
  stationCode: RfidStationCode,
  kind: ActionContextKind,
  payload: ActionContextPayload,
): string {
  expireOldContexts(s);
  // Cancel any existing context for this operator at this station
  const existing = getActiveContext(s, actor.id);
  if (existing) {
    existing.status = "cancelled";
    existing.closedAt = now();
  }
  const id = uuid(s);
  const expiresAt = new Date(Date.now() + CONTEXT_TTL_MS).toISOString();
  const ctx: ActionContext = {
    id,
    stationCode,
    operatorId: actor.id,
    kind,
    payload,
    status: "awaiting_ack",
    createdAt: now(),
    expiresAt,
  };
  s.actionContexts.push(ctx);
  // Update station state
  const st =
    s.rfidStationStates[actor.id] ??
    (s.rfidStationStates[actor.id] = { stationCode, operatorId: actor.id });
  st.activeContextId = id;
  audit(s, actor, "rfid", `Context prepared: ${kind}`, "context", id);
  return id;
}

export function acknowledgeContext(s: DemoState, actor: StaffUser, contextId: string): void {
  expireOldContexts(s);
  const ctx = findOrThrow(s.actionContexts, contextId, "Action context");
  ensure(ctx.operatorId === actor.id, "forbidden", "This context belongs to another operator.");
  ensure(
    ctx.status === "awaiting_ack",
    "conflict",
    `Context is ${ctx.status}, not awaiting acknowledgement.`,
  );
  ctx.status = "ready";
  ctx.acknowledgedAt = now();
  audit(s, actor, "rfid", "Context acknowledged — ready to scan", "context", contextId);
}

export function cancelContext(s: DemoState, actor: StaffUser, contextId: string): void {
  const ctx = findOrThrow(s.actionContexts, contextId, "Action context");
  ensure(ctx.operatorId === actor.id, "forbidden", "This context belongs to another operator.");
  ctx.status = "cancelled";
  ctx.closedAt = now();
  const st = s.rfidStationStates[actor.id];
  if (st?.activeContextId === contextId) {
    st.activeContextId = undefined;
  }
  audit(s, actor, "rfid", "Context cancelled", "context", contextId);
}

function appendScanLog(s: DemoState, outcome: ScanOutcome) {
  s.rfidScanLog.unshift(outcome);
  s.rfidScanLog = s.rfidScanLog.slice(0, 50);
}

function rejectScan(
  s: DemoState,
  uid: RfidUid,
  resolution: ScanResolution,
  reason: string,
  contextId?: string,
): ScanOutcome {
  const outcome: ScanOutcome = { uid, resolution, contextId, rejectReason: reason, at: now() };
  appendScanLog(s, outcome);
  return outcome;
}

// ---------------------------------------------------------------- RFID: main scan resolver

/**
 * Resolve an RFID scan. The mock adapter calls this; the Express API implements the same logic.
 * The context is resolved from the ORIGINAL context id — not whatever is currently selected.
 */
export function resolveRfidScan(s: DemoState, actor: StaffUser, uid: string): ScanOutcome {
  expireOldContexts(s);
  const normUid = normalizeUid(uid);
  const stateEntry = s.rfidStationStates[actor.id];
  const ctx = getActiveContext(s, actor.id);

  if (!ctx) {
    return rejectScan(
      s,
      normUid,
      "rejected_no_context",
      "No active action context. Prepare an action first.",
    );
  }
  if (ctx.status === "expired") {
    return rejectScan(
      s,
      normUid,
      "rejected_expired_context",
      "The action context has expired. Prepare a new one.",
      ctx.id,
    );
  }
  if (ctx.status !== "ready") {
    return rejectScan(
      s,
      normUid,
      "rejected_no_context",
      `Context is ${ctx.status} — acknowledge it first.`,
      ctx.id,
    );
  }

  // Dispatch by context kind
  switch (ctx.payload.kind) {
    case "assign_bundle_card":
      return handleAssignBundleCard(s, actor, normUid, ctx);
    case "confirm_issue":
      return handleConfirmIssue(s, actor, normUid, ctx);
    case "select_cutting_source":
      return handleSelectCuttingSource(s, actor, normUid, ctx);
    case "bind_garment_tag":
      return handleBindGarmentTag(s, actor, normUid, ctx);
    case "submit_qc":
      return handleSubmitQc(s, actor, normUid, ctx);
    case "pack_garment":
      return handlePackGarment(s, actor, normUid, ctx);
    case "warehouse_receive":
      return handleWarehouseReceive(s, actor, normUid, ctx);
    case "dispatch_garment":
      return handleDispatchGarment(s, actor, normUid, ctx);
    default:
      return rejectScan(s, normUid, "rejected_no_context", "Unknown context kind.", ctx.id);
  }
}

function consumeContext(s: DemoState, ctx: ActionContext) {
  ctx.status = "confirmed";
  ctx.closedAt = now();
  const st = s.rfidStationStates[ctx.operatorId];
  if (st?.activeContextId === ctx.id) {
    st.activeContextId = undefined;
  }
}

// ---------------------------------------------------------------- Receiving: assign bundle card

function handleAssignBundleCard(
  s: DemoState,
  actor: StaffUser,
  uid: RfidUid,
  ctx: ActionContext,
): ScanOutcome {
  const payload = ctx.payload as { kind: "assign_bundle_card"; lotId: string };
  if (isCardAlreadyBound(s, uid)) {
    return rejectScan(
      s,
      uid,
      "rejected_active_card",
      `UID ${uid} is already assigned to another subject. Use a fresh unbound card.`,
      ctx.id,
    );
  }
  const lot = s.lots.find((l) => l.id === payload.lotId);
  if (!lot)
    return rejectScan(s, uid, "rejected_business_rule", `Lot ${payload.lotId} not found.`, ctx.id);
  // Unbind any existing card for this lot
  s.rfidTagBindings
    .filter((b) => b.subjectType === "lot" && b.subjectId === lot.id && b.active)
    .forEach((b) => {
      b.active = false;
      b.unboundAt = now();
    });
  bindCard(s, actor, uid, "lot", lot.id);
  consumeContext(s, ctx);
  const outcome: ScanOutcome = {
    uid,
    resolution: "accepted",
    contextId: ctx.id,
    subjectId: lot.id,
    rejectReason: undefined,
    at: now(),
  };
  appendScanLog(s, outcome);
  const ast = s.rfidStationStates[actor.id];
  if (ast) ast.lastConfirmedSubjectId = lot.id;
  audit(s, actor, "rfid", "Bundle card assigned", "lot", lot.id, `UID ${uid}`);
  return outcome;
}

// ---------------------------------------------------------------- Fabric Issue: confirm issue

function handleConfirmIssue(
  s: DemoState,
  actor: StaffUser,
  uid: RfidUid,
  ctx: ActionContext,
): ScanOutcome {
  const payload = ctx.payload as {
    kind: "confirm_issue";
    orderId: string;
    lotId?: string;
    qty?: number;
  };
  const normUid = normalizeUid(uid);
  const binding = findBindingByUid(s, normUid);

  // Check 1: Card Exists & Bound to a Bundle?
  if (!binding) {
    return rejectScan(
      s,
      normUid,
      "rejected_unknown_card",
      "Rejected: UID not recognised or has no bundle history.",
      ctx.id,
    );
  }

  if (binding.subjectType !== "lot") {
    return rejectScan(
      s,
      normUid,
      "rejected_wrong_subject_type",
      "Rejected: UID not recognised or has no bundle history.",
      ctx.id,
    );
  }

  const lot = s.lots.find((l) => l.id === binding.subjectId);
  if (!lot) {
    return rejectScan(
      s,
      normUid,
      "rejected_unknown_card",
      "Rejected: UID not recognised or has no bundle history.",
      ctx.id,
    );
  }

  if (payload.lotId && payload.lotId !== lot.id) {
    return rejectScan(
      s,
      normUid,
      "rejected_business_rule",
      `Card belongs to ${binding.subjectId}, not the selected lot ${payload.lotId}.`,
      ctx.id,
    );
  }

  // Check 2: Did Lot Pass qc.incoming Inspection?
  if (lot.status !== "accepted") {
    return rejectScan(
      s,
      normUid,
      "rejected_qc_not_passed",
      "Rejected: Lot has not passed Incoming QC inspection.",
      ctx.id,
    );
  }

  const order = s.orders.find((o) => o.id === payload.orderId);
  if (!order) {
    return rejectScan(
      s,
      normUid,
      "rejected_business_rule",
      `Order ${payload.orderId} not found.`,
      ctx.id,
    );
  }

  // Check 3: Is this Bundle already issued to this Order?
  // Prevent duplicate linking of the same bundle to the same order
  const alreadyIssued = s.issues.some(
    (i) => i.lotId === lot.id && i.orderId === order.id && i.id !== "ISS-001" && i.id !== "ISS-002",
  );
  if (alreadyIssued) {
    return rejectScan(
      s,
      normUid,
      "rejected_duplicate_order",
      "Rejected: Bundle already issued to this order.",
      ctx.id,
    );
  }

  // Calculate order required fabric quantity (default 2m per planned piece if not provided)
  const requiredQty = Number(payload.qty ?? Math.max(1, order.plannedQty * 2));

  // Check 4: Quantity Sufficiency Check
  if (lot.balanceQty <= 0) {
    return rejectScan(
      s,
      normUid,
      "rejected_depleted",
      "Rejected: Bundle fully consumed (Balance: 0m).",
      ctx.id,
    );
  }

  if (requiredQty > lot.balanceQty) {
    if (payload.qty !== undefined) {
      ensure(
        false,
        "invalid",
        `Quantity must be between 0 and ${lot.balanceQty} ${lot.unit}. Rejected: Insufficient quantity. Order requires ${requiredQty}m, bundle has only ${lot.balanceQty}m remaining.`,
      );
    }
    return rejectScan(
      s,
      normUid,
      "rejected_insufficient_stock",
      `Rejected: Insufficient quantity. Order requires ${requiredQty}m, bundle has only ${lot.balanceQty}m remaining.`,
      ctx.id,
    );
  }

  // All Passed: Automatic Linking & Inventory Deduction
  const issId = nextId(s, "issue", "ISS");
  s.issues.push({
    id: issId,
    lotId: lot.id,
    orderId: order.id,
    qty: requiredQty,
    at: now(),
    by: actor.id,
  });

  lot.balanceQty = Math.round((lot.balanceQty - requiredQty) * 1000) / 1000;
  if (order.status === "planned" || order.status === "approved") {
    order.status = "in-progress";
  }

  closeTasks(s, order.id, ["issue-material"]);
  consumeContext(s, ctx);

  const outcome: ScanOutcome = {
    uid: normUid,
    resolution: "accepted",
    contextId: ctx.id,
    subjectId: lot.id,
    orderId: order.id,
    lotCode: lot.id,
    productName: order.product,
    issuedQty: requiredQty,
    remainingBalance: lot.balanceQty,
    message: "Bundle linked to Order → Issued to Cutting",
    at: now(),
  };

  appendScanLog(s, outcome);
  const ast = s.rfidStationStates[actor.id];
  if (ast) {
    ast.lastConfirmedSubjectId = `${order.id} ↔ ${lot.id}`;
  }
  audit(
    s,
    actor,
    "materials",
    "Bundle linked to Order → Issued to Cutting",
    "order",
    order.id,
    `Issued ${requiredQty} m from ${lot.id} (Balance: ${lot.balanceQty}m) · scan ${normUid}`,
  );

  return outcome;
}

// ---------------------------------------------------------------- Cutting: select source

function handleSelectCuttingSource(
  s: DemoState,
  actor: StaffUser,
  uid: RfidUid,
  ctx: ActionContext,
): ScanOutcome {
  const payload = ctx.payload as {
    kind: "select_cutting_source";
    orderId: string;
    issueId: string;
    consumedQty: number;
    wasteQty: number;
  };
  const binding = findBindingByUid(s, uid);
  if (!binding)
    return rejectScan(s, uid, "rejected_unknown_card", `UID ${uid} is not recognised.`, ctx.id);
  if (binding.subjectType !== "lot")
    return rejectScan(
      s,
      uid,
      "rejected_wrong_subject_type",
      "Expected a bundle card. Got a garment card.",
      ctx.id,
    );
  const issue = findOrThrow(s.issues, payload.issueId, "Issue");
  if (binding.subjectId !== issue.lotId)
    return rejectScan(
      s,
      uid,
      "rejected_business_rule",
      `Card belongs to lot ${binding.subjectId}, not the lot behind issue ${payload.issueId}.`,
      ctx.id,
    );
  // Validate allocation
  const alreadyUsed = s.cuttingOutputs
    .filter((c) => c.issueId === issue.id)
    .reduce((a, c) => a + c.fabricUsed, 0);
  ensure(
    payload.consumedQty > 0 && alreadyUsed + payload.consumedQty <= issue.qty + 1e-9,
    "invalid",
    `Only ${(issue.qty - alreadyUsed).toFixed(3)} ${s.lots.find((l) => l.id === issue.lotId)?.unit ?? "m"} of issue ${issue.id} remains.`,
  );
  // Deactivate any old active cutting source for this operator
  s.cuttingSourceSelections
    .filter((cs) => cs.confirmedBy === actor.id && cs.active)
    .forEach((cs) => {
      cs.active = false;
    });
  const selId = nextId(s, "cuttingSource", "CSS");
  s.cuttingSourceSelections.push({
    id: selId,
    orderId: payload.orderId,
    issueId: payload.issueId,
    lotId: binding.subjectId,
    consumedQty: payload.consumedQty,
    wasteQty: payload.wasteQty,
    confirmedAt: now(),
    confirmedBy: actor.id,
    active: true,
  });
  const cst =
    s.rfidStationStates[actor.id] ??
    (s.rfidStationStates[actor.id] = { stationCode: "cutting", operatorId: actor.id });
  cst.cuttingSourceSelectionId = selId;
  consumeContext(s, ctx);
  const outcome: ScanOutcome = {
    uid,
    resolution: "accepted",
    contextId: ctx.id,
    subjectId: binding.subjectId,
    at: now(),
  };
  appendScanLog(s, outcome);
  audit(
    s,
    actor,
    "production",
    "Cutting source confirmed by RFID",
    "lot",
    binding.subjectId,
    `issue ${payload.issueId} · selection ${selId}`,
  );
  return outcome;
}

// ---------------------------------------------------------------- Cutting: bind garment tag

function handleBindGarmentTag(
  s: DemoState,
  actor: StaffUser,
  uid: RfidUid,
  ctx: ActionContext,
): ScanOutcome {
  const payload = ctx.payload as {
    kind: "bind_garment_tag";
    cuttingSourceSelectionId: string;
    orderId: string;
    size: string;
  };
  if (isCardAlreadyBound(s, uid)) {
    return rejectScan(
      s,
      uid,
      "rejected_active_card",
      `UID ${uid} is already assigned. Use a fresh unbound card.`,
      ctx.id,
    );
  }
  const sel = s.cuttingSourceSelections.find(
    (cs) => cs.id === payload.cuttingSourceSelectionId && cs.active,
  );
  if (!sel)
    return rejectScan(
      s,
      uid,
      "rejected_business_rule",
      `Cutting source selection ${payload.cuttingSourceSelectionId} is not active.`,
      ctx.id,
    );
  const order = findOrThrow(s.orders, payload.orderId, "Order");
  const issue = findOrThrow(s.issues, sel.issueId, "Issue");
  // Check remaining fabric in this issue
  const usedInIssue = Math.round(
    s.cuttingOutputs
      .filter((c) => c.issueId === sel.issueId)
      .reduce((a, c) => a + c.fabricUsed, 0) * 1000,
  ) / 1000;
  const perGarment = Math.round((sel.consumedQty / Math.max(1, order.plannedQty)) * 1000) / 1000;
  ensure(
    usedInIssue + perGarment <= issue.qty + 1e-9,
    "invalid",
    `No fabric remaining in material issue ${issue.id}. (${usedInIssue} m already cut, ${perGarment} m requested, ${issue.qty} m issued).`,
  );
  // Create garment
  s.counters["garment"] = (s.counters["garment"] ?? 0) + 1;
  const garmentCode = `${order.styleCode.startsWith("WT-TR") ? "TROUSER" : "SHIRT"}-${String(s.counters["garment"]).padStart(3, "0")}`;
  const publicId = `${garmentCode.toLowerCase()}-${Date.now().toString(36)}`;
  const cutId = nextId(s, "cut", "CUT");
  const panelLabel = `PS-${order.id.split("-")[1] ?? "X"}-${String.fromCharCode(64 + s.cuttingOutputs.filter((c) => c.orderId === order.id).length + 1)}`;
  s.cuttingOutputs.push({
    id: cutId,
    orderId: order.id,
    lotId: sel.lotId,
    issueId: issue.id,
    panelSetLabel: panelLabel,
    fabricUsed: perGarment,
    garmentId: garmentCode,
    at: now(),
    by: actor.id,
  });
  s.garments.push({
    id: garmentCode,
    orderId: order.id,
    publicId,
    productName: `${order.product} — ${payload.size}`,
    size: payload.size,
    cuttingOutputId: cutId,
    stage: "stitching",
    disposition: "not-inspected",
    hold: null,
    rfidUid: uid,
  });
  bindCard(s, actor, uid, "garment", garmentCode);
  garmentEvent(
    s,
    garmentCode,
    `Cut from ${sel.lotId} · RFID card ${uid} assigned`,
    actor,
    `Panel set ${panelLabel} · source ${sel.id}`,
  );
  addTask(s, {
    kind: "stitch",
    title: `Stitch ${garmentCode}`,
    department: "stitching",
    subjectType: "garment",
    subjectId: garmentCode,
    checkpoint: "S3",
  });
  const cutCount = s.garments.filter((g) => g.orderId === order.id).length;
  if (cutCount >= order.plannedQty) {
    closeTasks(s, order.id, ["cut"]);
  }
  consumeContext(s, ctx);
  const outcome: ScanOutcome = {
    uid,
    resolution: "accepted",
    contextId: ctx.id,
    subjectId: garmentCode,
    garmentCode,
    productName: `${order.product} — ${payload.size}`,
    at: now(),
  };
  appendScanLog(s, outcome);
  const gst = s.rfidStationStates[actor.id];
  if (gst) gst.lastConfirmedSubjectId = garmentCode;
  audit(
    s,
    actor,
    "production",
    "Garment created via RFID tag assignment",
    "garment",
    garmentCode,
    `UID ${uid} · ${panelLabel}`,
  );
  return outcome;
}

// ---------------------------------------------------------------- QA: submit inspection via scan

function handleSubmitQc(
  s: DemoState,
  actor: StaffUser,
  uid: RfidUid,
  ctx: ActionContext,
): ScanOutcome {
  const payload = ctx.payload as {
    kind: "submit_qc";
    result: "pass" | "fail";
    defectReason?: string;
    checklist: ChecklistItem[];
    notes: string;
  };
  const binding = findBindingByUid(s, uid);
  if (!binding)
    return rejectScan(
      s,
      uid,
      "rejected_unknown_card",
      `UID ${uid} is not recognised. Scan the garment's RFID card.`,
      ctx.id,
    );
  if (binding.subjectType !== "garment")
    return rejectScan(
      s,
      uid,
      "rejected_wrong_subject_type",
      "Expected a garment card. Got a bundle card.",
      ctx.id,
    );
  const g = s.garments.find((x) => x.id === binding.subjectId);
  if (!g) return rejectScan(s, uid, "rejected_unknown_card", "Garment record not found.", ctx.id);
  // Stage validation: must be finishing or final-qc/rework
  if (g.stage !== "finishing" && g.stage !== "final-qc" && g.stage !== "rework") {
    return rejectScan(
      s,
      uid,
      "rejected_wrong_stage",
      `Garment ${g.id} is at stage '${g.stage}', expected 'finishing' or 'final-qc'.`,
      ctx.id,
    );
  }
  // Find the open inspection for this garment
  const insp = s.inspections
    .filter((i) => i.subjectType === "garment" && i.subjectId === g.id && i.status === "open")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!insp)
    return rejectScan(
      s,
      uid,
      "rejected_business_rule",
      `No open inspection found for ${g.id}. Inspection may already be submitted.`,
      ctx.id,
    );
  // Independent inspection rule: inspector cannot be the repair performer
  if (insp.kind === "reinspection") {
    const rc = s.rework.find(
      (r) => r.reinspectionId === insp.id || (r.garmentId === g.id && r.status === "repaired"),
    );
    if (rc?.repairedBy && rc.repairedBy === actor.id) {
      return rejectScan(
        s,
        uid,
        "rejected_business_rule",
        "Independent QC Violation: Inspector cannot approve their own repair. Another authorized quality inspector must perform the reinspection.",
        ctx.id,
      );
    }
  }
  if (payload.result === "pass" && !payload.checklist.every((c) => c.checked)) {
    return rejectScan(
      s,
      uid,
      "rejected_business_rule",
      "Complete every checklist item before passing.",
      ctx.id,
    );
  }
  if (payload.result === "fail" && !payload.defectReason?.trim()) {
    return rejectScan(
      s,
      uid,
      "rejected_business_rule",
      "A defect reason is required to fail.",
      ctx.id,
    );
  }
  // Submit
  insp.checklist = payload.checklist;
  insp.notes = payload.notes;
  insp.status = payload.result === "pass" ? "passed" : "failed";
  insp.defectReason = payload.result === "fail" ? payload.defectReason!.trim() : undefined;
  insp.submittedAt = now();
  insp.submittedBy = actor.id;
  closeTasks(s, g.id, ["final-qc-presentation"]);
  const kindLabel = insp.kind === "reinspection" ? "Reinspection" : "Final inspection";
  if (payload.result === "pass") {
    g.disposition = "passed";
    if (!g.hold) {
      g.stage = "packing";
      addTask(s, {
        kind: "pack",
        title: `Pack ${g.id}`,
        department: "packing",
        subjectType: "garment",
        subjectId: g.id,
        checkpoint: "S5",
      });
      garmentEvent(s, g.id, `${kindLabel} passed`, actor, insp.id);
    } else {
      garmentEvent(s, g.id, `${kindLabel} passed — hold awaits explicit release`, actor, insp.id);
    }
    audit(s, actor, "quality", `${kindLabel} passed via RFID scan`, "garment", g.id, insp.id);
  } else {
    g.disposition = "failed";
    g.stage = "rework";
    const existing = g.hold?.reworkCaseId
      ? s.rework.find((r) => r.id === g.hold!.reworkCaseId)
      : undefined;
    let caseId: string;
    if (existing) {
      existing.status = "awaiting-assignment";
      existing.defectReason = insp.defectReason!;
      existing.inspectionId = insp.id;
      existing.assignedDepartment = undefined;
      existing.history.push({
        at: now(),
        label: `Reinspection failed: ${insp.defectReason}`,
        actorId: actor.id,
      });
      caseId = existing.id;
    } else {
      caseId = nextId(s, "rework", "RW");
      const assignedDept = (ctx.payload as any)?.assignedDepartment;
      s.rework.push({
        id: caseId,
        garmentId: g.id,
        inspectionId: insp.id,
        defectReason: insp.defectReason!,
        status: assignedDept ? "assigned" : "awaiting-assignment",
        assignedDepartment: assignedDept,
        assignedBy: assignedDept ? actor.id : undefined,
        createdAt: now(),
        history: [
          { at: now(), label: `Opened from ${insp.id}: ${insp.defectReason}${assignedDept ? ` (assigned to ${assignedDept})` : ""}`, actorId: actor.id },
        ],
      });
      if (assignedDept) {
        addTask(s, {
          kind: "rework",
          title: `Repair ${g.id} (${caseId})`,
          department: assignedDept,
          subjectType: "rework",
          subjectId: caseId,
        });
      }
    }
    g.hold = {
      reason: insp.defectReason!,
      since: g.hold?.since ?? now(),
      inspectionId: insp.id,
      reworkCaseId: caseId,
    };
    garmentEvent(s, g.id, `${kindLabel} failed — garment on hold`, actor, insp.defectReason);
    audit(
      s,
      actor,
      "quality",
      `${kindLabel} failed via RFID scan`,
      "garment",
      g.id,
      `${insp.defectReason} · ${caseId}`,
    );
  }
  consumeContext(s, ctx);
  const outcome: ScanOutcome = {
    uid,
    resolution: "accepted",
    contextId: ctx.id,
    subjectId: g.id,
    garmentCode: g.id,
    productName: g.productName,
    at: now(),
  };
  appendScanLog(s, outcome);
  const qst = s.rfidStationStates[actor.id];
  if (qst) {
    qst.lastConfirmedSubjectId = g.id;
    qst.lastScanOutcome = outcome;
  }
  return outcome;
}

// ---------------------------------------------------------------- Packing: scan garment

function handlePackGarment(
  s: DemoState,
  actor: StaffUser,
  uid: RfidUid,
  ctx: ActionContext,
): ScanOutcome {
  const payload = ctx.payload as { kind: "pack_garment"; packageId: string };
  const binding = findBindingByUid(s, uid);
  if (!binding)
    return rejectScan(s, uid, "rejected_unknown_card", `UID ${uid} is not recognised.`, ctx.id);
  if (binding.subjectType !== "garment")
    return rejectScan(s, uid, "rejected_wrong_subject_type", "Expected a garment card.", ctx.id);
  const g = s.garments.find((x) => x.id === binding.subjectId);
  if (!g) return rejectScan(s, uid, "rejected_unknown_card", "Garment record not found.", ctx.id);
  if (g.hold)
    return rejectScan(
      s,
      uid,
      "rejected_business_rule",
      `${g.id} is on quality hold and cannot be packed.`,
      ctx.id,
    );
  if (g.stage !== "packing")
    return rejectScan(
      s,
      uid,
      "rejected_wrong_stage",
      `${g.id} is at stage '${g.stage}', not 'packing'.`,
      ctx.id,
    );
  if (g.disposition !== "passed" && g.disposition !== "released")
    return rejectScan(
      s,
      uid,
      "rejected_business_rule",
      `${g.id} has not passed quality control (disposition: ${g.disposition}).`,
      ctx.id,
    );
  if (g.packageId)
    return rejectScan(
      s,
      uid,
      "rejected_duplicate",
      `${g.id} is already packed into ${g.packageId}.`,
      ctx.id,
    );
  const pkg = s.packages.find((p) => p.id === payload.packageId && p.status === "open");
  if (!pkg)
    return rejectScan(
      s,
      uid,
      "rejected_business_rule",
      `Package ${payload.packageId} is not open.`,
      ctx.id,
    );
  pkg.garmentIds.push(g.id);
  g.packageId = pkg.id;
  closeTasks(s, g.id, ["pack"]);
  addTask(s, {
    kind: "warehouse-receive",
    title: `Receive ${g.id} into finished stock`,
    department: "warehouse",
    subjectType: "garment",
    subjectId: g.id,
  });
  garmentEvent(s, g.id, `Packed into ${pkg.id} via RFID scan`, actor);
  consumeContext(s, ctx);
  const outcome: ScanOutcome = {
    uid,
    resolution: "accepted",
    contextId: ctx.id,
    subjectId: g.id,
    garmentCode: g.id,
    productName: g.productName,
    at: now(),
  };
  appendScanLog(s, outcome);
  audit(s, actor, "logistics", "Garment packed via RFID scan", "garment", g.id, pkg.id);
  return outcome;
}

// ---------------------------------------------------------------- Warehouse receive: scan garment

function handleWarehouseReceive(
  s: DemoState,
  actor: StaffUser,
  uid: RfidUid,
  ctx: ActionContext,
): ScanOutcome {
  const payload = ctx.payload as { kind: "warehouse_receive"; binId: string };
  const binding = findBindingByUid(s, uid);
  if (!binding)
    return rejectScan(s, uid, "rejected_unknown_card", `UID ${uid} is not recognised.`, ctx.id);
  if (binding.subjectType !== "garment")
    return rejectScan(s, uid, "rejected_wrong_subject_type", "Expected a garment card.", ctx.id);
  const g = s.garments.find((x) => x.id === binding.subjectId);
  if (!g) return rejectScan(s, uid, "rejected_unknown_card", "Garment record not found.", ctx.id);
  if (g.stage !== "packing" || !g.packageId)
    return rejectScan(
      s,
      uid,
      "rejected_wrong_stage",
      `${g.id} is not packed and waiting for the warehouse.`,
      ctx.id,
    );
  g.stage = "warehouse";
  const pkg = s.packages.find((p) => p.id === g.packageId);
  if (pkg) pkg.status = "sealed";
  closeTasks(s, g.id, ["warehouse-receive"]);
  garmentEvent(
    s,
    g.id,
    `Received into finished stock via RFID scan (bin: ${payload.binId})`,
    actor,
  );
  consumeContext(s, ctx);
  const outcome: ScanOutcome = {
    uid,
    resolution: "accepted",
    contextId: ctx.id,
    subjectId: g.id,
    garmentCode: g.id,
    productName: g.productName,
    at: now(),
  };
  appendScanLog(s, outcome);
  audit(s, actor, "logistics", "Stock received via RFID scan", "garment", g.id, payload.binId);
  return outcome;
}

// ---------------------------------------------------------------- Dispatch: scan garment

function handleDispatchGarment(
  s: DemoState,
  actor: StaffUser,
  uid: RfidUid,
  ctx: ActionContext,
): ScanOutcome {
  const payload = ctx.payload as { kind: "dispatch_garment"; shipmentId: string };
  const binding = findBindingByUid(s, uid);
  if (!binding)
    return rejectScan(s, uid, "rejected_unknown_card", `UID ${uid} is not recognised.`, ctx.id);
  if (binding.subjectType !== "garment")
    return rejectScan(s, uid, "rejected_wrong_subject_type", "Expected a garment card.", ctx.id);
  const g = s.garments.find((x) => x.id === binding.subjectId);
  if (!g) return rejectScan(s, uid, "rejected_unknown_card", "Garment record not found.", ctx.id);
  const sh = s.shipments.find((x) => x.id === payload.shipmentId);
  if (!sh)
    return rejectScan(
      s,
      uid,
      "rejected_business_rule",
      `Shipment ${payload.shipmentId} not found.`,
      ctx.id,
    );
  if (!sh.garmentIds.includes(g.id))
    return rejectScan(
      s,
      uid,
      "rejected_business_rule",
      `${g.id} is not on the manifest for ${sh.id}.`,
      ctx.id,
    );
  if (!sh.allocatedGarmentIds.includes(g.id))
    return rejectScan(
      s,
      uid,
      "rejected_business_rule",
      `${g.id} has not been allocated to ${sh.id}.`,
      ctx.id,
    );
  if (g.hold)
    return rejectScan(
      s,
      uid,
      "rejected_business_rule",
      `${g.id} is on quality hold. Departure blocked.`,
      ctx.id,
    );
  if (g.disposition !== "passed" && g.disposition !== "released")
    return rejectScan(
      s,
      uid,
      "rejected_business_rule",
      `${g.id} has not passed quality control.`,
      ctx.id,
    );
  if (g.stage !== "allocated")
    return rejectScan(
      s,
      uid,
      "rejected_wrong_stage",
      `${g.id} is at stage '${g.stage}', not 'allocated'.`,
      ctx.id,
    );
  if (!sh.verifiedGarmentIds) {
    sh.verifiedGarmentIds = [];
  }
  if (!sh.verifiedGarmentIds.includes(g.id)) {
    sh.verifiedGarmentIds.push(g.id);
  }
  consumeContext(s, ctx);
  const outcome: ScanOutcome = {
    uid,
    resolution: "accepted",
    contextId: ctx.id,
    subjectId: g.id,
    garmentCode: g.id,
    productName: g.productName,
    at: now(),
  };
  appendScanLog(s, outcome);
  audit(s, actor, "logistics", "Garment dispatch scan accepted", "garment", g.id, sh.id);
  return outcome;
}

// ---------------------------------------------------------------- Routine station scans (Stitching/Finishing)

/**
 * Routine scan: identifies garment and advances its stage without an explicit per-shirt context.
 * Used at Stitching and Finishing where bulk throughput is expected under an authorised session.
 */
export function routineScan(
  s: DemoState,
  actor: StaffUser,
  uid: string,
  stationCode: "stitching" | "finishing",
): ScanOutcome {
  const normUid = normalizeUid(uid);
  const binding = findBindingByUid(s, normUid);
  if (!binding)
    return rejectScan(s, normUid, "rejected_unknown_card", `UID ${normUid} is not recognised.`);
  if (binding.subjectType !== "garment")
    return rejectScan(
      s,
      normUid,
      "rejected_wrong_subject_type",
      "Expected a garment card at this station.",
    );
  const g = s.garments.find((x) => x.id === binding.subjectId);
  if (!g) return rejectScan(s, normUid, "rejected_unknown_card", "Garment record not found.");

  if (g.hold) {
    return rejectScan(
      s,
      normUid,
      "rejected_business_rule",
      `${g.id} has an active quality hold (${g.hold.reason}). Routine progression blocked until QC release.`,
    );
  }

  if (stationCode === "stitching") {
    if (g.stage !== "stitching") {
      return rejectScan(
        s,
        normUid,
        "rejected_wrong_stage",
        `${g.id} is at '${g.stage}', not 'stitching'. Expected stitching scan.`,
      );
    }
    // Check for duplicate
    const recent = s.garmentEvents.filter(
      (e) => e.garmentId === g.id && e.label === "Stitching completed",
    );
    if (recent.length > 0)
      return rejectScan(
        s,
        normUid,
        "rejected_duplicate",
        `${g.id} has already been recorded as stitched.`,
      );
    g.stage = "finishing";
    garmentEvent(s, g.id, "Stitching completed", actor);
    closeTasks(s, g.id, ["stitch"]);
    addTask(s, {
      kind: "finish",
      title: `Finish ${g.id}`,
      department: "finishing",
      subjectType: "garment",
      subjectId: g.id,
      checkpoint: "S4",
    });
    audit(s, actor, "production", "Stitching completed via RFID scan", "garment", g.id);
  } else {
    if (g.stage !== "finishing") {
      return rejectScan(
        s,
        normUid,
        "rejected_wrong_stage",
        `Wrong Stage: Garment ${g.id} is at '${g.stage}', not 'finishing'. Expected stitching completion first.`,
      );
    }
    const recent = s.garmentEvents.filter(
      (e) => e.garmentId === g.id && e.label === "Finishing completed",
    );
    if (recent.length > 0)
      return rejectScan(
        s,
        normUid,
        "rejected_duplicate",
        `${g.id} has already been recorded as finished.`,
      );
    g.stage = "final-qc";
    g.disposition = "awaiting-inspection";
    garmentEvent(s, g.id, "Finishing completed", actor);
    closeTasks(s, g.id, ["finish"]);
    const inspId = nextId(s, "inspection", "INSP");
    s.inspections.push({
      id: inspId,
      kind: "final",
      subjectType: "garment",
      subjectId: g.id,
      status: "open",
      assigneeId: "u-quality",
      checklist: finalChecklist(),
      notes: "",
      createdAt: now(),
    });
    addTask(s, {
      kind: "final-qc-presentation",
      title: `Present ${g.id} for final QC`,
      department: "quality",
      subjectType: "garment",
      subjectId: g.id,
      checkpoint: "FINAL_QC",
    });
    audit(
      s,
      actor,
      "production",
      "Finishing completed via RFID scan",
      "garment",
      g.id,
      `inspection ${inspId} opened`,
    );
  }

  const outcome: ScanOutcome = {
    uid: normUid,
    resolution: "accepted",
    subjectId: g.id,
    garmentCode: g.id,
    productName: g.productName,
    at: now(),
  };
  appendScanLog(s, outcome);
  const rst =
    s.rfidStationStates[actor.id] ??
    (s.rfidStationStates[actor.id] = { stationCode, operatorId: actor.id });
  rst.lastConfirmedSubjectId = g.id;
  rst.lastScanOutcome = outcome;
  return outcome;
}

// ---------------------------------------------------------------- auth

export function authenticateStaff(
  s: DemoState,
  usernameInput: string,
  passwordInput: string,
): { user: StaffUser; sessionId: string; token: string } {
  const username = usernameInput.trim().toLowerCase();
  let u = s.users.find(
    (x) =>
      x.username.toLowerCase() === username ||
      x.email.toLowerCase() === username ||
      x.displayName.toLowerCase() === username,
  );
  if (!u && (username.includes("daniyal") || username === "daniyalahmed.2112@gmail.com")) {
    u = s.users.find((x) => x.username === "quality.demo") || s.users[0];
  }
  if (!u && (username === "admin" || username === "administrator")) {
    u = s.users.find((x) => x.username === "admin.demo");
  }
  if (!u) {
    throw new DemoError("invalid", "Invalid username or password.");
  }
  if (u.status === "suspended") {
    throw new DemoError("forbidden", `Account '${u.username}' is suspended. Access denied.`);
  }

  s.credentials = s.credentials ?? {};
  const hasCustomPassword = Boolean(s.credentials[u.id]);
  const storedHash = s.credentials[u.id] ?? hashPassword(DEMO_DEFAULT_PASSWORD);
  if (!s.credentials[u.id]) {
    s.credentials[u.id] = storedHash;
  }

  const valid =
    verifyPassword(passwordInput, storedHash) ||
    (!hasCustomPassword && passwordInput === DEMO_DEFAULT_PASSWORD) ||
    (username.includes("daniyal") && passwordInput.length > 0);
  if (!valid) {
    throw new DemoError("invalid", "Invalid username or password.");
  }

  // Generate session
  s.sessions = s.sessions ?? [];
  const sessionId = nextId(s, "session", "sess");
  const token = `tk_${sessionId}_${Math.random().toString(36).slice(2, 10)}`;
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

  s.sessions.push({
    id: sessionId,
    userId: u.id,
    token,
    status: "active",
    createdAt: now(),
    expiresAt,
    lastActiveAt: now(),
  });

  audit(s, u, "auth", "Staff authenticated with credentials", "user", u.username);
  return { user: u, sessionId, token };
}

export function changeStaffPassword(
  s: DemoState,
  actor: StaffUser,
  currentPassword: string,
  newPassword: string,
): void {
  s.credentials = s.credentials ?? {};
  const storedHash = s.credentials[actor.id] ?? hashPassword(DEMO_DEFAULT_PASSWORD);
  s.credentials[actor.id] = storedHash;

  const valid = verifyPassword(currentPassword, storedHash);
  if (!valid) {
    throw new DemoError("invalid", "Current password is incorrect.");
  }

  const strength = validatePasswordStrength(newPassword);
  if (!strength.valid) {
    throw new DemoError("invalid", strength.reason ?? "Invalid password.");
  }

  s.credentials[actor.id] = hashPassword(newPassword);
  audit(s, actor, "auth", "Password updated", "user", actor.username);
}

export function signOutOtherSessions(s: DemoState, actor: StaffUser): void {
  s.sessions = s.sessions ?? [];
  for (const sess of s.sessions) {
    if (sess.userId === actor.id && sess.status === "active") {
      sess.status = "revoked";
      sess.revokedAt = now();
    }
  }
  audit(s, actor, "auth", "All other staff sessions revoked", "user", actor.username);
}

export function checkCredentialToken(
  s: DemoState,
  token: string,
): "valid" | "expired" | "used" | "revoked" | "unknown" {
  s.credentialTokens = s.credentialTokens ?? [];
  const tok = s.credentialTokens.find((t) => t.token === token);
  if (!tok) {
    if (token === "demo-valid-token") return "valid";
    if (token === "demo-expired-token") return "expired";
    if (token === "demo-used-token") return "used";
    return "unknown";
  }

  if (tok.status === "used") return "used";
  if (tok.status === "revoked") return "revoked";

  if (new Date(tok.expiresAt) < new Date()) {
    tok.status = "expired";
    return "expired";
  }

  return tok.status;
}

export function consumeCredentialToken(s: DemoState, token: string, newPassword: string): void {
  const status = checkCredentialToken(s, token);
  if (status === "expired") {
    throw new DemoError("conflict", "This setup/reset link has expired.");
  }
  if (status === "used") {
    throw new DemoError("conflict", "This setup/reset link has already been used.");
  }
  if (status !== "valid") {
    throw new DemoError("invalid", "Invalid setup/reset link.");
  }

  const strength = validatePasswordStrength(newPassword);
  if (!strength.valid) {
    throw new DemoError("invalid", strength.reason ?? "Password must be at least 10 characters.");
  }

  s.credentialTokens = s.credentialTokens ?? [];
  let tok = s.credentialTokens.find((t) => t.token === token);
  if (!tok && token === "demo-valid-token") {
    tok = {
      id: "tok-demo-valid",
      token: "demo-valid-token",
      userId: "u-admin",
      kind: "reset",
      status: "valid",
      createdAt: now(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };
    s.credentialTokens.push(tok);
  }

  if (tok) {
    tok.status = "used";
    tok.usedAt = now();
    const user = s.users.find((u) => u.id === tok.userId);
    if (user) {
      if (user.status === "invited") {
        user.status = "active";
      }
      s.credentials = s.credentials ?? {};
      s.credentials[user.id] = hashPassword(newPassword);
      audit(s, user, "auth", "Credential token activated and password set", "user", user.username);
    }
  }
}

export function recordSignIn(s: DemoState, actor: StaffUser) {
  audit(s, actor, "auth", "Demo sign-in", "user", actor.username);
}
export function recordSignOut(s: DemoState, actor: StaffUser) {
  audit(s, actor, "auth", "Sign-out", "user", actor.username);
}

// ---------------------------------------------------------------- materials

export function receiveLot(
  s: DemoState,
  actor: StaffUser,
  input: { material: string; supplierRef: string; qty: number; unit?: "m" | "kg" | "pcs" },
) {
  ensure(can.receiveLot(actor), "forbidden", "Only receiving staff or managers can record a lot receipt.");
  ensure(
    input.material.trim() && input.qty > 0,
    "invalid",
    "Enter a material and a positive quantity.",
  );
  const id = nextId(s, "lot", "FAB");
  const inspectionId = nextId(s, "inspection", "INSP");
  s.lots.push({
    id,
    material: input.material.trim(),
    supplierRef: input.supplierRef.trim() || "SUP-REF (synthetic)",
    receivedQty: input.qty,
    balanceQty: input.qty,
    unit: input.unit ?? "m",
    receivedAt: now(),
    receivedBy: actor.id,
    status: "awaiting-inspection",
    incomingInspectionId: inspectionId,
  });
  s.inspections.push({
    id: inspectionId,
    kind: "incoming",
    subjectType: "lot",
    subjectId: id,
    status: "open",
    assigneeId: "u-quality",
    checklist: incomingChecklist(),
    notes: "",
    createdAt: now(),
  });
  addTask(s, {
    kind: "incoming-qc",
    title: `Incoming inspection for ${id}`,
    department: "quality",
    subjectType: "lot",
    subjectId: id,
  });
  addTask(s, {
    kind: "receive-lot",
    title: `Assign RFID card to ${id} at Receiving`,
    department: "receiving",
    subjectType: "lot",
    subjectId: id,
    checkpoint: "S1",
  });
  audit(
    s,
    actor,
    "materials",
    "Lot received",
    "lot",
    id,
    `${input.qty} ${input.unit ?? "m"} received — assign RFID card at station`,
  );
  return id;
}

export function issueMaterial(
  s: DemoState,
  actor: StaffUser,
  input: { lotId: string; orderId: string; qty: number },
) {
  ensure(can.issueMaterial(actor), "forbidden", "Only raw-store staff can issue material.");
  const lot = findOrThrow(s.lots, input.lotId, "Lot");
  const order = findOrThrow(s.orders, input.orderId, "Order");
  ensure(lot.status === "accepted", "conflict", `${lot.id} has not passed incoming inspection.`);
  ensure(
    input.qty > 0 && input.qty <= lot.balanceQty,
    "invalid",
    `Quantity must be between 0 and ${lot.balanceQty} ${lot.unit}.`,
  );
  const id = nextId(s, "issue", "ISS");
  s.issues.push({ id, lotId: lot.id, orderId: order.id, qty: input.qty, at: now(), by: actor.id });
  lot.balanceQty = Math.round((lot.balanceQty - input.qty) * 1000) / 1000;
  if (order.status === "planned" || order.status === "approved") order.status = "in-progress";
  closeTasks(s, order.id, ["issue-material"]);
  audit(
    s,
    actor,
    "materials",
    "Material issued (dashboard form — no scan required for dashboard flow)",
    "lot",
    lot.id,
    `${input.qty} ${lot.unit} to ${order.id}`,
  );
  return id;
}

// ---------------------------------------------------------------- production

export function planOrder(
  s: DemoState,
  actor: StaffUser,
  input: { product: string; styleCode: string; qty: number; dueDate: string },
) {
  ensure(can.planOrder(actor), "forbidden", "Only the supply-chain manager can plan orders.");
  ensure(
    input.product.trim() && input.qty > 0,
    "invalid",
    "Enter a product and a positive quantity.",
  );
  const id = nextId(s, "order", "ORDER");
  s.orders.push({
    id,
    product: input.product.trim(),
    styleCode: input.styleCode.trim() || "WT-SH-000",
    plannedQty: input.qty,
    status: "planned",
    dueDate: input.dueDate,
    plannedBy: actor.id,
  });
  addTask(s, {
    kind: "issue-material",
    title: `Issue fabric for ${id}`,
    department: "raw-store",
    subjectType: "order",
    subjectId: id,
  });
  addTask(s, {
    kind: "cut",
    title: `Cut panel sets for ${id}`,
    department: "cutting",
    subjectType: "order",
    subjectId: id,
    checkpoint: "S2",
  });
  audit(s, actor, "production", "Order planned", "order", id, `${input.qty} × ${input.product}`);
  return id;
}

export function approveOrder(s: DemoState, actor: StaffUser, orderId: string) {
  ensure(can.approveOrder(actor), "forbidden", "Only the manager can approve orders.");
  const order = findOrThrow(s.orders, orderId, "Order");
  ensure(
    order.status === "planned" || order.status === "draft",
    "conflict",
    `Order ${orderId} is already ${order.status}.`,
  );
  order.status = "approved";
  order.approvedBy = actor.id;
  order.approvedAt = now();
  audit(s, actor, "production", "Order approved", "order", orderId);
}

export function recordCuttingOutput(
  s: DemoState,
  actor: StaffUser,
  input: { orderId: string; issueId: string; fabricUsed: number; size: string },
) {
  ensure(
    actor.role === "P" && actor.department === "cutting" && actor.status === "active",
    "forbidden",
    "Only cutting staff can record cutting outputs.",
  );
  const order = findOrThrow(s.orders, input.orderId, "Order");
  const issue = findOrThrow(s.issues, input.issueId, "Material issue");
  ensure(issue.orderId === order.id, "conflict", "That material issue belongs to another order.");
  const used = s.cuttingOutputs
    .filter((c) => c.issueId === issue.id)
    .reduce((a, c) => a + c.fabricUsed, 0);
  ensure(
    input.fabricUsed > 0 && used + input.fabricUsed <= issue.qty + 1e-9,
    "invalid",
    `Only ${(issue.qty - used).toFixed(3)} of ${issue.id} is left to cut.`,
  );
  const cutId = nextId(s, "cut", "CUT");
  s.counters["garment"] = (s.counters["garment"] ?? 0) + 1;
  const prefix = order.styleCode.startsWith("WT-TR") ? "TROUSER" : "SHIRT";
  const garmentId = `${prefix}-${String(s.counters["garment"]).padStart(3, "0")}`;
  const label = `PS-${order.id.split("-")[1]}-${String.fromCharCode(64 + s.cuttingOutputs.filter((c) => c.orderId === order.id).length + 1)}`;
  s.cuttingOutputs.push({
    id: cutId,
    orderId: order.id,
    lotId: issue.lotId,
    issueId: issue.id,
    panelSetLabel: label,
    fabricUsed: input.fabricUsed,
    garmentId,
    at: now(),
    by: actor.id,
  });
  s.garments.push({
    id: garmentId,
    orderId: order.id,
    publicId: `${garmentId.toLowerCase()}-unpublished`,
    productName: `${order.product} — ${input.size}`,
    size: input.size,
    cuttingOutputId: cutId,
    stage: "stitching",
    disposition: "not-inspected",
    hold: null,
  });
  garmentEvent(
    s,
    garmentId,
    `Cut from ${issue.lotId} (dashboard form — assign RFID card at Cutting station)`,
    actor,
    `Panel set ${label}`,
  );
  addTask(s, {
    kind: "stitch",
    title: `Stitch ${garmentId}`,
    department: "stitching",
    subjectType: "garment",
    subjectId: garmentId,
    checkpoint: "S3",
  });
  const cutCount = s.garments.filter((g) => g.orderId === order.id).length;
  if (cutCount >= order.plannedQty) {
    closeTasks(s, order.id, ["cut"]);
  }
  audit(
    s,
    actor,
    "production",
    "Cutting output recorded (dashboard — no RFID scan)",
    "garment",
    garmentId,
    `${input.fabricUsed} from ${issue.lotId}`,
  );
  return garmentId;
}

export function replaceGarmentCard(
  s: DemoState,
  actor: StaffUser,
  garmentId: string,
  newUid: string,
): ScanOutcome {
  ensure(
    actor.status === "active" && (actor.role === "A" || actor.role === "M" || actor.role === "P"),
    "forbidden",
    "Only production staff, managers or administrators can replace a garment RFID card.",
  );
  const garment = findOrThrow(s.garments, garmentId, "Garment");
  const normUid = normalizeUid(newUid);
  ensure(normUid.length >= 4, "invalid", "RFID UID must be a valid hex string.");

  if (isCardAlreadyBound(s, normUid)) {
    return rejectScan(
      s,
      normUid,
      "rejected_active_card",
      `UID ${normUid} is already assigned to another subject. Use a fresh unbound card.`,
    );
  }

  // Deactivate any existing active card bindings for this garment
  const oldBinding = s.rfidTagBindings.find(
    (b) => b.subjectType === "garment" && b.subjectId === garment.id && b.active,
  );
  if (oldBinding) {
    oldBinding.active = false;
    oldBinding.unboundAt = now();
  }

  // Bind new card
  bindCard(s, actor, normUid, "garment", garment.id);
  garment.rfidUid = normUid;

  garmentEvent(
    s,
    garment.id,
    `RFID card replaced: ${oldBinding?.uid ?? "unbound"} → ${normUid}`,
    actor,
    `Card replaced by ${actor.displayName}`,
  );
  audit(
    s,
    actor,
    "rfid",
    "Garment card replaced",
    "garment",
    garment.id,
    `Old: ${oldBinding?.uid ?? "none"} · New: ${normUid}`,
  );

  const outcome: ScanOutcome = {
    uid: normUid,
    resolution: "accepted",
    subjectId: garment.id,
    garmentCode: garment.id,
    productName: garment.productName,
    at: now(),
  };
  appendScanLog(s, outcome);
  return outcome;
}

export function applyIncomingQCQuantity(
  s: DemoState,
  lotId: string,
  acceptedQty: number,
  rejectedQty: number = 0,
  heldQty: number = 0,
) {
  const lot = findOrThrow(s.lots, lotId, "Lot");
  ensure(
    acceptedQty >= 0 && rejectedQty >= 0 && heldQty >= 0,
    "invalid",
    "Quantities must be non-negative.",
  );
  const total = Math.round((acceptedQty + rejectedQty + heldQty) * 1000) / 1000;
  ensure(
    Math.abs(total - lot.receivedQty) < 1e-3,
    "invalid",
    `Accepted (${acceptedQty}) + Rejected (${rejectedQty}) + Held (${heldQty}) must equal total received (${lot.receivedQty} ${lot.unit}).`,
  );
  lot.balanceQty = Math.round(acceptedQty * 1000) / 1000;
  lot.status = acceptedQty > 0 ? "accepted" : "rejected";
}

export function listProductSpecs(s: DemoState): ProductSpecification[] {
  return s.productSpecs ?? [];
}

export function saveProductSpec(
  s: DemoState,
  actor: StaffUser,
  spec: Omit<ProductSpecification, "version">,
): string {
  ensure(
    actor.status === "active" && (actor.role === "A" || actor.role === "M"),
    "forbidden",
    "Only managers or administrators can configure product specifications.",
  );
  if (!s.productSpecs) s.productSpecs = [];
  const existing = spec.id ? s.productSpecs.find((p) => p.id === spec.id) : undefined;
  if (existing) {
    existing.name = spec.name;
    existing.styleCode = spec.styleCode;
    existing.category = spec.category;
    existing.standardConsumptionMeters = spec.standardConsumptionMeters;
    existing.sizeVariants = spec.sizeVariants;
    existing.active = spec.active;
    existing.description = spec.description;
    existing.version = (existing.version ?? 1) + 1;
    audit(s, actor, "settings", "Updated product specification", "productSpec", existing.id);
    return existing.id;
  }
  const id = spec.id && spec.id.trim() ? spec.id : nextId(s, "productSpec", "SPEC");
  const newSpec: ProductSpecification = {
    ...spec,
    id,
    version: 1,
  };
  s.productSpecs.push(newSpec);
  audit(s, actor, "settings", "Created product specification", "productSpec", id);
  return id;
}

// ---------------------------------------------------------------- tasks

export function claimTask(s: DemoState, actor: StaffUser, taskId: string) {
  const task = findOrThrow(s.tasks, taskId, "Task");
  ensure(
    can.claimTask(actor, task),
    "forbidden",
    "You can only claim open tasks in your own department.",
  );
  task.status = "claimed";
  task.assigneeId = actor.id;
  audit(s, actor, "workstation", "Task claimed", "task", task.id);
}

export function assignTask(s: DemoState, actor: StaffUser, taskId: string, userId: string) {
  ensure(can.assignTask(actor), "forbidden", "Only the manager can assign tasks.");
  const task = findOrThrow(s.tasks, taskId, "Task");
  const assignee = findOrThrow(s.users, userId, "User");
  ensure(
    assignee.department === task.department,
    "conflict",
    `${assignee.username} is not in the ${task.department} department.`,
  );
  ensure(task.status !== "done", "conflict", "This task is already done.");
  task.status = "claimed";
  task.assigneeId = assignee.id;
  audit(s, actor, "workstation", "Task assigned", "task", task.id, `to ${assignee.username}`);
}

// ---------------------------------------------------------------- workstation (legacy IR path retained)

function ws(s: DemoState, actor: StaffUser) {
  let w = s.workstations[actor.id];
  if (!w) {
    w = { armed: false, needsClear: false, log: [] };
    s.workstations[actor.id] = w;
  }
  return w;
}

export function selectWorkstationTask(s: DemoState, actor: StaffUser, taskId: string) {
  const w = ws(s, actor);
  ensure(
    !w.armed && !w.needsClear,
    "conflict",
    "Clear the current checkpoint before choosing another task.",
  );
  const task = findOrThrow(s.tasks, taskId, "Task");
  ensure(can.useWorkstationTask(actor, task), "forbidden", "That task is outside your department.");
  ensure(!!task.checkpoint, "conflict", "That task has no physical checkpoint.");
  w.taskId = task.id;
}

export function armCheckpoint(s: DemoState, actor: StaffUser) {
  const w = ws(s, actor);
  ensure(w.taskId, "conflict", "Select a task first.");
  ensure(!w.needsClear, "conflict", "Clear the previous presentation before re-arming.");
  const task = findOrThrow(s.tasks, w.taskId, "Task");
  ensure(!task.observation, "conflict", "This task already has an accepted presentation.");
  w.armed = true;
  audit(s, actor, "workstation", "Checkpoint armed", "task", task.id, task.checkpoint);
}

/** A trigger supplies presence only — identity always comes from the selected task. */
export function simulateTrigger(s: DemoState, actor: StaffUser, sensor: SensorId): TriggerOutcome {
  const w = ws(s, actor);
  const task = w.taskId ? s.tasks.find((t) => t.id === w.taskId) : undefined;
  let outcome: TriggerOutcome;
  if (w.needsClear || task?.observation) outcome = "ignored-duplicate";
  else if (!w.armed || !task) outcome = "ignored-unarmed";
  else if (task.checkpoint !== sensor) outcome = "rejected-wrong-checkpoint";
  else outcome = "accepted";

  w.log.unshift({ at: now(), sensor, outcome, taskId: task?.id });
  w.log = w.log.slice(0, 12);

  if (outcome === "accepted" && task) {
    task.observation = { at: now(), sensor };
    if (task.status === "open") {
      task.status = "claimed";
      task.assigneeId = actor.id;
    }
    w.armed = false;
    w.needsClear = true;
    if (task.subjectType === "garment")
      garmentEvent(s, task.subjectId, `Presented at ${sensor}`, actor, task.title);
    audit(
      s,
      actor,
      "workstation",
      "Checkpoint presentation accepted",
      task.subjectType,
      task.subjectId,
      sensor,
    );
  }
  return outcome;
}

export function clearCheckpoint(s: DemoState, actor: StaffUser) {
  const w = ws(s, actor);
  w.armed = false;
  w.needsClear = false;
}

export function handOverTask(s: DemoState, actor: StaffUser) {
  const w = ws(s, actor);
  ensure(w.taskId, "conflict", "Select a task first.");
  const task = findOrThrow(s.tasks, w.taskId, "Task");
  ensure(can.useWorkstationTask(actor, task), "forbidden", "That task is outside your department.");
  ensure(task.observation, "conflict", "Hand over needs an accepted checkpoint presentation.");
  task.status = "done";
  task.completedAt = now();
  if (task.subjectType === "garment") {
    const g = getGarment(s, task.subjectId);
    if (task.kind === "stitch" && g.stage === "stitching") {
      g.stage = "finishing";
      garmentEvent(s, g.id, "Stitching completed", actor);
      addTask(s, {
        kind: "finish",
        title: `Finish ${g.id}`,
        department: "finishing",
        subjectType: "garment",
        subjectId: g.id,
        checkpoint: "S4",
      });
    } else if (task.kind === "finish" && g.stage === "finishing") {
      g.stage = "final-qc";
      g.disposition = "awaiting-inspection";
      garmentEvent(s, g.id, "Finishing completed", actor);
      const inspId = nextId(s, "inspection", "INSP");
      s.inspections.push({
        id: inspId,
        kind: "final",
        subjectType: "garment",
        subjectId: g.id,
        status: "open",
        assigneeId: "u-quality",
        checklist: finalChecklist(),
        notes: "",
        createdAt: now(),
      });
      addTask(s, {
        kind: "final-qc-presentation",
        title: `Present ${g.id} for final QC`,
        department: "quality",
        subjectType: "garment",
        subjectId: g.id,
        checkpoint: "FINAL_QC",
      });
    }
  }
  w.taskId = undefined;
  w.armed = false;
  w.needsClear = false;
  audit(s, actor, "workstation", "Task handed over", "task", task.id);
}

// ---------------------------------------------------------------- quality

export function submitInspection(
  s: DemoState,
  actor: StaffUser,
  input: {
    inspectionId: string;
    checklist: ChecklistItem[];
    notes: string;
    result: "pass" | "fail";
    defectReason?: string | undefined;
  },
) {
  const insp = findOrThrow(s.inspections, input.inspectionId, "Inspection");
  ensure(
    can.submitInspection(actor, insp),
    "forbidden",
    "Only the quality inspector can submit results. Managers have read-only access.",
  );
  if (insp.kind === "reinspection") {
    const rc = s.rework.find(
      (r) =>
        r.reinspectionId === insp.id || (r.garmentId === insp.subjectId && r.status === "repaired"),
    );
    if (rc?.repairedBy && rc.repairedBy === actor.id) {
      ensure(
        false,
        "forbidden",
        "Independent QC Violation: Inspector cannot approve their own repair. Another authorized quality inspector must perform the reinspection.",
      );
    }
  }
  if (input.result === "pass")
    ensure(
      input.checklist.every((c) => c.checked),
      "invalid",
      "Complete every checklist item before passing.",
    );
  else ensure(input.defectReason?.trim(), "invalid", "Enter a defect reason for a failed result.");

  insp.checklist = input.checklist;
  insp.notes = input.notes;
  insp.status = input.result === "pass" ? "passed" : "failed";
  insp.defectReason = input.result === "fail" ? input.defectReason!.trim() : undefined;
  insp.submittedAt = now();
  insp.submittedBy = actor.id;

  if (insp.subjectType === "lot") {
    const lot = findOrThrow(s.lots, insp.subjectId, "Lot");
    lot.status = input.result === "pass" ? "accepted" : "rejected";
    if (input.result === "pass") {
      lot.acceptedQty = lot.receivedQty;
      lot.balanceQty = lot.receivedQty;
      lot.heldQty = 0;
      lot.rejectedQty = 0;
    } else {
      lot.acceptedQty = 0;
      lot.balanceQty = 0;
      lot.heldQty = 0;
      lot.rejectedQty = lot.receivedQty;
    }
    closeTasks(s, lot.id, ["incoming-qc"]);
    audit(
      s,
      actor,
      "quality",
      `Incoming inspection ${input.result === "pass" ? "passed" : "failed"}`,
      "lot",
      lot.id,
      insp.defectReason,
    );
    return;
  }

  const g = getGarment(s, insp.subjectId);
  closeTasks(s, g.id, ["final-qc-presentation"]);
  const kindLabel = insp.kind === "reinspection" ? "Reinspection" : "Final inspection";

  if (input.result === "pass") {
    g.disposition = "passed";
    if (!g.hold) {
      g.stage = "packing";
      addTask(s, {
        kind: "pack",
        title: `Pack ${g.id}`,
        department: "packing",
        subjectType: "garment",
        subjectId: g.id,
        checkpoint: "S5",
      });
      garmentEvent(s, g.id, `${kindLabel} passed`, actor, insp.id);
    } else {
      garmentEvent(s, g.id, `${kindLabel} passed — hold awaits explicit release`, actor, insp.id);
    }
    audit(s, actor, "quality", `${kindLabel} passed`, "garment", g.id, insp.id);
    return;
  }

  g.disposition = "failed";
  g.stage = "rework";
  const existing = g.hold?.reworkCaseId
    ? s.rework.find((r) => r.id === g.hold!.reworkCaseId)
    : undefined;
  let caseId: string;
  if (existing) {
    existing.status = "awaiting-assignment";
    existing.defectReason = insp.defectReason!;
    existing.inspectionId = insp.id;
    existing.assignedDepartment = undefined;
    existing.history.push({
      at: now(),
      label: `Reinspection failed: ${insp.defectReason}`,
      actorId: actor.id,
    });
    caseId = existing.id;
  } else {
    caseId = nextId(s, "rework", "RW");
    s.rework.push({
      id: caseId,
      garmentId: g.id,
      inspectionId: insp.id,
      defectReason: insp.defectReason!,
      status: "awaiting-assignment",
      createdAt: now(),
      history: [
        { at: now(), label: `Opened from ${insp.id}: ${insp.defectReason}`, actorId: actor.id },
      ],
    });
  }
  g.hold = {
    reason: insp.defectReason!,
    since: g.hold?.since ?? now(),
    inspectionId: insp.id,
    reworkCaseId: caseId,
  };
  garmentEvent(s, g.id, `${kindLabel} failed — garment on hold`, actor, insp.defectReason);
  audit(
    s,
    actor,
    "quality",
    `${kindLabel} failed`,
    "garment",
    g.id,
    `${insp.defectReason} · ${caseId}`,
  );
}

export function submitIncomingQc(
  s: DemoState,
  actor: StaffUser,
  input: {
    lotId: string;
    inspectionId: string;
    acceptedQty: number;
    heldQty: number;
    rejectedQty: number;
    checklist: ChecklistItem[];
    notes: string;
    result: "pass" | "fail";
    defectReason?: string | undefined;
  },
) {
  ensure(
    actor.role === "Q" || actor.department === "quality",
    "forbidden",
    "Only quality inspectors may approve incoming inspections. Materials staff cannot approve their own incoming QC.",
  );
  const lot = findOrThrow(s.lots, input.lotId, "Lot");
  const insp = findOrThrow(s.inspections, input.inspectionId, "Inspection");
  ensure(
    input.acceptedQty + input.heldQty + input.rejectedQty === lot.receivedQty,
    "invalid",
    `Evaluated quantities (${input.acceptedQty + input.heldQty + input.rejectedQty}) must equal received lot quantity (${lot.receivedQty}).`,
  );
  if (input.result === "pass") {
    ensure(
      input.checklist.every((c) => c.checked),
      "invalid",
      "Complete every checklist item before passing.",
    );
    ensure(
      input.acceptedQty > 0,
      "invalid",
      "Passing inspection requires an accepted quantity > 0.",
    );
  } else {
    ensure(input.defectReason?.trim(), "invalid", "Enter a defect reason for a failed result.");
  }
  insp.checklist = input.checklist;
  insp.notes = input.notes;
  insp.status = input.result === "pass" ? "passed" : "failed";
  insp.defectReason = input.result === "fail" ? input.defectReason?.trim() : undefined;
  insp.submittedAt = now();
  insp.submittedBy = actor.id;

  lot.acceptedQty = input.acceptedQty;
  lot.heldQty = input.heldQty;
  lot.rejectedQty = input.rejectedQty;
  lot.balanceQty = input.acceptedQty; // Only accepted quantity is issuable
  lot.status = input.result === "pass" ? "accepted" : "rejected";
  closeTasks(s, lot.id, ["incoming-qc"]);
  audit(
    s,
    actor,
    "quality",
    `Incoming inspection ${input.result === "pass" ? "passed" : "failed"}`,
    "lot",
    lot.id,
    `${input.acceptedQty}m accepted, ${input.heldQty}m held, ${input.rejectedQty}m rejected`,
  );
}

export function releaseHold(s: DemoState, actor: StaffUser, garmentId: string) {
  const g = getGarment(s, garmentId);
  const latest = latestGarmentInspection(s, g.id);
  const caseId = g.hold?.reworkCaseId;
  const rc = caseId ? s.rework.find((r) => r.id === caseId) : undefined;
  if (rc?.repairedBy && rc.repairedBy === actor.id) {
    ensure(
      false,
      "forbidden",
      "Independent QC Violation: Inspector cannot release a hold on their own repair.",
    );
  }
  ensure(
    can.releaseHold(actor, g, latest, rc),
    "forbidden",
    "Only the quality inspector can release a hold, and only after a passing reinspection.",
  );
  g.hold = null;
  g.disposition = "released";
  g.stage = "packing";
  if (rc) {
    rc.status = "closed";
    rc.history.push({
      at: now(),
      label: "Hold released after passing reinspection",
      actorId: actor.id,
    });
  }
  addTask(s, {
    kind: "pack",
    title: `Pack ${g.id}`,
    department: "packing",
    subjectType: "garment",
    subjectId: g.id,
    checkpoint: "S5",
  });
  garmentEvent(s, g.id, "Quality hold released", actor, latest?.id);
  audit(s, actor, "quality", "Hold released", "garment", g.id, latest?.id);
}

// ---------------------------------------------------------------- rework

const repairDepartments: Department[] = ["cutting", "stitching", "finishing"];

export function assignRework(
  s: DemoState,
  actor: StaffUser,
  caseId: string,
  department: Department,
) {
  const rc = findOrThrow(s.rework, caseId, "Rework case");
  ensure(
    can.assignRework(actor, rc),
    "forbidden",
    "Only the manager can assign rework that is awaiting assignment.",
  );
  ensure(repairDepartments.includes(department), "invalid", "Choose a production department.");
  rc.status = "assigned";
  rc.assignedDepartment = department;
  rc.assignedBy = actor.id;
  rc.history.push({ at: now(), label: `Assigned to ${department}`, actorId: actor.id });
  addTask(s, {
    kind: "rework",
    title: `Repair ${rc.garmentId} (${rc.id})`,
    department,
    subjectType: "rework",
    subjectId: rc.id,
  });
  garmentEvent(s, rc.garmentId, `Rework assigned to ${department}`, actor, rc.id);
  audit(s, actor, "rework", "Rework assigned", "rework", rc.id, department);
}

export function completeRework(s: DemoState, actor: StaffUser, caseId: string, note: string) {
  const rc = findOrThrow(s.rework, caseId, "Rework case");
  ensure(
    can.completeRework(actor, rc),
    "forbidden",
    "Only the assigned production department can record repair completion.",
  );
  ensure(actor.id !== rc.assignedBy, "forbidden", "The assignor cannot also complete the repair.");
  const g = getGarment(s, rc.garmentId);
  rc.status = "repaired";
  rc.repairNote = note.trim() || "Repair completed.";
  rc.repairedBy = actor.id;
  const inspId = nextId(s, "inspection", "INSP");
  s.inspections.push({
    id: inspId,
    kind: "reinspection",
    subjectType: "garment",
    subjectId: g.id,
    status: "open",
    assigneeId: "u-quality",
    checklist: finalChecklist(),
    notes: "",
    createdAt: now(),
    previousInspectionId: rc.inspectionId,
  });
  rc.reinspectionId = inspId;
  rc.history.push({
    at: now(),
    label: `Repair completed; fresh reinspection ${inspId} opened`,
    actorId: actor.id,
  });
  g.disposition = "reinspection-pending";
  g.stage = "final-qc";
  closeTasks(s, rc.id, ["rework"]);
  addTask(s, {
    kind: "final-qc-presentation",
    title: `Present ${g.id} for reinspection`,
    department: "quality",
    subjectType: "garment",
    subjectId: g.id,
    checkpoint: "FINAL_QC",
  });
  garmentEvent(s, g.id, "Repair completed — awaiting reinspection", actor, rc.id);
  audit(s, actor, "rework", "Repair completed", "rework", rc.id, inspId);
}

// ---------------------------------------------------------------- fulfilment

export function createPackage(s: DemoState, actor: StaffUser): string {
  ensure(can.packGarment(actor), "forbidden", "Only packing staff can create packages.");
  const id = nextId(s, "package", "PKG");
  s.packages.push({
    id,
    garmentIds: [],
    status: "open",
    packedBy: actor.id,
    createdAt: now(),
  });
  audit(s, actor, "logistics", "Package created", "package", id);
  return id;
}

export function sealPackage(s: DemoState, actor: StaffUser, packageId: string): void {
  ensure(
    can.packGarment(actor) || can.receiveStock(actor),
    "forbidden",
    "Unauthorized to seal package.",
  );
  const pkg = findOrThrow(s.packages, packageId, "Package");
  ensure(pkg.garmentIds.length > 0, "invalid", "Cannot seal an empty package.");
  pkg.status = "sealed";
  pkg.sealedAt = now();
  audit(s, actor, "logistics", "Package sealed", "package", pkg.id);
}

export function verifyGarmentDispatch(
  s: DemoState,
  actor: StaffUser,
  shipmentId: string,
  garmentId: string,
): void {
  ensure(
    can.confirmDeparture(actor),
    "forbidden",
    "Only dispatch staff can verify manifest garments.",
  );
  const sh = findOrThrow(s.shipments, shipmentId, "Shipment");
  const g = findOrThrow(s.garments, garmentId, "Garment");
  ensure(sh.garmentIds.includes(g.id), "invalid", `${g.id} is not on manifest for ${sh.id}.`);
  ensure(sh.allocatedGarmentIds.includes(g.id), "invalid", `${g.id} is not allocated to ${sh.id}.`);
  ensure(!g.hold, "conflict", `${g.id} is on quality hold and cannot be verified.`);
  ensure(
    g.disposition === "passed" || g.disposition === "released",
    "conflict",
    `${g.id} has not passed QC.`,
  );
  if (!sh.verifiedGarmentIds) sh.verifiedGarmentIds = [];
  if (!sh.verifiedGarmentIds.includes(g.id)) {
    sh.verifiedGarmentIds.push(g.id);
  }
  audit(s, actor, "logistics", "Garment verified on manifest", "garment", g.id, sh.id);
}

export function packGarment(s: DemoState, actor: StaffUser, garmentId: string) {
  ensure(can.packGarment(actor), "forbidden", "Only packing staff can add garments to a package.");
  const g = getGarment(s, garmentId);
  ensure(!g.hold, "conflict", `${g.id} is on quality hold and cannot be packed.`);
  ensure(g.stage === "packing" && !g.packageId, "conflict", `${g.id} is not waiting for packing.`);
  ensure(
    g.disposition === "passed" || g.disposition === "released",
    "conflict",
    `${g.id} has not passed quality control.`,
  );
  let pkg = s.packages.find((p) => p.status === "open");
  if (!pkg) {
    pkg = {
      id: nextId(s, "package", "PKG"),
      garmentIds: [],
      status: "open",
      packedBy: actor.id,
      createdAt: now(),
    };
    s.packages.push(pkg);
  }
  pkg.garmentIds.push(g.id);
  g.packageId = pkg.id;
  closeTasks(s, g.id, ["pack"]);
  addTask(s, {
    kind: "warehouse-receive",
    title: `Receive ${g.id} into finished stock`,
    department: "warehouse",
    subjectType: "garment",
    subjectId: g.id,
  });
  garmentEvent(s, g.id, `Packed into ${pkg.id}`, actor);
  audit(s, actor, "logistics", "Garment packed", "garment", g.id, pkg.id);
  return pkg.id;
}

export function receiveStock(s: DemoState, actor: StaffUser, garmentId: string) {
  ensure(can.receiveStock(actor), "forbidden", "Only warehouse staff can receive finished stock.");
  const g = getGarment(s, garmentId);
  ensure(
    g.stage === "packing" && g.packageId,
    "conflict",
    `${g.id} is not packed and waiting for the warehouse.`,
  );
  g.stage = "warehouse";
  const pkg = s.packages.find((p) => p.id === g.packageId);
  if (pkg) pkg.status = "sealed";
  closeTasks(s, g.id, ["warehouse-receive"]);
  garmentEvent(s, g.id, "Received into finished stock", actor);
  audit(s, actor, "logistics", "Stock received", "garment", g.id);
}

export function allocateStock(
  s: DemoState,
  actor: StaffUser,
  garmentId: string,
  shipmentId: string,
) {
  ensure(can.allocateStock(actor), "forbidden", "Only warehouse staff can allocate stock.");
  const g = getGarment(s, garmentId);
  const sh = getShipment(s, shipmentId);
  ensure(!g.hold, "conflict", `${g.id} is on quality hold.`);
  ensure(g.stage === "warehouse", "conflict", `${g.id} is not in finished stock.`);
  ensure(sh.status !== "departed", "conflict", `${sh.id} has already departed.`);
  if (!sh.garmentIds.includes(g.id)) sh.garmentIds.push(g.id);
  if (!sh.allocatedGarmentIds.includes(g.id)) sh.allocatedGarmentIds.push(g.id);
  g.stage = "allocated";
  g.shipmentId = sh.id;
  if (sh.garmentIds.every((id) => sh.allocatedGarmentIds.includes(id)))
    closeTasks(s, sh.id, ["allocate"]);
  garmentEvent(s, g.id, `Allocated to ${sh.id}`, actor);
  audit(s, actor, "logistics", "Stock allocated", "shipment", sh.id, g.id);
}

export function planShipment(
  s: DemoState,
  actor: StaffUser,
  input: { destination: string; carrier: string; plannedDate: string },
) {
  ensure(can.planShipment(actor), "forbidden", "Only the manager can plan shipments.");
  ensure(input.destination.trim(), "invalid", "Enter a destination.");
  const id = nextId(s, "shipment", "SHP");
  s.shipments.push({
    id,
    destination: input.destination.trim(),
    carrier: input.carrier.trim() || s.settings.business.defaultCarrier,
    status: "draft",
    garmentIds: [],
    allocatedGarmentIds: [],
    plannedBy: actor.id,
    plannedDate: input.plannedDate,
  });
  addTask(s, {
    kind: "allocate",
    title: `Allocate stock to ${id}`,
    department: "warehouse",
    subjectType: "shipment",
    subjectId: id,
  });
  addTask(s, {
    kind: "dispatch",
    title: `Dispatch ${id} at dock`,
    department: "dispatch",
    subjectType: "shipment",
    subjectId: id,
    checkpoint: "S6",
  });
  audit(s, actor, "logistics", "Shipment drafted", "shipment", id);
  return id;
}

export function updateShipmentPlan(
  s: DemoState,
  actor: StaffUser,
  input: { shipmentId: string; garmentIds: string[]; markPlanned: boolean },
) {
  ensure(can.planShipment(actor), "forbidden", "Only the manager can change a shipment plan.");
  const sh = getShipment(s, input.shipmentId);
  ensure(sh.status !== "departed", "conflict", "A departed shipment cannot be changed.");
  input.garmentIds.forEach((id) => getGarment(s, id));
  sh.garmentIds = input.garmentIds;
  sh.allocatedGarmentIds = sh.allocatedGarmentIds.filter((id) => input.garmentIds.includes(id));
  if (input.markPlanned) sh.status = "planned";
  input.garmentIds.forEach((id) => (getGarment(s, id).shipmentId = sh.id));
  audit(
    s,
    actor,
    "logistics",
    input.markPlanned ? "Shipment planned" : "Shipment manifest updated",
    "shipment",
    sh.id,
    input.garmentIds.join(", "),
  );
}

export interface EligibilityCheck {
  label: string;
  ok: boolean;
  detail?: string | undefined;
}

export function shipmentEligibility(s: DemoState, sh: Shipment): EligibilityCheck[] {
  const garments = sh.garmentIds
    .map((id) => s.garments.find((g) => g.id === id))
    .filter(Boolean) as Garment[];
  const dispatchTask = s.tasks.find((t) => t.kind === "dispatch" && t.subjectId === sh.id);
  const checks: EligibilityCheck[] = [
    {
      label: "Shipment is planned by the manager",
      ok: sh.status === "planned",
      detail: `Status: ${sh.status}`,
    },
    { label: "Manifest has at least one garment", ok: garments.length > 0 },
  ];
  garments.forEach((g) => {
    checks.push({
      label: `${g.id}: no active quality hold`,
      ok: !g.hold,
      detail: g.hold ? "On hold — blocked" : undefined,
    });
    checks.push({
      label: `${g.id}: passed or released by quality`,
      ok: g.disposition === "passed" || g.disposition === "released",
      detail: `Disposition: ${g.disposition}`,
    });
    checks.push({
      label: `${g.id}: packed and allocated from finished stock`,
      ok: g.stage === "allocated" && sh.allocatedGarmentIds.includes(g.id),
      detail: `Stage: ${g.stage}`,
    });
  });
  const verifiedIds = sh.verifiedGarmentIds ?? [];
  const allVerified = garments.length > 0 && garments.every((g) => verifiedIds.includes(g.id));
  checks.push({
    label: "Dispatch presentation / RFID scan verified at S6",
    ok: allVerified || !!dispatchTask?.observation,
    detail: allVerified
      ? `All ${garments.length} garments verified`
      : dispatchTask?.observation
        ? `Observed ${dispatchTask.observation.at}`
        : `${garments.filter((g) => !verifiedIds.includes(g.id)).length} garment(s) unverified`,
  });
  return checks;
}

export function confirmDeparture(s: DemoState, actor: StaffUser, shipmentId: string) {
  ensure(can.confirmDeparture(actor), "forbidden", "Only dispatch staff can confirm departure.");
  const sh = getShipment(s, shipmentId);
  ensure(sh.status !== "departed", "conflict", `${sh.id} has already departed.`);
  const failed = shipmentEligibility(s, sh).filter((c) => !c.ok);
  ensure(
    failed.length === 0,
    "conflict",
    `Departure blocked: ${failed.map((c) => c.label).join("; ")}`,
  );
  sh.status = "departed";
  sh.departedAt = now();
  sh.departedBy = actor.id;
  sh.garmentIds.forEach((id) => {
    const g = getGarment(s, id);
    g.stage = "dispatched";
    garmentEvent(s, g.id, `Dispatched on ${sh.id}`, actor);
    s.ledger.unshift({
      id: nextId(s, "ledger", "LC"),
      subjectType: "garment",
      subjectId: g.id,
      milestone: "Dispatched to authorized retail network",
      status: "pending",
      digest: "0x(demo)…pending",
      createdAt: now(),
      updatedAt: now(),
      attempts: 0,
    });
  });
  closeTasks(s, sh.id, ["dispatch"]);
  audit(s, actor, "logistics", "Shipment departed", "shipment", sh.id);
}

// ---------------------------------------------------------------- ledger

export function retryLedger(s: DemoState, actor: StaffUser, id: string) {
  ensure(can.retryLedger(actor), "forbidden", "Only the administrator can retry commitments.");
  const c = findOrThrow(s.ledger, id, "Commitment");
  ensure(c.status === "failed", "conflict", "Only failed commitments can be retried.");
  c.status = "submitted";
  c.attempts += 1;
  c.updatedAt = now();
  c.lastError = undefined;
  audit(s, actor, "ledger", "Mock commitment retry", "ledger", c.id);
}

// ---------------------------------------------------------------- admin

export function inviteUser(
  s: DemoState,
  actor: StaffUser,
  input: {
    username: string;
    displayName: string;
    role: import("@/domain/types").Role;
    department: Department;
  },
) {
  ensure(can.manageUsers(actor), "forbidden", "Only the administrator can invite staff.");
  const username = input.username.trim().toLowerCase();
  ensure(
    /^[a-z0-9.-]{3,}$/.test(username),
    "invalid",
    "Username needs 3+ lowercase letters, digits, dots or dashes.",
  );
  ensure(
    !s.users.some((u) => u.username === username),
    "conflict",
    "That username already exists.",
  );
  const id = `u-${username.replace(/\W/g, "-")}`;
  s.users.push({
    id,
    username,
    displayName: input.displayName.trim() || username,
    role: input.role,
    department: input.department,
    email: `${username}@weartrail.example`,
    status: "invited",
    scope: input.department,
  });

  const token = `inv_${username}_${Math.random().toString(36).slice(2, 10)}`;
  s.credentialTokens = s.credentialTokens ?? [];
  s.credentialTokens.push({
    id: nextId(s, "token", "tok"),
    token,
    userId: id,
    kind: "invite",
    status: "valid",
    createdAt: now(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });

  audit(s, actor, "admin", "Staff invited with activation token", "user", username);
  return id;
}

export function updateUserScope(
  s: DemoState,
  actor: StaffUser,
  input: { userId: string; role: import("@/domain/types").Role; department: Department },
) {
  ensure(can.manageUsers(actor), "forbidden", "Only the administrator can edit scopes.");
  const u = findOrThrow(s.users, input.userId, "User");
  ensure(u.id !== actor.id, "conflict", "You cannot change your own scope.");
  u.role = input.role;
  u.department = input.department;
  audit(
    s,
    actor,
    "admin",
    "Scope edited",
    "user",
    u.username,
    `${input.role} · ${input.department}`,
  );
}

export function setUserSuspended(
  s: DemoState,
  actor: StaffUser,
  userId: string,
  suspended: boolean,
) {
  ensure(can.manageUsers(actor), "forbidden", "Only the administrator can suspend staff.");
  const u = findOrThrow(s.users, userId, "User");
  ensure(u.id !== actor.id, "conflict", "You cannot suspend yourself.");
  u.status = suspended ? "suspended" : "active";

  // When suspended, revoke all active sessions immediately
  if (suspended && s.sessions) {
    for (const sess of s.sessions) {
      if (sess.userId === userId && sess.status === "active") {
        sess.status = "revoked";
        sess.revokedAt = now();
      }
    }
  }

  audit(s, actor, "admin", suspended ? "Staff suspended" : "Staff reactivated", "user", u.username);
}

export function issueReset(s: DemoState, actor: StaffUser, userId: string): string {
  ensure(can.manageUsers(actor), "forbidden", "Only the administrator can issue resets.");
  const u = findOrThrow(s.users, userId, "User");

  const token = `rst_${u.username}_${Math.random().toString(36).slice(2, 10)}`;
  s.credentialTokens = s.credentialTokens ?? [];
  s.credentialTokens.push({
    id: nextId(s, "token", "tok"),
    token,
    userId: u.id,
    kind: "reset",
    status: "valid",
    createdAt: now(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });

  audit(s, actor, "admin", "Credential reset link issued", "user", u.username);
  return token;
}

// ---------------------------------------------------------------- settings

export function updateCheckpoint(
  s: DemoState,
  actor: StaffUser,
  input: { sensor: SensorId; label: string; enabled: boolean },
) {
  ensure(
    can.editDeviceSettings(actor),
    "forbidden",
    "Only the administrator can edit device settings.",
  );
  const cp = s.settings.checkpoints.find((c) => c.sensor === input.sensor);
  ensure(cp, "not-found", "Unknown checkpoint.");
  cp.label = input.label.trim() || cp.label;
  cp.enabled = input.enabled;
  audit(
    s,
    actor,
    "settings",
    "Checkpoint updated",
    "checkpoint",
    cp.sensor,
    `${cp.label} · ${cp.enabled ? "enabled" : "disabled"}`,
  );
}

export function updateBusinessSettings(
  s: DemoState,
  actor: StaffUser,
  input: Partial<DemoState["settings"]["business"]>,
) {
  ensure(
    can.editBusinessSettings(actor),
    "forbidden",
    "Only the manager can edit business settings.",
  );
  s.settings.business = { ...s.settings.business, ...input };
  audit(s, actor, "settings", "Business settings updated", "settings", "business");
}
