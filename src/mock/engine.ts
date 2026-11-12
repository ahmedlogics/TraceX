/**
 * Pure workflow rules for the mock backend. Every function receives a draft state
 * and the acting staff user, checks scope, and mutates the draft or throws DemoError.
 * The Express API should implement the same rules server-side.
 */
import { can } from "@/domain/permissions";
import type {
  ChecklistItem,
  DemoState,
  Department,
  Garment,
  Inspection,
  SensorId,
  Shipment,
  StaffUser,
  Task,
  TaskKind,
  TriggerOutcome,
  AuditCategory,
  Role,
} from "@/domain/types";
import { DemoError, ensure } from "./errors";
import { finalChecklist, incomingChecklist } from "./fixtures";

export const now = () => new Date().toISOString();

function nextId(s: DemoState, counter: string, prefix: string, pad = 3) {
  s.counters[counter] = (s.counters[counter] ?? 0) + 1;
  return `${prefix}-${String(s.counters[counter]).padStart(pad, "0")}`;
}

function audit(
  s: DemoState,
  actor: StaffUser,
  category: AuditCategory,
  event: string,
  subjectType: string,
  subjectId: string,
  detail?: string,
) {
  s.audit.unshift({ id: nextId(s, "audit", "AU"), at: now(), actorId: actor.id, category, event, subjectType, subjectId, detail });
}

function garmentEvent(s: DemoState, garmentId: string, label: string, actor: StaffUser, detail?: string) {
  s.garmentEvents.push({ id: nextId(s, "event", "GE"), garmentId, at: now(), label, detail, actorId: actor.id, department: actor.department });
}

function addTask(
  s: DemoState,
  t: Omit<Task, "id" | "status" | "createdAt"> & { status?: Task["status"] },
) {
  const task: Task = { ...t, id: nextId(s, "task", "T"), status: t.status ?? "open", createdAt: now() };
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

// ---------------------------------------------------------------- auth

export function recordSignIn(s: DemoState, actor: StaffUser) {
  audit(s, actor, "auth", "Demo sign-in", "user", actor.username);
}
export function recordSignOut(s: DemoState, actor: StaffUser) {
  audit(s, actor, "auth", "Sign-out", "user", actor.username);
}

// ---------------------------------------------------------------- materials

export function receiveLot(s: DemoState, actor: StaffUser, input: { material: string; supplierRef: string; qty: number }) {
  ensure(can.receiveLot(actor), "forbidden", "Only receiving staff can record a lot receipt.");
  ensure(input.material.trim() && input.qty > 0, "invalid", "Enter a material and a positive quantity.");
  const id = nextId(s, "lot", "FAB");
  const inspectionId = nextId(s, "inspection", "INSP");
  s.lots.push({
    id, material: input.material.trim(), supplierRef: input.supplierRef.trim() || "SUP-REF (synthetic)",
    receivedQty: input.qty, balanceQty: input.qty, unit: "m", receivedAt: now(), receivedBy: actor.id,
    status: "awaiting-inspection", incomingInspectionId: inspectionId,
  });
  s.inspections.push({ id: inspectionId, kind: "incoming", subjectType: "lot", subjectId: id, status: "open", assigneeId: "u-quality", checklist: incomingChecklist(), notes: "", createdAt: now() });
  addTask(s, { kind: "incoming-qc", title: `Incoming inspection for ${id}`, department: "quality", subjectType: "lot", subjectId: id });
  audit(s, actor, "materials", "Lot received", "lot", id, `${input.qty} m received`);
  return id;
}

export function issueMaterial(s: DemoState, actor: StaffUser, input: { lotId: string; orderId: string; qty: number }) {
  ensure(can.issueMaterial(actor), "forbidden", "Only raw-store staff can issue material.");
  const lot = findOrThrow(s.lots, input.lotId, "Lot");
  const order = findOrThrow(s.orders, input.orderId, "Order");
  ensure(lot.status === "accepted", "conflict", `${lot.id} has not passed incoming inspection.`);
  ensure(input.qty > 0 && input.qty <= lot.balanceQty, "invalid", `Quantity must be between 0 and ${lot.balanceQty} m.`);
  const id = nextId(s, "issue", "ISS");
  s.issues.push({ id, lotId: lot.id, orderId: order.id, qty: input.qty, at: now(), by: actor.id });
  lot.balanceQty = Math.round((lot.balanceQty - input.qty) * 100) / 100;
  if (order.status === "planned") order.status = "in-progress";
  closeTasks(s, order.id, ["issue-material"]);
  audit(s, actor, "materials", "Material issued", "lot", lot.id, `${input.qty} m to ${order.id}`);
  return id;
}

// ---------------------------------------------------------------- production

export function planOrder(s: DemoState, actor: StaffUser, input: { product: string; styleCode: string; qty: number; dueDate: string }) {
  ensure(can.planOrder(actor), "forbidden", "Only the supply-chain manager can plan orders.");
  ensure(input.product.trim() && input.qty > 0, "invalid", "Enter a product and a positive quantity.");
  const id = nextId(s, "order", "ORDER");
  s.orders.push({ id, product: input.product.trim(), styleCode: input.styleCode.trim() || "WT-SH-000", plannedQty: input.qty, status: "planned", dueDate: input.dueDate, plannedBy: actor.id });
  addTask(s, { kind: "issue-material", title: `Issue fabric for ${id}`, department: "raw-store", subjectType: "order", subjectId: id });
  addTask(s, { kind: "cut", title: `Cut panel sets for ${id}`, department: "cutting", subjectType: "order", subjectId: id, checkpoint: "S2" });
  audit(s, actor, "production", "Order planned", "order", id, `${input.qty} × ${input.product}`);
  return id;
}

export function recordCuttingOutput(s: DemoState, actor: StaffUser, input: { orderId: string; issueId: string; fabricUsed: number; size: string }) {
  ensure(actor.role === "P" && actor.department === "cutting" && actor.status === "active", "forbidden", "Only cutting staff can record cutting outputs.");
  const order = findOrThrow(s.orders, input.orderId, "Order");
  const issue = findOrThrow(s.issues, input.issueId, "Material issue");
  ensure(issue.orderId === order.id, "conflict", "That material issue belongs to another order.");
  const used = s.cuttingOutputs.filter((c) => c.issueId === issue.id).reduce((a, c) => a + c.fabricUsed, 0);
  ensure(input.fabricUsed > 0 && used + input.fabricUsed <= issue.qty + 1e-9, "invalid", `Only ${(issue.qty - used).toFixed(2)} m of ${issue.id} is left to cut.`);
  const cutId = nextId(s, "cut", "CUT");
  const n = s.garments.length + 1;
  const garmentId = `SHIRT-${String(n).padStart(3, "0")}`;
  const label = `PS-${order.id.split("-")[1]}-${String.fromCharCode(64 + s.cuttingOutputs.filter((c) => c.orderId === order.id).length + 1)}`;
  s.cuttingOutputs.push({ id: cutId, orderId: order.id, lotId: issue.lotId, issueId: issue.id, panelSetLabel: label, fabricUsed: input.fabricUsed, garmentId, at: now(), by: actor.id });
  s.garments.push({ id: garmentId, orderId: order.id, publicId: `shirt-${String(n).padStart(3, "0")}-unpublished`, productName: `${order.product} — ${input.size}`, size: input.size, cuttingOutputId: cutId, stage: "stitching", disposition: "not-inspected", hold: null });
  garmentEvent(s, garmentId, `Cut from ${issue.lotId}`, actor, `Panel set ${label}`);
  addTask(s, { kind: "stitch", title: `Stitch ${garmentId}`, department: "stitching", subjectType: "garment", subjectId: garmentId, checkpoint: "S3" });
  audit(s, actor, "production", "Cutting output recorded", "garment", garmentId, `${input.fabricUsed} m from ${issue.lotId}`);
  return garmentId;
}

// ---------------------------------------------------------------- tasks

export function claimTask(s: DemoState, actor: StaffUser, taskId: string) {
  const task = findOrThrow(s.tasks, taskId, "Task");
  ensure(can.claimTask(actor, task), "forbidden", "You can only claim open tasks in your own department.");
  task.status = "claimed";
  task.assigneeId = actor.id;
  audit(s, actor, "workstation", "Task claimed", "task", task.id);
}

export function assignTask(s: DemoState, actor: StaffUser, taskId: string, userId: string) {
  ensure(can.assignTask(actor), "forbidden", "Only the manager can assign tasks.");
  const task = findOrThrow(s.tasks, taskId, "Task");
  const assignee = findOrThrow(s.users, userId, "User");
  ensure(assignee.department === task.department, "conflict", `${assignee.username} is not in the ${task.department} department.`);
  ensure(task.status !== "done", "conflict", "This task is already done.");
  task.status = "claimed";
  task.assigneeId = assignee.id;
  audit(s, actor, "workstation", "Task assigned", "task", task.id, `to ${assignee.username}`);
}

// ---------------------------------------------------------------- workstation

function ws(s: DemoState, actor: StaffUser) {
  if (!s.workstations[actor.id]) s.workstations[actor.id] = { armed: false, needsClear: false, log: [] };
  return s.workstations[actor.id];
}

export function selectWorkstationTask(s: DemoState, actor: StaffUser, taskId: string) {
  const w = ws(s, actor);
  ensure(!w.armed && !w.needsClear, "conflict", "Clear the current checkpoint before choosing another task.");
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
    if (task.subjectType === "garment") garmentEvent(s, task.subjectId, `Presented at ${sensor}`, actor, task.title);
    audit(s, actor, "workstation", "Checkpoint presentation accepted", task.subjectType, task.subjectId, sensor);
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
      addTask(s, { kind: "finish", title: `Finish ${g.id}`, department: "finishing", subjectType: "garment", subjectId: g.id, checkpoint: "S4" });
    } else if (task.kind === "finish" && g.stage === "finishing") {
      g.stage = "final-qc";
      g.disposition = "awaiting-inspection";
      garmentEvent(s, g.id, "Finishing completed", actor);
      const inspId = nextId(s, "inspection", "INSP");
      s.inspections.push({ id: inspId, kind: "final", subjectType: "garment", subjectId: g.id, status: "open", assigneeId: "u-quality", checklist: finalChecklist(), notes: "", createdAt: now() });
      addTask(s, { kind: "final-qc-presentation", title: `Present ${g.id} for final QC`, department: "quality", subjectType: "garment", subjectId: g.id, checkpoint: "S4" });
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
  input: { inspectionId: string; checklist: ChecklistItem[]; notes: string; result: "pass" | "fail"; defectReason?: string },
) {
  const insp = findOrThrow(s.inspections, input.inspectionId, "Inspection");
  ensure(can.submitInspection(actor, insp), "forbidden", "Only the quality inspector can submit results. Managers have read-only access.");
  if (input.result === "pass") ensure(input.checklist.every((c) => c.checked), "invalid", "Complete every checklist item before passing.");
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
    closeTasks(s, lot.id, ["incoming-qc"]);
    audit(s, actor, "quality", `Incoming inspection ${input.result === "pass" ? "passed" : "failed"}`, "lot", lot.id, insp.defectReason);
    return;
  }

  const g = getGarment(s, insp.subjectId);
  closeTasks(s, g.id, ["final-qc-presentation"]);
  const kindLabel = insp.kind === "reinspection" ? "Reinspection" : "Final inspection";

  if (input.result === "pass") {
    g.disposition = "passed";
    if (!g.hold) {
      g.stage = "packing";
      addTask(s, { kind: "pack", title: `Pack ${g.id}`, department: "packing", subjectType: "garment", subjectId: g.id, checkpoint: "S5" });
      garmentEvent(s, g.id, `${kindLabel} passed`, actor, insp.id);
    } else {
      garmentEvent(s, g.id, `${kindLabel} passed — hold awaits explicit release`, actor, insp.id);
    }
    audit(s, actor, "quality", `${kindLabel} passed`, "garment", g.id, insp.id);
    return;
  }

  // Fail: keep the result, place on hold, open (or reopen) a rework case.
  g.disposition = "failed";
  g.stage = "rework";
  const existing = g.hold?.reworkCaseId ? s.rework.find((r) => r.id === g.hold!.reworkCaseId) : undefined;
  let caseId: string;
  if (existing) {
    existing.status = "awaiting-assignment";
    existing.defectReason = insp.defectReason!;
    existing.inspectionId = insp.id;
    existing.assignedDepartment = undefined;
    existing.history.push({ at: now(), label: `Reinspection failed: ${insp.defectReason}`, actorId: actor.id });
    caseId = existing.id;
  } else {
    caseId = nextId(s, "rework", "RW");
    s.rework.push({
      id: caseId, garmentId: g.id, inspectionId: insp.id, defectReason: insp.defectReason!, status: "awaiting-assignment", createdAt: now(),
      history: [{ at: now(), label: `Opened from ${insp.id}: ${insp.defectReason}`, actorId: actor.id }],
    });
  }
  g.hold = { reason: insp.defectReason!, since: g.hold?.since ?? now(), inspectionId: insp.id, reworkCaseId: caseId };
  garmentEvent(s, g.id, `${kindLabel} failed — garment on hold`, actor, insp.defectReason);
  audit(s, actor, "quality", `${kindLabel} failed`, "garment", g.id, `${insp.defectReason} · ${caseId}`);
}

export function releaseHold(s: DemoState, actor: StaffUser, garmentId: string) {
  const g = getGarment(s, garmentId);
  const latest = latestGarmentInspection(s, g.id);
  ensure(can.releaseHold(actor, g, latest), "forbidden", "Only the quality inspector can release a hold, and only after a passing reinspection.");
  const caseId = g.hold?.reworkCaseId;
  g.hold = null;
  g.disposition = "released";
  g.stage = "packing";
  const rc = caseId ? s.rework.find((r) => r.id === caseId) : undefined;
  if (rc) {
    rc.status = "closed";
    rc.history.push({ at: now(), label: "Hold released after passing reinspection", actorId: actor.id });
  }
  addTask(s, { kind: "pack", title: `Pack ${g.id}`, department: "packing", subjectType: "garment", subjectId: g.id, checkpoint: "S5" });
  garmentEvent(s, g.id, "Quality hold released", actor, latest?.id);
  audit(s, actor, "quality", "Hold released", "garment", g.id, latest?.id);
}

// ---------------------------------------------------------------- rework

const repairDepartments: Department[] = ["cutting", "stitching", "finishing"];

export function assignRework(s: DemoState, actor: StaffUser, caseId: string, department: Department) {
  const rc = findOrThrow(s.rework, caseId, "Rework case");
  ensure(can.assignRework(actor, rc), "forbidden", "Only the manager can assign rework that is awaiting assignment.");
  ensure(repairDepartments.includes(department), "invalid", "Choose a production department.");
  rc.status = "assigned";
  rc.assignedDepartment = department;
  rc.assignedBy = actor.id;
  rc.history.push({ at: now(), label: `Assigned to ${department}`, actorId: actor.id });
  addTask(s, { kind: "rework", title: `Repair ${rc.garmentId} (${rc.id})`, department, subjectType: "rework", subjectId: rc.id });
  garmentEvent(s, rc.garmentId, `Rework assigned to ${department}`, actor, rc.id);
  audit(s, actor, "rework", "Rework assigned", "rework", rc.id, department);
}

export function completeRework(s: DemoState, actor: StaffUser, caseId: string, note: string) {
  const rc = findOrThrow(s.rework, caseId, "Rework case");
  ensure(can.completeRework(actor, rc), "forbidden", "Only the assigned production department can record repair completion.");
  const g = getGarment(s, rc.garmentId);
  rc.status = "repaired";
  rc.repairNote = note.trim() || "Repair completed.";
  rc.repairedBy = actor.id;
  const inspId = nextId(s, "inspection", "INSP");
  s.inspections.push({ id: inspId, kind: "reinspection", subjectType: "garment", subjectId: g.id, status: "open", assigneeId: "u-quality", checklist: finalChecklist(), notes: "", createdAt: now(), previousInspectionId: rc.inspectionId });
  rc.reinspectionId = inspId;
  rc.history.push({ at: now(), label: `Repair completed; fresh reinspection ${inspId} opened`, actorId: actor.id });
  g.disposition = "reinspection-pending";
  g.stage = "final-qc";
  closeTasks(s, rc.id, ["rework"]);
  addTask(s, { kind: "final-qc-presentation", title: `Present ${g.id} for reinspection`, department: "quality", subjectType: "garment", subjectId: g.id, checkpoint: "S4" });
  garmentEvent(s, g.id, "Repair completed — awaiting reinspection", actor, rc.id);
  audit(s, actor, "rework", "Repair completed", "rework", rc.id, inspId);
}

// ---------------------------------------------------------------- fulfilment

export function packGarment(s: DemoState, actor: StaffUser, garmentId: string) {
  ensure(can.packGarment(actor), "forbidden", "Only packing staff can add garments to a package.");
  const g = getGarment(s, garmentId);
  ensure(!g.hold, "conflict", `${g.id} is on quality hold and cannot be packed.`);
  ensure(g.stage === "packing" && !g.packageId, "conflict", `${g.id} is not waiting for packing.`);
  ensure(g.disposition === "passed" || g.disposition === "released", "conflict", `${g.id} has not passed quality control.`);
  let pkg = s.packages.find((p) => p.status === "open");
  if (!pkg) {
    pkg = { id: nextId(s, "package", "PKG"), garmentIds: [], status: "open", packedBy: actor.id, createdAt: now() };
    s.packages.push(pkg);
  }
  pkg.garmentIds.push(g.id);
  g.packageId = pkg.id;
  closeTasks(s, g.id, ["pack"]);
  addTask(s, { kind: "warehouse-receive", title: `Receive ${g.id} into finished stock`, department: "warehouse", subjectType: "garment", subjectId: g.id });
  garmentEvent(s, g.id, `Packed into ${pkg.id}`, actor);
  audit(s, actor, "logistics", "Garment packed", "garment", g.id, pkg.id);
  return pkg.id;
}

export function receiveStock(s: DemoState, actor: StaffUser, garmentId: string) {
  ensure(can.receiveStock(actor), "forbidden", "Only warehouse staff can receive finished stock.");
  const g = getGarment(s, garmentId);
  ensure(g.stage === "packing" && g.packageId, "conflict", `${g.id} is not packed and waiting for the warehouse.`);
  g.stage = "warehouse";
  const pkg = s.packages.find((p) => p.id === g.packageId);
  if (pkg) pkg.status = "sealed";
  closeTasks(s, g.id, ["warehouse-receive"]);
  garmentEvent(s, g.id, "Received into finished stock", actor);
  audit(s, actor, "logistics", "Stock received", "garment", g.id);
}

export function allocateStock(s: DemoState, actor: StaffUser, garmentId: string, shipmentId: string) {
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
  if (sh.garmentIds.every((id) => sh.allocatedGarmentIds.includes(id))) closeTasks(s, sh.id, ["allocate"]);
  garmentEvent(s, g.id, `Allocated to ${sh.id}`, actor);
  audit(s, actor, "logistics", "Stock allocated", "shipment", sh.id, g.id);
}

export function planShipment(s: DemoState, actor: StaffUser, input: { destination: string; carrier: string; plannedDate: string }) {
  ensure(can.planShipment(actor), "forbidden", "Only the manager can plan shipments.");
  ensure(input.destination.trim(), "invalid", "Enter a destination.");
  const id = nextId(s, "shipment", "SHP");
  s.shipments.push({ id, destination: input.destination.trim(), carrier: input.carrier.trim() || s.settings.business.defaultCarrier, status: "draft", garmentIds: [], allocatedGarmentIds: [], plannedBy: actor.id, plannedDate: input.plannedDate });
  addTask(s, { kind: "allocate", title: `Allocate stock to ${id}`, department: "warehouse", subjectType: "shipment", subjectId: id });
  addTask(s, { kind: "dispatch", title: `Dispatch ${id} at dock`, department: "dispatch", subjectType: "shipment", subjectId: id, checkpoint: "S6" });
  audit(s, actor, "logistics", "Shipment drafted", "shipment", id);
  return id;
}

export function updateShipmentPlan(s: DemoState, actor: StaffUser, input: { shipmentId: string; garmentIds: string[]; markPlanned: boolean }) {
  ensure(can.planShipment(actor), "forbidden", "Only the manager can change a shipment plan.");
  const sh = getShipment(s, input.shipmentId);
  ensure(sh.status !== "departed", "conflict", "A departed shipment cannot be changed.");
  input.garmentIds.forEach((id) => getGarment(s, id));
  sh.garmentIds = input.garmentIds;
  sh.allocatedGarmentIds = sh.allocatedGarmentIds.filter((id) => input.garmentIds.includes(id));
  if (input.markPlanned) sh.status = "planned";
  input.garmentIds.forEach((id) => (getGarment(s, id).shipmentId = sh.id));
  audit(s, actor, "logistics", input.markPlanned ? "Shipment planned" : "Shipment manifest updated", "shipment", sh.id, input.garmentIds.join(", "));
}

export interface EligibilityCheck {
  label: string;
  ok: boolean;
  detail?: string | undefined;
}

export function shipmentEligibility(s: DemoState, sh: Shipment): EligibilityCheck[] {
  const garments = sh.garmentIds.map((id) => s.garments.find((g) => g.id === id)).filter(Boolean) as Garment[];
  const dispatchTask = s.tasks.find((t) => t.kind === "dispatch" && t.subjectId === sh.id);
  const checks: EligibilityCheck[] = [
    { label: "Shipment is planned by the manager", ok: sh.status === "planned", detail: `Status: ${sh.status}` },
    { label: "Manifest has at least one garment", ok: garments.length > 0 },
  ];
  garments.forEach((g) => {
    checks.push({ label: `${g.id}: no active quality hold`, ok: !g.hold, detail: g.hold ? "On hold — blocked" : undefined });
    checks.push({ label: `${g.id}: passed or released by quality`, ok: g.disposition === "passed" || g.disposition === "released", detail: `Disposition: ${g.disposition}` });
    checks.push({ label: `${g.id}: packed and allocated from finished stock`, ok: g.stage === "allocated" && sh.allocatedGarmentIds.includes(g.id), detail: `Stage: ${g.stage}` });
  });
  checks.push({
    label: "Dispatch presentation observed at S6",
    ok: !!dispatchTask?.observation,
    detail: dispatchTask ? (dispatchTask.observation ? `Observed ${dispatchTask.observation.at}` : `Waiting on ${dispatchTask.id}`) : "No dispatch task",
  });
  return checks;
}

export function confirmDeparture(s: DemoState, actor: StaffUser, shipmentId: string) {
  ensure(can.confirmDeparture(actor), "forbidden", "Only dispatch staff can confirm departure.");
  const sh = getShipment(s, shipmentId);
  ensure(sh.status !== "departed", "conflict", `${sh.id} has already departed.`);
  const failed = shipmentEligibility(s, sh).filter((c) => !c.ok);
  ensure(failed.length === 0, "conflict", `Departure blocked: ${failed.map((c) => c.label).join("; ")}`);
  sh.status = "departed";
  sh.departedAt = now();
  sh.departedBy = actor.id;
  sh.garmentIds.forEach((id) => {
    const g = getGarment(s, id);
    g.stage = "dispatched";
    garmentEvent(s, g.id, `Dispatched on ${sh.id}`, actor);
    s.ledger.unshift({ id: nextId(s, "ledger", "LC"), subjectType: "garment", subjectId: g.id, milestone: "Dispatched to authorized retail network", status: "pending", digest: "0x(demo)…pending", createdAt: now(), updatedAt: now(), attempts: 0 });
  });
  closeTasks(s, sh.id, ["dispatch"]);
  audit(s, actor, "logistics", "Shipment departed", "shipment", sh.id);
}

// ---------------------------------------------------------------- ledger (independent of production/QC)

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

export function inviteUser(s: DemoState, actor: StaffUser, input: { username: string; displayName: string; role: Role; department: Department }) {
  ensure(can.manageUsers(actor), "forbidden", "Only the administrator can invite staff.");
  const username = input.username.trim().toLowerCase();
  ensure(/^[a-z0-9.\-]{3,}$/.test(username), "invalid", "Username needs 3+ lowercase letters, digits, dots or dashes.");
  ensure(!s.users.some((u) => u.username === username), "conflict", "That username already exists.");
  const id = `u-${username.replace(/\W/g, "-")}`;
  s.users.push({ id, username, displayName: input.displayName.trim() || username, role: input.role, department: input.department, email: `${username}@weartrail.example`, status: "invited", scope: input.department });
  audit(s, actor, "admin", "Staff invited (mock)", "user", username);
  return id;
}

export function updateUserScope(s: DemoState, actor: StaffUser, input: { userId: string; role: Role; department: Department }) {
  ensure(can.manageUsers(actor), "forbidden", "Only the administrator can edit scopes.");
  const u = findOrThrow(s.users, input.userId, "User");
  ensure(u.id !== actor.id, "conflict", "You cannot change your own scope.");
  u.role = input.role;
  u.department = input.department;
  audit(s, actor, "admin", "Scope edited", "user", u.username, `${input.role} · ${input.department}`);
}

export function setUserSuspended(s: DemoState, actor: StaffUser, userId: string, suspended: boolean) {
  ensure(can.manageUsers(actor), "forbidden", "Only the administrator can suspend staff.");
  const u = findOrThrow(s.users, userId, "User");
  ensure(u.id !== actor.id, "conflict", "You cannot suspend yourself.");
  u.status = suspended ? "suspended" : "active";
  audit(s, actor, "admin", suspended ? "Staff suspended" : "Staff reactivated", "user", u.username);
}

export function issueReset(s: DemoState, actor: StaffUser, userId: string) {
  ensure(can.manageUsers(actor), "forbidden", "Only the administrator can issue resets.");
  const u = findOrThrow(s.users, userId, "User");
  audit(s, actor, "admin", "Credential reset link issued (mock)", "user", u.username);
  return "demo-valid-token";
}

// ---------------------------------------------------------------- settings

export function updateCheckpoint(s: DemoState, actor: StaffUser, input: { sensor: SensorId; label: string; enabled: boolean }) {
  ensure(can.editDeviceSettings(actor), "forbidden", "Only the administrator can edit device settings.");
  const cp = s.settings.checkpoints.find((c) => c.sensor === input.sensor);
  ensure(cp, "not-found", "Unknown checkpoint.");
  cp.label = input.label.trim() || cp.label;
  cp.enabled = input.enabled;
  audit(s, actor, "settings", "Checkpoint updated", "checkpoint", cp.sensor, `${cp.label} · ${cp.enabled ? "enabled" : "disabled"}`);
}

export function updateBusinessSettings(s: DemoState, actor: StaffUser, input: Partial<DemoState["settings"]["business"]>) {
  ensure(can.editBusinessSettings(actor), "forbidden", "Only the manager can edit business settings.");
  s.settings.business = { ...s.settings.business, ...input };
  audit(s, actor, "settings", "Business settings updated", "settings", "business");
}
