import { describe, expect, it } from "vitest";
import { canAccessRoute } from "@/domain/permissions";
import type { DemoState, StaffUser } from "@/domain/types";
import * as E from "@/mock/engine";
import { createSeed } from "@/mock/fixtures";
import { projectJourney } from "@/mock/projection";

const as = (s: DemoState, username: string): StaffUser =>
  s.users.find((u) => u.username === username)!;
const final = (s: DemoState) => s.inspections.find((i) => i.id === "INSP-002")!;
const checked = (s: DemoState, id: string) =>
  s.inspections.find((i) => i.id === id)!.checklist.map((c) => ({ ...c, checked: true }));

describe("access rules", () => {
  it("blocks the manager from submitting a QC result", () => {
    const s = createSeed();
    expect(() =>
      E.submitInspection(s, as(s, "manager.demo"), {
        inspectionId: "INSP-002",
        checklist: checked(s, "INSP-002"),
        notes: "",
        result: "pass",
      }),
    ).toThrow(/inspector/);
  });

  it("blocks packing staff from confirming departure", () => {
    const s = createSeed();
    expect(() => E.confirmDeparture(s, as(s, "packing.demo"), "SHP-002")).toThrow(/dispatch staff/);
  });

  it("keeps admin out of garments and production staff out of ledger", () => {
    const s = createSeed();
    expect(canAccessRoute(as(s, "admin.demo"), "garments")).toBe(false);
    expect(canAccessRoute(as(s, "cutting.demo"), "ledger")).toBe(false);
  });
});

describe("SHIRT-002 fail → repair → reinspect → release → dispatch", () => {
  it("runs end to end in shared state", () => {
    const s = createSeed();
    const q = as(s, "quality.demo");

    // A sensor event alone never records a QC result.
    E.selectWorkstationTask(s, q, "T-101");
    E.armCheckpoint(s, q);
    expect(E.simulateTrigger(s, q, "S6")).toBe("rejected-wrong-checkpoint");
    expect(E.simulateTrigger(s, q, "FINAL_QC")).toBe("accepted");
    expect(E.simulateTrigger(s, q, "FINAL_QC")).toBe("ignored-duplicate");
    expect(final(s).status).toBe("open");

    E.submitInspection(s, q, {
      inspectionId: "INSP-002",
      checklist: final(s).checklist,
      notes: "",
      result: "fail",
      defectReason: "Open seam",
    });
    const g = () => s.garments.find((x) => x.id === "SHIRT-002")!;
    expect(g().hold).not.toBeNull();
    expect(projectJourney(s, "shirt-002-demo")?.status).toBe("Temporarily on hold");
    const rc = s.rework.find((r) => r.garmentId === "SHIRT-002")!;

    // Held garment on a planned shipment stays blocked.
    E.updateShipmentPlan(s, as(s, "manager.demo"), {
      shipmentId: "SHP-002",
      garmentIds: ["SHIRT-002"],
      markPlanned: true,
    });
    expect(() => E.packGarment(s, as(s, "packing.demo"), "SHIRT-002")).toThrow(/hold/);

    E.assignRework(s, as(s, "manager.demo"), rc.id, "stitching");
    expect(() => E.completeRework(s, as(s, "finishing.demo"), rc.id, "x")).toThrow();
    E.completeRework(s, as(s, "stitching.demo"), rc.id, "Re-stitched");
    expect(() => E.releaseHold(s, as(s, "stitching.demo"), "SHIRT-002")).toThrow();

    const reId = s.rework.find((r) => r.garmentId === "SHIRT-002")!.reinspectionId!;
    E.submitInspection(s, q, {
      inspectionId: reId,
      checklist: checked(s, reId),
      notes: "",
      result: "pass",
    });
    expect(g().hold).not.toBeNull(); // still held until explicit release
    E.releaseHold(s, q, "SHIRT-002");
    expect(g().hold).toBeNull();

    E.packGarment(s, as(s, "packing.demo"), "SHIRT-002");
    E.receiveStock(s, as(s, "warehouse.demo"), "SHIRT-002");
    E.allocateStock(s, as(s, "warehouse.demo"), "SHIRT-002", "SHP-002");

    const d = as(s, "dispatch.demo");
    expect(() => E.confirmDeparture(s, d, "SHP-002")).toThrow(/S6/);
    E.selectWorkstationTask(s, d, "T-106");
    E.armCheckpoint(s, d);
    expect(E.simulateTrigger(s, d, "S6")).toBe("accepted");
    E.confirmDeparture(s, d, "SHP-002");

    expect(g().stage).toBe("dispatched");
    expect(s.garments.find((x) => x.id === "SHIRT-002")!.id).toBe("SHIRT-002");
    expect(final(s).status).toBe("failed"); // earlier result preserved
    const j = projectJourney(s, "shirt-002-demo")!;
    expect(j.status).toBe("Dispatched to authorized retail network");
    expect(j.evidence).toBe("pending");
    expect(JSON.stringify(j)).not.toMatch(/Open seam|stitching\.demo|SUP-REF/);
  });
});

describe("Nine-Reader RFID prototype workflow & behavioral rules", () => {
  it("Station 1 (Receiving): assigns a card UID to a lot", () => {
    const s = createSeed();
    const rcv = as(s, "receiving.demo");
    const freshUid = "04E1F2A3";

    const ctxId = E.prepareActionContext(s, rcv, "fabric_receiving", "assign_bundle_card", {
      kind: "assign_bundle_card",
      lotId: "FAB-002",
    });
    E.acknowledgeContext(s, rcv, ctxId);

    const outcome = E.resolveRfidScan(s, rcv, freshUid);
    expect(outcome.resolution).toBe("accepted");
    expect(outcome.subjectId).toBe("FAB-002");

    const binding = s.rfidTagBindings.find((b) => b.uid === freshUid && b.active);
    expect(binding).toBeDefined();
    expect(binding?.subjectId).toBe("FAB-002");
    expect(s.lots.find((l) => l.id === "FAB-002")?.rfidUid).toBe(freshUid);
  });

  it("Station 2 (Fabric Issue): validates balance and prevents over-allocation across multiple orders", () => {
    const s = createSeed();
    const store = as(s, "receiving.demo"); // materials staff
    const bundleUid = "04A1B2C3"; // FAB-001 card in seed

    const lot = s.lots.find((l) => l.id === "FAB-001")!;
    expect(lot.balanceQty).toBe(6); // 20 received - 8 (ISS-001) - 6 (ISS-002) = 6 m remaining

    // Issue 4 m to ORDER-001
    const ctxId1 = E.prepareActionContext(s, store, "fabric_issue", "confirm_issue", {
      kind: "confirm_issue",
      lotId: "FAB-001",
      orderId: "ORDER-001",
      qty: 4,
    });
    E.acknowledgeContext(s, store, ctxId1);
    const outcome1 = E.resolveRfidScan(s, store, bundleUid);
    expect(outcome1.resolution).toBe("accepted");
    expect(lot.balanceQty).toBe(2); // 6 - 4 = 2 m

    // Attempt to issue 5 m (exceeds 2 m balance) -> validation fails at scan time
    const ctxId2 = E.prepareActionContext(s, store, "fabric_issue", "confirm_issue", {
      kind: "confirm_issue",
      lotId: "FAB-001",
      orderId: "ORDER-002",
      qty: 5,
    });
    E.acknowledgeContext(s, store, ctxId2);
    expect(() => E.resolveRfidScan(s, store, bundleUid)).toThrow(/Quantity must be between/);
  });

  it("rejects assigning an already-active card to another subject", () => {
    const s = createSeed();
    const rcv = as(s, "receiving.demo");
    const alreadyBoundUid = "04A1B2C3"; // already bound to FAB-001

    const ctxId = E.prepareActionContext(s, rcv, "fabric_receiving", "assign_bundle_card", {
      kind: "assign_bundle_card",
      lotId: "FAB-002",
    });
    E.acknowledgeContext(s, rcv, ctxId);

    const outcome = E.resolveRfidScan(s, rcv, alreadyBoundUid);
    expect(outcome.resolution).toBe("rejected_active_card");
    expect(outcome.rejectReason).toMatch(/already assigned/);
  });

  it("Station 3 (Cutting): confirms fabric source, then assigns fresh cards to create garments with lineage", () => {
    const s = createSeed();
    const cutStaff = as(s, "cutting.demo");
    const bundleUid = "04A1B2C3"; // FAB-001 bundle card

    // Step 1: Select fabric source by scanning bundle card
    const srcCtxId = E.prepareActionContext(s, cutStaff, "cutting", "select_cutting_source", {
      kind: "select_cutting_source",
      orderId: "ORDER-001",
      issueId: "ISS-001",
      consumedQty: 2.1,
      wasteQty: 0.1,
    });
    E.acknowledgeContext(s, cutStaff, srcCtxId);
    const srcOutcome = E.resolveRfidScan(s, cutStaff, bundleUid);
    expect(srcOutcome.resolution).toBe("accepted");

    const sel = s.cuttingSourceSelections.find((cs) => cs.active && cs.orderId === "ORDER-001")!;
    expect(sel).toBeDefined();

    // Step 2: Assign next garment card 1
    const tag1Uid = "04112233";
    const tag1CtxId = E.prepareActionContext(s, cutStaff, "cutting", "bind_garment_tag", {
      kind: "bind_garment_tag",
      cuttingSourceSelectionId: sel.id,
      orderId: "ORDER-001",
      size: "M",
    });
    E.acknowledgeContext(s, cutStaff, tag1CtxId);
    const tag1Outcome = E.resolveRfidScan(s, cutStaff, tag1Uid);
    expect(tag1Outcome.resolution).toBe("accepted");
    expect(tag1Outcome.garmentCode).toBeDefined();
    expect(tag1Outcome.productName).toMatch(/Classic poplin shirt/);

    const g1 = s.garments.find((g) => g.id === tag1Outcome.garmentCode)!;
    expect(g1.stage).toBe("stitching");
    expect(g1.rfidUid).toBe(tag1Uid);

    // Step 3: Assign next garment card 2 from the same confirmed source without reselecting
    const tag2Uid = "04445566";
    const tag2CtxId = E.prepareActionContext(s, cutStaff, "cutting", "bind_garment_tag", {
      kind: "bind_garment_tag",
      cuttingSourceSelectionId: sel.id,
      orderId: "ORDER-001",
      size: "L",
    });
    E.acknowledgeContext(s, cutStaff, tag2CtxId);
    const tag2Outcome = E.resolveRfidScan(s, cutStaff, tag2Uid);
    expect(tag2Outcome.resolution).toBe("accepted");
    expect(tag2Outcome.garmentCode).not.toBe(tag1Outcome.garmentCode);

    const g2 = s.garments.find((g) => g.id === tag2Outcome.garmentCode)!;
    expect(g2.rfidUid).toBe(tag2Uid);
    expect(g2.size).toBe("L");
  });

  it("Station 4 & 5 (Stitching & Finishing): routine scans advance stage without per-shirt form", () => {
    const s = createSeed();
    // Use TROUSER-001 (UID 04001122), currently in finishing
    const finishStaff = as(s, "finishing.demo");
    const trouserUid = "04001122";

    const outcome = E.routineScan(s, finishStaff, trouserUid, "finishing");
    expect(outcome.resolution).toBe("accepted");
    expect(outcome.garmentCode).toBe("TROUSER-001");

    const trouser = s.garments.find((g) => g.id === "TROUSER-001")!;
    expect(trouser.stage).toBe("final-qc");
  });

  it("Station 6 (QA): inspector prepares decision without garment selection, scan resolves identity", () => {
    const s = createSeed();
    const inspector = as(s, "quality.demo");
    const shirt2Uid = "04DAEBFC"; // SHIRT-002 tag

    const ctxId = E.prepareActionContext(s, inspector, "final_qc", "submit_qc", {
      kind: "submit_qc",
      result: "fail",
      defectReason: "Stitch drop at collar",
      checklist: [
        { id: "c1", label: "Visual", checked: true },
        { id: "c2", label: "Stitch", checked: false },
      ],
      notes: "Collar seam loose",
    });
    E.acknowledgeContext(s, inspector, ctxId);

    // Inspector taps card at reader
    const outcome = E.resolveRfidScan(s, inspector, shirt2Uid);
    expect(outcome.resolution).toBe("accepted");
    expect(outcome.garmentCode).toBe("SHIRT-002");
    expect(outcome.productName).toMatch(/Classic poplin shirt/);

    const shirt2 = s.garments.find((g) => g.id === "SHIRT-002")!;
    expect(shirt2.hold).not.toBeNull();
    expect(shirt2.hold?.reason).toBe("Stitch drop at collar");
    expect(shirt2.stage).toBe("rework");
  });

  it("sibling garment is unaffected by another garment hold", () => {
    const s = createSeed();
    const g1 = s.garments.find((g) => g.id === "SHIRT-001")!;
    const g2 = s.garments.find((g) => g.id === "SHIRT-002")!;

    // Place hold on SHIRT-002
    g2.hold = {
      since: "2026-11-19T00:00:00Z",
      reason: "Defective seam",
      inspectionId: "INSP-002",
    };

    expect(g1.hold).toBeNull();
    expect(g2.hold).not.toBeNull();
    // SHIRT-001 public journey remains dispatched
    expect(projectJourney(s, "shirt-001-demo")?.status).toBe(
      "Dispatched to authorized retail network",
    );
    // SHIRT-002 public journey shows hold
    expect(projectJourney(s, "shirt-002-demo")?.status).toBe("Temporarily on hold");
  });
});
