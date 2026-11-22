import { describe, expect, it } from "vitest";
import type { DemoState, StaffUser } from "@/domain/types";
import {
  checkFulfilmentEligibility,
  checkIndependentInspection,
} from "@/domain/quality-fulfilment-types";
import * as E from "@/mock/engine";
import { createSeed } from "@/mock/fixtures";
import { projectJourney } from "@/mock/projection";

const as = (s: DemoState, username: string): StaffUser =>
  s.users.find((u) => u.username === username)!;

describe("Member 3: Quality Control & Incoming QC", () => {
  it("incoming QC requires quality inspector and quantity balancing", () => {
    const s = createSeed();
    const materialsUser = as(s, "receiving.demo");
    const qualityUser = as(s, "quality.demo");

    const lot = s.lots.find((l) => l.id === "FAB-002")!;
    const insp = s.inspections.find((i) => i.subjectId === "FAB-002" && i.status === "open")!;
    expect(insp).toBeDefined();

    // Materials user cannot approve incoming QC through materials role alone
    expect(() =>
      E.submitIncomingQc(s, materialsUser, {
        lotId: lot.id,
        inspectionId: insp.id,
        acceptedQty: lot.receivedQty,
        heldQty: 0,
        rejectedQty: 0,
        checklist: insp.checklist.map((c) => ({ ...c, checked: true })),
        notes: "Approved by materials",
        result: "pass",
      }),
    ).toThrow(/quality inspector/i);

    // Quantities must balance to receivedQty (10 + 0 + 0 !== lot.receivedQty)
    expect(() =>
      E.submitIncomingQc(s, qualityUser, {
        lotId: lot.id,
        inspectionId: insp.id,
        acceptedQty: 10,
        heldQty: 0,
        rejectedQty: 0,
        checklist: insp.checklist.map((c) => ({ ...c, checked: true })),
        notes: "Unbalanced",
        result: "pass",
      }),
    ).toThrow(/must equal received lot quantity/i);

    // Valid incoming acceptance: balance equals receivedQty
    const accepted = lot.receivedQty - 10;
    const held = 7;
    const rejected = 3;
    E.submitIncomingQc(s, qualityUser, {
      lotId: lot.id,
      inspectionId: insp.id,
      acceptedQty: accepted,
      heldQty: held,
      rejectedQty: rejected,
      checklist: insp.checklist.map((c) => ({ ...c, checked: true })),
      notes: "High quality poplin, minor roll end held for shading test",
      result: "pass",
    });

    expect(lot.status).toBe("accepted");
    expect(lot.acceptedQty).toBe(accepted);
    expect(lot.heldQty).toBe(held);
    expect(lot.rejectedQty).toBe(rejected);
    // Only accepted stock is issuable
    expect(lot.balanceQty).toBe(accepted);
  });

  it("Final QA: rejects bundle card or unexpected-stage garment", () => {
    const s = createSeed();
    const inspector = as(s, "quality.demo");
    const bundleUid = "04A1B2C3"; // FAB-001 bundle card
    const cuttingShirtUid = "04DAEBFC"; // Let's check SHIRT-002 tag or an early stage

    // Arm context for final QC
    const ctxId = E.prepareActionContext(s, inspector, "final_qc", "submit_qc", {
      kind: "submit_qc",
      result: "pass",
      checklist: [
        { id: "c1", label: "Check 1", checked: true },
        { id: "c2", label: "Check 2", checked: true },
      ],
      notes: "Looks good",
    });
    E.acknowledgeContext(s, inspector, ctxId);

    // 1. Presenting a fabric bundle card at Final QC is rejected
    const outcome1 = E.resolveRfidScan(s, inspector, bundleUid);
    expect(outcome1.resolution).toBe("rejected_wrong_subject_type");
    expect(outcome1.rejectReason).toMatch(/garment card/i);

    // 2. Garment in cutting stage presented at Final QC is rejected
    // Let's create or set a garment in cutting stage
    const g = s.garments.find((x) => x.id === "SHIRT-002")!;
    const savedStage = g.stage;
    g.stage = "cutting";
    const outcome2 = E.resolveRfidScan(s, inspector, "04DAEBFC");
    expect(outcome2.resolution).toBe("rejected_wrong_stage");
    expect(outcome2.rejectReason).toMatch(/expected 'finishing'/i);
    g.stage = savedStage; // restore
  });

  it("Final QA: Fail commits inspection, opens quality hold and rework case atomically", () => {
    const s = createSeed();
    const inspector = as(s, "quality.demo");
    const shirtUid = "04DAEBFC"; // SHIRT-002

    const ctxId = E.prepareActionContext(s, inspector, "final_qc", "submit_qc", {
      kind: "submit_qc",
      result: "fail",
      defectReason: "Broken collar stitch",
      checklist: [
        { id: "c1", label: "Visual", checked: true },
        { id: "c2", label: "Stitch", checked: false },
      ],
      notes: "Needs collar re-stitching",
    });
    E.acknowledgeContext(s, inspector, ctxId);

    const outcome = E.resolveRfidScan(s, inspector, shirtUid);
    expect(outcome.resolution).toBe("accepted");
    expect(outcome.garmentCode).toBe("SHIRT-002");

    const g = s.garments.find((x) => x.id === "SHIRT-002")!;
    expect(g.disposition).toBe("failed");
    expect(g.stage).toBe("rework");
    expect(g.hold).not.toBeNull();
    expect(g.hold?.reason).toBe("Broken collar stitch");

    // Atomically opened rework case
    const rc = s.rework.find((r) => r.garmentId === "SHIRT-002")!;
    expect(rc).toBeDefined();
    expect(rc.status).toBe("awaiting-assignment");
    expect(rc.defectReason).toBe("Broken collar stitch");

    // Downstream packing is strictly blocked
    expect(() => E.packGarment(s, as(s, "packing.demo"), "SHIRT-002")).toThrow(/hold/);

    // Eligibility helper confirms ineligibility
    const el = checkFulfilmentEligibility(g, s.inspections, "packing");
    expect(el.eligible).toBe(false);
    expect(el.blockingReasons.length).toBeGreaterThan(0);
  });

  it("Consumed context cannot be reused (idempotency & replay protection)", () => {
    const s = createSeed();
    const inspector = as(s, "quality.demo");

    const ctxId = E.prepareActionContext(s, inspector, "final_qc", "submit_qc", {
      kind: "submit_qc",
      result: "pass",
      checklist: [{ id: "c1", label: "Check 1", checked: true }],
      notes: "Ok",
    });
    E.acknowledgeContext(s, inspector, ctxId);

    // Consume once
    E.resolveRfidScan(s, inspector, "04DAEBFC");

    // Second scan on the now-consumed context must be rejected
    const outcome = E.resolveRfidScan(s, inspector, "04DAEBFC");
    expect(outcome.resolution).toBe("rejected_no_context");
  });
});

describe("Member 3: Rework, Repairs & Independent Reinspection", () => {
  it("enforces independent inspection: repair performer CANNOT approve their own repair", () => {
    const s = createSeed();
    const inspector = as(s, "quality.demo");
    const manager = as(s, "manager.demo");
    const operator = as(s, "stitching.demo"); // production operator

    // 1. Inspector fails SHIRT-002
    E.submitInspection(s, inspector, {
      inspectionId: "INSP-002",
      checklist: s.inspections.find((i) => i.id === "INSP-002")!.checklist,
      notes: "Loose pocket seam",
      result: "fail",
      defectReason: "Loose pocket seam",
    });

    const g = s.garments.find((x) => x.id === "SHIRT-002")!;
    expect(g.hold).not.toBeNull();
    const rc = s.rework.find((r) => r.garmentId === "SHIRT-002")!;

    // 2. Manager assigns rework to stitching
    E.assignRework(s, manager, rc.id, "stitching");
    expect(rc.status).toBe("assigned");

    // 3. Operator completes repair
    E.completeRework(s, operator, rc.id, "Pocket seam re-stitched with reinforced thread");
    expect(rc.status).toBe("repaired");
    expect(rc.repairedBy).toBe(operator.id);
    expect(rc.reinspectionId).toBeDefined();

    // Repair alone does NOT clear the hold or release the shirt
    expect(g.hold).not.toBeNull();
    expect(g.disposition).toBe("reinspection-pending");
    expect(() => E.packGarment(s, as(s, "packing.demo"), "SHIRT-002")).toThrow(/hold/);

    // 4. Test independent reinspection guard function
    const independentCheck = checkIndependentInspection(operator.id, rc);
    expect(independentCheck.allowed).toBe(false);
    expect(independentCheck.reason).toMatch(/Independent QC Violation/i);

    // 5. If the operator who repaired attempts to submit passing reinspection -> SERVER REJECTS!
    const reId = rc.reinspectionId!;
    expect(() =>
      E.submitInspection(s, operator, {
        inspectionId: reId,
        checklist: s.inspections
          .find((i) => i.id === reId)!
          .checklist.map((c) => ({ ...c, checked: true })),
        notes: "I repaired it and I approve it",
        result: "pass",
      }),
    ).toThrow(/inspector/i);

    // Even if the operator user had role Q (simulation of user having both roles):
    const sneakyOperator: StaffUser = {
      ...operator,
      role: "Q",
      department: "quality",
    };
    expect(() =>
      E.submitInspection(s, sneakyOperator, {
        inspectionId: reId,
        checklist: s.inspections
          .find((i) => i.id === reId)!
          .checklist.map((c) => ({ ...c, checked: true })),
        notes: "Self-approving my own repair",
        result: "pass",
      }),
    ).toThrow(/Independent QC Violation/i);

    // Operator cannot release hold either
    expect(() => E.releaseHold(s, sneakyOperator, "SHIRT-002")).toThrow(
      /Independent QC Violation/i,
    );

    // 6. An INDEPENDENT inspector (quality.demo) submits passing reinspection
    E.submitInspection(s, inspector, {
      inspectionId: reId,
      checklist: s.inspections
        .find((i) => i.id === reId)!
        .checklist.map((c) => ({ ...c, checked: true })),
      notes: "Reinforced seam verified and passed tolerance",
      result: "pass",
    });

    // Hold remains until explicit release
    expect(g.hold).not.toBeNull();

    // Independent inspector releases hold
    E.releaseHold(s, inspector, "SHIRT-002");
    expect(g.hold).toBeNull();
    expect(g.disposition).toBe("released");
    expect(g.stage).toBe("packing");
    expect(rc.status).toBe("closed");

    // History is preserved: initial failure is still failed, reinspection is passed
    const initialInsp = s.inspections.find((i) => i.id === "INSP-002")!;
    const reinspection = s.inspections.find((i) => i.id === reId)!;
    expect(initialInsp.status).toBe("failed");
    expect(reinspection.status).toBe("passed");
  });
});

describe("Member 3: Fulfilment, Warehousing & Outbound Departure Gate", () => {
  it("enforces packing eligibility, package sealing, and warehouse bin movements", () => {
    const s = createSeed();
    const packingUser = as(s, "packing.demo");
    const warehouseUser = as(s, "warehouse.demo");

    // SHIRT-001 is released in seed, let's reset its package to test packing flow
    const g1 = s.garments.find((x) => x.id === "SHIRT-001")!;
    g1.packageId = undefined;
    g1.stage = "packing";
    g1.disposition = "released";

    // 1. Packing: create package
    const pkgId = E.createPackage(s, packingUser);
    expect(pkgId).toMatch(/^PKG-/);

    // 2. Packing: pack garment
    const packedPkgId = E.packGarment(s, packingUser, g1.id);
    expect(packedPkgId).toBe(pkgId);
    expect(g1.packageId).toBe(pkgId);

    // Garment cannot be packed twice
    expect(() => E.packGarment(s, packingUser, g1.id)).toThrow(/not waiting for packing/i);

    // 3. Package sealing
    E.sealPackage(s, packingUser, pkgId);
    const pkg = s.packages.find((p) => p.id === pkgId)!;
    expect(pkg.status).toBe("sealed");

    // 4. Warehouse receipt
    E.receiveStock(s, warehouseUser, g1.id);
    expect(g1.stage).toBe("warehouse");

    // 5. Stock allocation to shipment
    E.allocateStock(s, warehouseUser, g1.id, "SHP-002");
    expect(g1.stage).toBe("allocated");
    expect(g1.shipmentId).toBe("SHP-002");
  });

  it("Outbound Departure Gate: late hold added after approval blocks departure", () => {
    const s = createSeed();
    const dispatchUser = as(s, "dispatch.demo");
    const manager = as(s, "manager.demo");

    // Setup SHP-002 for departure
    const g1 = s.garments.find((x) => x.id === "SHIRT-001")!;
    g1.stage = "allocated";
    g1.disposition = "released";
    g1.hold = null;

    E.updateShipmentPlan(s, manager, {
      shipmentId: "SHP-002",
      garmentIds: ["SHIRT-001"],
      markPlanned: true,
    });

    const sh = s.shipments.find((x) => x.id === "SHP-002")!;
    sh.allocatedGarmentIds = ["SHIRT-001"];

    // 1. Verify garment on manifest
    E.verifyGarmentDispatch(s, dispatchUser, "SHP-002", "SHIRT-001");
    expect(sh.verifiedGarmentIds).toContain("SHIRT-001");

    // 2. LATE HOLD: Quality inspector discovers a late fabric defect or recall on SHIRT-001
    g1.hold = {
      since: "2026-11-19T10:00:00Z",
      reason: "Urgent recall: fabric batch defect identified",
      inspectionId: "INSP-001",
    };

    // 3. Confirming departure MUST BE HARD-BLOCKED!
    expect(() => E.confirmDeparture(s, dispatchUser, "SHP-002")).toThrow(
      /Departure blocked.*no active quality hold/i,
    );
    expect(sh.status).toBe("planned"); // NOT departed!

    // 4. Clear the hold: departure is now permitted
    g1.hold = null;
    E.confirmDeparture(s, dispatchUser, "SHP-002");
    expect(sh.status).toBe("departed");
    expect(g1.stage).toBe("dispatched");
  });

  it("Packing staff cannot confirm departure", () => {
    const s = createSeed();
    const packingUser = as(s, "packing.demo");
    expect(() => E.confirmDeparture(s, packingUser, "SHP-002")).toThrow(/Only dispatch staff/i);
  });

  it("Complete Required Walkthrough: receive material → incoming QC → result-first QA fail → blocked packing → repair → blocked self-approval → independent release → pack → warehouse → verify manifest → late hold gate → clear hold → actual departure (sibling unaffected)", () => {
    const s = createSeed();
    const rcv = as(s, "receiving.demo");
    const q = as(s, "quality.demo");
    const mgr = as(s, "manager.demo");
    const stOp = as(s, "stitching.demo");
    const packStaff = as(s, "packing.demo");
    const whStaff = as(s, "warehouse.demo");
    const dispStaff = as(s, "dispatch.demo");

    // 1. Receive material lot FAB-003 and bind fresh card UID
    const freshLotId = "FAB-003";
    s.lots.push({
      id: freshLotId,
      material: "Organic cotton drill",
      supplierRef: "SUP-WALKTHROUGH",
      receivedQty: 30,
      balanceQty: 0,
      unit: "m",
      receivedAt: "2026-11-19T08:00:00Z",
      receivedBy: rcv.id,
      status: "awaiting-inspection",
    });
    const inspLotId = "INSP-LOT-003";
    s.inspections.push({
      id: inspLotId,
      kind: "incoming",
      subjectType: "lot",
      subjectId: freshLotId,
      status: "open",
      checklist: [{ id: "c1", label: "Inspect weave", checked: false }],
      notes: "",
      createdAt: "2026-11-19T08:05:00Z",
    });

    // 2. Complete incoming acceptance by quality inspector: 25m accepted, 3m held, 2m rejected
    E.submitIncomingQc(s, q, {
      lotId: freshLotId,
      inspectionId: inspLotId,
      acceptedQty: 25,
      heldQty: 3,
      rejectedQty: 2,
      checklist: [{ id: "c1", label: "Inspect weave", checked: true }],
      notes: "Grade A drill; minor edge defect rejected",
      result: "pass",
    });
    const fabLot = s.lots.find((l) => l.id === freshLotId)!;
    expect(fabLot.status).toBe("accepted");
    expect(fabLot.balanceQty).toBe(25);

    // 3. Sibling Garment Baseline: SHIRT-001 is unaffected throughout
    const sibling = s.garments.find((x) => x.id === "SHIRT-001")!;
    const initialSiblingStage = sibling.stage;

    // 4. Result-First / Card-Second QA on SHIRT-002
    const targetShirt = s.garments.find((x) => x.id === "SHIRT-002")!;
    targetShirt.stage = "final-qc";
    const qaCtxId = E.prepareActionContext(s, q, "final_qc", "submit_qc", {
      kind: "submit_qc",
      result: "fail",
      defectReason: "Collar seam twist",
      checklist: [
        { id: "c1", label: "Visual", checked: true },
        { id: "c2", label: "Stitch", checked: false },
      ],
      notes: "Twisted collar band",
    });
    E.acknowledgeContext(s, q, qaCtxId);

    // Inspector taps card at reader
    const qaOutcome = E.resolveRfidScan(s, q, "04DAEBFC");
    expect(qaOutcome.resolution).toBe("accepted");
    expect(qaOutcome.garmentCode).toBe("SHIRT-002");
    expect(targetShirt.hold).not.toBeNull();
    expect(targetShirt.stage).toBe("rework");

    // Sibling is completely unaffected
    expect(sibling.stage).toBe(initialSiblingStage);
    expect(sibling.hold).toBeNull();

    // 5. Try Packing SHIRT-002 -> demonstrate rejection
    expect(() => E.packGarment(s, packStaff, "SHIRT-002")).toThrow(/hold/);

    // 6. Assign repair and record repair
    const rc = s.rework.find((r) => r.garmentId === "SHIRT-002")!;
    E.assignRework(s, mgr, rc.id, "stitching");
    E.completeRework(s, stOp, rc.id, "Collar unpicked, realigned and re-stitched");
    expect(rc.status).toBe("repaired");
    expect(rc.repairedBy).toBe(stOp.id);

    // 7. Demonstrate blocked self-approval: operator attempting reinspection/release is rejected!
    const reId = rc.reinspectionId!;
    const sneakyOperator: StaffUser = { ...stOp, role: "Q", department: "quality" };
    expect(() =>
      E.submitInspection(s, sneakyOperator, {
        inspectionId: reId,
        checklist: s.inspections
          .find((i) => i.id === reId)!
          .checklist.map((c) => ({ ...c, checked: true })),
        notes: "Self-approval",
        result: "pass",
      }),
    ).toThrow(/Independent QC Violation/i);
    expect(() => E.releaseHold(s, sneakyOperator, "SHIRT-002")).toThrow(
      /Independent QC Violation/i,
    );

    // 8. Independent inspector passes reinspection and releases hold
    E.submitInspection(s, q, {
      inspectionId: reId,
      checklist: s.inspections
        .find((i) => i.id === reId)!
        .checklist.map((c) => ({ ...c, checked: true })),
      notes: "Collar band aligned and within spec",
      result: "pass",
    });
    E.releaseHold(s, q, "SHIRT-002");
    expect(targetShirt.hold).toBeNull();
    expect(targetShirt.disposition).toBe("released");
    expect(targetShirt.stage).toBe("packing");

    // 9. Pack garment into package
    const pkgId = E.createPackage(s, packStaff);
    E.packGarment(s, packStaff, "SHIRT-002");
    E.sealPackage(s, packStaff, pkgId);
    expect(targetShirt.packageId).toBe(pkgId);

    // Warehouse receive
    E.receiveStock(s, whStaff, "SHIRT-002");
    expect(targetShirt.stage).toBe("warehouse");

    // Allocate to shipment SHP-002
    E.updateShipmentPlan(s, mgr, {
      shipmentId: "SHP-002",
      garmentIds: ["SHIRT-002"],
      markPlanned: true,
    });
    E.allocateStock(s, whStaff, "SHIRT-002", "SHP-002");
    expect(targetShirt.stage).toBe("allocated");

    // 10. Verify manifest via S6 dispatch scan
    E.verifyGarmentDispatch(s, dispStaff, "SHP-002", "SHIRT-002");
    const shp = s.shipments.find((x) => x.id === "SHP-002")!;
    expect(shp.verifiedGarmentIds).toContain("SHIRT-002");

    // 11. Add a late hold to SHIRT-002 and demonstrate departure is hard-blocked
    targetShirt.hold = {
      since: "2026-11-19T11:00:00Z",
      reason: "Post-audit collar seam tension hold",
      inspectionId: "INSP-002",
    };
    expect(() => E.confirmDeparture(s, dispStaff, "SHP-002")).toThrow(
      /Departure blocked.*no active quality hold/i,
    );
    expect(shp.status).toBe("planned");

    // 12. Clear the authorized hold and record actual departure
    targetShirt.hold = null;
    E.confirmDeparture(s, dispStaff, "SHP-002");
    expect(shp.status).toBe("departed");
    expect(targetShirt.stage).toBe("dispatched");

    // Sibling remained unaffected throughout entire process
    expect(sibling.stage).toBe(initialSiblingStage);
  });

  it("Station 9: Aggregate Carton Dispatch Scan & Automated Gate Pipeline", () => {
    const s = createSeed();
    const dispStaff = as(s, "dispatch.demo");

    // 1. Check 1: Unrecognised Box Tag
    const unrecognisedRes = E.dispatchBoxScan(s, dispStaff, "UNKNOWN-TAG-999");
    expect(unrecognisedRes.resolution).toBe("rejected_unknown_card");
    expect(unrecognisedRes.rejectReason).toMatch(/Unrecognised Box Tag/i);

    // 2. Check 2: Cannot dispatch empty box
    const emptyPkgId = E.createPackage(s, as(s, "packing.demo"));
    const emptyRes = E.dispatchBoxScan(s, dispStaff, emptyPkgId);
    expect(emptyRes.resolution).toBe("rejected_business_rule");
    expect(emptyRes.rejectReason).toMatch(/Cannot dispatch empty box/i);

    // 3. Prepare sealed box with 2 garments
    const pkg = s.packages.find((p) => p.id === "PKG-001")!;
    expect(pkg.garmentIds.length).toBeGreaterThan(0);
    const linkedShirt = s.garments.find((g) => g.id === pkg.garmentIds[0])!;

    // 4. Check 4: Active Quality Hold Blocker
    linkedShirt.hold = {
      since: "2026-11-22T08:00:00Z",
      reason: "Stain mark on cuff",
      inspectionId: "INSP-TEST-HOLD",
    };
    const holdRes = E.dispatchBoxScan(s, dispStaff, pkg.id);
    expect(holdRes.resolution).toBe("rejected_business_rule");
    expect(holdRes.rejectReason).toMatch(/Blocked.*active Quality Hold/i);
    expect(pkg.status).toBe("sealed");

    // 5. Clear hold -> Instant Atomic Status Advancement
    linkedShirt.hold = null;
    const acceptRes = E.dispatchBoxScan(s, dispStaff, pkg.id);
    expect(acceptRes.resolution).toBe("accepted");
    expect(pkg.status).toBe("dispatched");
    expect(linkedShirt.stage).toBe("dispatched");

    // Verify downstream integration:
    // a. Garment has shipment ID linked
    expect(linkedShirt.shipmentId).toBeDefined();
    // b. Target shipment has verified the garment
    const targetShipment = s.shipments.find((sh) => sh.id === linkedShirt.shipmentId)!;
    expect(targetShipment.verifiedGarmentIds).toContain(linkedShirt.id);
    // c. Supply chain ledger recorded cryptographic commitments
    const garmentCommitment = s.ledger.find(
      (l) => l.subjectType === "garment" && l.subjectId === linkedShirt.id && l.milestone.includes("Station 9"),
    );
    expect(garmentCommitment).toBeDefined();
    expect(garmentCommitment?.status).toBe("confirmed");
    const shipmentCommitment = s.ledger.find(
      (l) => l.subjectType === "shipment" && l.subjectId === targetShipment.id,
    );
    expect(shipmentCommitment).toBeDefined();
    expect(shipmentCommitment?.status).toBe("confirmed");

    // 6. Check 3: Duplicate Dispatch Guard
    const dupRes = E.dispatchBoxScan(s, dispStaff, pkg.id);
    expect(dupRes.resolution).toBe("rejected_business_rule");
    expect(dupRes.rejectReason).toMatch(/Box Already Dispatched/i);
  });
});
