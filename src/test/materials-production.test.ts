import { describe, expect, it } from "vitest";
import type { DemoState, StaffUser } from "@/domain/types";
import * as E from "@/mock/engine";
import { createSeed } from "@/mock/fixtures";

const as = (s: DemoState, username: string): StaffUser =>
  s.users.find((u) => u.username === username)!;

describe("Member 2: Materials & Production Domain Logic", () => {
  describe("Phase 2 — Material Receipts and Multi-Order Issuing", () => {
    it("records a fabric bundle receipt and binds fresh bundle card at Station 1", () => {
      const s = createSeed();
      const rcv = as(s, "receiving.demo");

      // 1. Receive 25 meters of Linen
      const lotId = E.receiveLot(s, rcv, {
        material: "100% Pure Linen, Natural, 145 cm",
        supplierRef: "SUP-LINEN-99",
        qty: 25,
        unit: "m",
      });
      const lot = s.lots.find((l) => l.id === lotId)!;
      expect(lot).toBeDefined();
      expect(lot.status).toBe("awaiting-inspection");
      expect(lot.balanceQty).toBe(25);
      expect(lot.rfidUid).toBeUndefined();

      // 2. Prepare assign bundle card context
      const ctxId = E.prepareActionContext(s, rcv, "fabric_receiving", "assign_bundle_card", {
        kind: "assign_bundle_card",
        lotId,
      });
      E.acknowledgeContext(s, rcv, ctxId);

      // Attempt to bind already-assigned card (FAB-001 card 04A1B2C3) -> rejected
      const dupOutcome = E.resolveRfidScan(s, rcv, "04A1B2C3");
      expect(dupOutcome.resolution).toBe("rejected_active_card");

      // Bind fresh unassigned card
      const okOutcome = E.resolveRfidScan(s, rcv, "04998877");
      expect(okOutcome.resolution).toBe("accepted");
      expect(lot.rfidUid).toBe("04998877");

      // 3. Member 3 Incoming QC handoff applies accepted quantity
      E.applyIncomingQCQuantity(s, lotId, 25, 0, 0);
      expect(lot.status).toBe("accepted");
      expect(lot.balanceQty).toBe(25);
    });

    it("verifies multi-order issuing from one lot without over-allocation (20m lot -> 8m -> 6m -> 6m free)", () => {
      const s = createSeed();
      const rawStore = as(s, "rawstore.demo");
      const fab1 = s.lots.find((l) => l.id === "FAB-001")!;

      // In createSeed, FAB-001 had receivedQty=20, ISS-001 had 8m, ISS-002 had 6m, leaving 6m balance.
      expect(fab1.receivedQty).toBe(20);
      expect(fab1.balanceQty).toBe(6);

      // Attempting to issue 10m to an order fails due to insufficient stock
      expect(() =>
        E.issueMaterial(s, rawStore, {
          lotId: "FAB-001",
          orderId: "ORDER-001",
          qty: 10,
        }),
      ).toThrow(/between 0 and 6/);

      // Prepare RFID issue context for 4m
      const ctxId = E.prepareActionContext(s, rawStore, "fabric_issue", "confirm_issue", {
        kind: "confirm_issue",
        lotId: "FAB-001",
        orderId: "ORDER-001",
        qty: 4,
      });
      E.acknowledgeContext(s, rawStore, ctxId);

      // Presenting wrong card (garment card or unknown card) -> rejected
      const wrongSubjectOutcome = E.resolveRfidScan(s, rawStore, "04A7B8C9"); // Garment card
      expect(wrongSubjectOutcome.resolution).toBe("rejected_wrong_subject_type");

      // Presenting correct bundle card FAB-001 (04A1B2C3)
      const issueOutcome = E.resolveRfidScan(s, rawStore, "04A1B2C3");
      expect(issueOutcome.resolution).toBe("accepted");
      expect(fab1.balanceQty).toBe(2); // 6m - 4m = 2m
    });

    it("enforces role and department authorization on lot receiving and issuing", () => {
      const s = createSeed();
      const cuttingStaff = as(s, "cutting.demo");

      // Cutting staff cannot receive lots or issue fabric
      expect(() =>
        E.receiveLot(s, cuttingStaff, {
          material: "Silk",
          supplierRef: "SUP-01",
          qty: 10,
        }),
      ).toThrow(/receiving staff/i);

      expect(() =>
        E.issueMaterial(s, cuttingStaff, {
          lotId: "FAB-001",
          orderId: "ORDER-001",
          qty: 2,
        }),
      ).toThrow(/raw-store staff/i);
    });
  });

  describe("Phase 3 — Cutting, Source Retention and Garment Creation", () => {
    it("locks and retains confirmed cutting source across multiple garment card bindings", () => {
      const s = createSeed();
      const cutOp = as(s, "cutting.demo");

      // 1. Select cutting source at Cutting station
      const srcCtxId = E.prepareActionContext(s, cutOp, "cutting", "select_cutting_source", {
        kind: "select_cutting_source",
        orderId: "ORDER-001",
        issueId: "ISS-001", // 8m issued from FAB-001 (4.2m used by CUT-001/002, 3.8m remains)
        consumedQty: 3.8,
        wasteQty: 0.2,
      });
      E.acknowledgeContext(s, cutOp, srcCtxId);

      // Scanning wrong bundle card (FAB-002: 04D4E5F6) -> rejected
      const wrongCardOutcome = E.resolveRfidScan(s, cutOp, "04D4E5F6");
      expect(wrongCardOutcome.resolution).toBe("rejected_business_rule");

      // Scanning correct bundle card (FAB-001: 04A1B2C3) -> accepted
      const srcOutcome = E.resolveRfidScan(s, cutOp, "04A1B2C3");
      expect(srcOutcome.resolution).toBe("accepted");

      const activeSource = s.cuttingSourceSelections.find(
        (cs) => cs.confirmedBy === cutOp.id && cs.active,
      );
      expect(activeSource).toBeDefined();
      expect(activeSource?.issueId).toBe("ISS-001");

      // 2. Bind Garment 1 (Shirt #3) with fresh card 04112233
      const g1Ctx = E.prepareActionContext(s, cutOp, "cutting", "bind_garment_tag", {
        kind: "bind_garment_tag",
        cuttingSourceSelectionId: activeSource!.id,
        orderId: "ORDER-001",
        size: "M",
      });
      E.acknowledgeContext(s, cutOp, g1Ctx);

      const g1Outcome = E.resolveRfidScan(s, cutOp, "04112233");
      expect(g1Outcome.resolution).toBe("accepted");
      expect(g1Outcome.garmentCode).toBeDefined();

      const garment1 = s.garments.find((g) => g.id === g1Outcome.garmentCode)!;
      expect(garment1).toBeDefined();
      expect(garment1.rfidUid).toBe("04112233");
      expect(garment1.stage).toBe("stitching");
      expect(garment1.disposition).toBe("not-inspected");

      // Verify lineage for Garment 1
      const cutOutput1 = s.cuttingOutputs.find((c) => c.id === garment1.cuttingOutputId)!;
      expect(cutOutput1.issueId).toBe("ISS-001");
      expect(cutOutput1.lotId).toBe("FAB-001");
      expect(cutOutput1.fabricUsed).toBe(0.95);

      // 3. Source selection is STILL ACTIVE on bench! Bind Garment 2 (Shirt #4) with fresh card 04223344
      expect(activeSource?.active).toBe(true);

      const g2Ctx = E.prepareActionContext(s, cutOp, "cutting", "bind_garment_tag", {
        kind: "bind_garment_tag",
        cuttingSourceSelectionId: activeSource!.id,
        orderId: "ORDER-001",
        size: "L",
      });
      E.acknowledgeContext(s, cutOp, g2Ctx);

      // Attempt to reuse Garment 1's card 04112233 -> rejected
      const dupGarmentOutcome = E.resolveRfidScan(s, cutOp, "04112233");
      expect(dupGarmentOutcome.resolution).toBe("rejected_active_card");

      // Scan fresh card 04223344 -> accepted
      const g2Outcome = E.resolveRfidScan(s, cutOp, "04223344");
      expect(g2Outcome.resolution).toBe("accepted");

      const garment2 = s.garments.find((g) => g.id === g2Outcome.garmentCode)!;
      expect(garment2.id).not.toBe(garment1.id);
      expect(garment2.rfidUid).toBe("04223344");
      expect(garment2.size).toBe("L");

      const cutOutput2 = s.cuttingOutputs.find((c) => c.id === garment2.cuttingOutputId)!;
      expect(cutOutput2.issueId).toBe("ISS-001");
      expect(cutOutput2.lotId).toBe("FAB-001");
      expect(cutOutput2.fabricUsed).toBe(0.95);
    });

    it("replaces a damaged or lost RFID card while preserving permanent identity and history", () => {
      const s = createSeed();
      const cutOp = as(s, "cutting.demo");
      const shirt = s.garments.find((g) => g.id === "SHIRT-002")!;
      const originalUid = shirt.rfidUid; // 04DAEBFC
      const originalPublicId = shirt.publicId;

      // Card replacement with a fresh UID
      const replaceOutcome = E.replaceGarmentCard(s, cutOp, "SHIRT-002", "04ABCDEF");
      expect(replaceOutcome.resolution).toBe("accepted");
      expect(shirt.rfidUid).toBe("04ABCDEF");
      expect(shirt.publicId).toBe(originalPublicId); // Permanent public ID unchanged!

      // Old card is now inactive
      const oldBinding = s.rfidTagBindings.find((b) => b.uid === originalUid)!;
      expect(oldBinding.active).toBe(false);
      expect(oldBinding.unboundAt).toBeDefined();

      // New card is active and bound to SHIRT-002
      const newBinding = s.rfidTagBindings.find((b) => b.uid === "04ABCDEF")!;
      expect(newBinding.active).toBe(true);
      expect(newBinding.subjectId).toBe("SHIRT-002");
    });
  });

  describe("Phase 4 — Routine Assembly Scans and QA Sibling Isolation", () => {
    it("advances routine assembly stages without manual subject selection", () => {
      const s = createSeed();
      const stitcher = as(s, "stitching.demo");
      const finisher = as(s, "finishing.demo");

      // SHIRT-002 in seed is at stage 'final-qc', but let's test a newly cut garment
      // TROUSER-001 in seed is at stage 'finishing' with UID '04001122'
      const trouser = s.garments.find((g) => g.id === "TROUSER-001")!;
      expect(trouser.stage).toBe("finishing");

      // Routine scan at Stitching station with a garment already at 'finishing' -> rejected wrong stage
      const wrongStageOutcome = E.routineScan(s, stitcher, "04001122", "stitching");
      expect(wrongStageOutcome.resolution).toBe("rejected_wrong_stage");

      // Routine scan at Finishing station with TROUSER-001 (UID 04001122) -> advances to final-qc
      const finishOutcome = E.routineScan(s, finisher, "04001122", "finishing");
      expect(finishOutcome.resolution).toBe("accepted");
      expect(trouser.stage).toBe("final-qc");
      expect(trouser.disposition).toBe("awaiting-inspection");

      // Duplicate immediate scan -> rejected_duplicate
      const dupOutcome = E.routineScan(s, finisher, "04001122", "finishing");
      expect(dupOutcome.resolution).toBe("rejected_wrong_stage"); // stage is now final-qc
    });

    it("guarantees QA failure on one garment isolates hold and does not affect sibling garment", () => {
      const s = createSeed();
      const qc = as(s, "quality.demo");

      // Two sibling shirts cut from ISS-001: SHIRT-001 (dispatched) and SHIRT-002 (at QA)
      const s1 = s.garments.find((g) => g.id === "SHIRT-001")!;
      const s2 = s.garments.find((g) => g.id === "SHIRT-002")!;

      expect(s1.stage).toBe("dispatched");
      expect(s1.hold).toBeNull();

      // Submit QA failure on SHIRT-002
      E.submitInspection(s, qc, {
        inspectionId: "INSP-002",
        checklist: [{ id: "c1", label: "Check", checked: false }],
        notes: "Broken stitch on cuff",
        result: "fail",
        defectReason: "Broken stitch",
      });

      expect(s2.hold).not.toBeNull();
      expect(s2.disposition).toBe("failed");
      expect(s2.stage).toBe("rework");

      // Sibling SHIRT-001 remains completely unaffected!
      expect(s1.hold).toBeNull();
      expect(s1.stage).toBe("dispatched");
    });

    it("verifies product specifications listing and saving", () => {
      const s = createSeed();
      const mgr = as(s, "manager.demo");

      const specs = E.listProductSpecs(s);
      expect(specs.length).toBeGreaterThan(0);
      expect(specs.some((sp) => sp.styleCode === "WT-SH-100")).toBe(true);

      const newSpecId = E.saveProductSpec(s, mgr, {
        id: "",
        name: "Safari Overshirt",
        styleCode: "WT-JK-400",
        category: "jacket",
        standardConsumptionMeters: 3.2,
        sizeVariants: ["M", "L", "XL"],
        active: true,
        description: "Heavy cotton twill overshirt with utility pockets.",
      });

      expect(newSpecId).toBeDefined();
      const saved = s.productSpecs?.find((sp) => sp.id === newSpecId);
      expect(saved?.styleCode).toBe("WT-JK-400");
      expect(saved?.standardConsumptionMeters).toBe(3.2);
    });
  });

  describe("Phase 5 — Complete Member 2 End-to-End Operational Lifecycle", () => {
    it("executes the complete Member 2 flow from raw fabric bundle receipt through order issue, bench cutting, tag binding, and routine assembly to QA handoff", () => {
      const s = createSeed();

      // Factory staff operators
      const rcvStaff = as(s, "receiving.demo");
      const mgrStaff = as(s, "manager.demo");
      const storeStaff = as(s, "rawstore.demo");
      const cutStaff = as(s, "cutting.demo");
      const stitchStaff = as(s, "stitching.demo");
      const finishStaff = as(s, "finishing.demo");

      // -------------------------------------------------------------
      // 1. Raw Fabric Receipt & Bundle Card Binding at Station 1
      // -------------------------------------------------------------
      const lotId = E.receiveLot(s, rcvStaff, {
        material: "100% Organic GOTS Cotton Poplin, Sky Blue, 140cm",
        supplierRef: "GOTS-POPLIN-2026",
        qty: 30.0,
        unit: "m",
      });
      const lot = s.lots.find((l) => l.id === lotId)!;
      expect(lot).toBeDefined();
      expect(lot.status).toBe("awaiting-inspection");
      expect(lot.balanceQty).toBe(30.0);

      // Bind bundle RFID card at Station 1 (fabric_receiving)
      const rcvCtx = E.prepareActionContext(s, rcvStaff, "fabric_receiving", "assign_bundle_card", {
        kind: "assign_bundle_card",
        lotId,
      });
      E.acknowledgeContext(s, rcvStaff, rcvCtx);
      const rcvOutcome = E.resolveRfidScan(s, rcvStaff, "04EE5566");
      expect(rcvOutcome.resolution).toBe("accepted");
      expect(lot.rfidUid).toBe("04EE5566");

      // -------------------------------------------------------------
      // 2. Incoming QC Clearance (Member 3 Handoff)
      // -------------------------------------------------------------
      E.applyIncomingQCQuantity(s, lotId, 30.0, 0, 0);
      expect(lot.status).toBe("accepted");
      expect(lot.balanceQty).toBe(30.0);

      // -------------------------------------------------------------
      // 3. Digital Production Order Planning & Approval
      // -------------------------------------------------------------
      // Orders have NO RFID card; product specification determines standard consumption
      const orderId = E.planOrder(s, mgrStaff, {
        product: "Organic Oxford Shirt",
        styleCode: "WT-SH-100",
        qty: 2,
        dueDate: "2026-12-20",
      });
      const order = s.orders.find((o) => o.id === orderId)!;
      expect(order.status).toBe("planned");

      // Manager approves order for factory production
      E.approveOrder(s, mgrStaff, orderId);
      expect(order.status).toBe("approved");

      // -------------------------------------------------------------
      // 4. Fabric Allocation & Physical Issue at Station 2 (fabric_issue)
      // -------------------------------------------------------------
      // 2 shirts * 2.0m consumption = 4.0m issued
      const issCtx = E.prepareActionContext(s, storeStaff, "fabric_issue", "confirm_issue", {
        kind: "confirm_issue",
        lotId: lot.id,
        orderId: order.id,
        qty: 4.0,
      });
      E.acknowledgeContext(s, storeStaff, issCtx);

      // Presenting the bundle card (04EE5566) confirms the physical warehouse transfer
      const issOutcome = E.resolveRfidScan(s, storeStaff, "04EE5566");
      expect(issOutcome.resolution).toBe("accepted");
      expect(lot.balanceQty).toBe(26.0); // 30m - 4m = 26m
      expect(order.status).toBe("in-progress");

      const issueRecord = s.issues.find((i) => i.lotId === lot.id && i.orderId === order.id)!;
      expect(issueRecord).toBeDefined();
      expect(issueRecord.qty).toBe(4.0);

      // -------------------------------------------------------------
      // 5. Cutting Table Bench Lock at Station 3 (cutting)
      // -------------------------------------------------------------
      // Cutting operator locks the confirmed fabric source on the bench
      const srcCtx = E.prepareActionContext(s, cutStaff, "cutting", "select_cutting_source", {
        kind: "select_cutting_source",
        orderId: order.id,
        issueId: issueRecord.id,
        consumedQty: 4.0,
        wasteQty: 0.2,
      });
      E.acknowledgeContext(s, cutStaff, srcCtx);

      // Tap the fabric bundle card to confirm source
      const srcOutcome = E.resolveRfidScan(s, cutStaff, "04EE5566");
      expect(srcOutcome.resolution).toBe("accepted");

      const activeBenchSource = s.cuttingSourceSelections.find(
        (cs) => cs.confirmedBy === cutStaff.id && cs.active,
      )!;
      expect(activeBenchSource).toBeDefined();
      expect(activeBenchSource.lotId).toBe(lot.id);
      expect(activeBenchSource.issueId).toBe(issueRecord.id);

      // -------------------------------------------------------------
      // 6. Individual Garment Card Binding at Station 3
      // -------------------------------------------------------------
      // Garment 1 (Size M) cut and tagged with fresh card 04771122
      const g1Ctx = E.prepareActionContext(s, cutStaff, "cutting", "bind_garment_tag", {
        kind: "bind_garment_tag",
        cuttingSourceSelectionId: activeBenchSource.id,
        orderId: order.id,
        size: "M",
      });
      E.acknowledgeContext(s, cutStaff, g1Ctx);

      const g1Outcome = E.resolveRfidScan(s, cutStaff, "04771122");
      expect(g1Outcome.resolution).toBe("accepted");
      const garment1 = s.garments.find((g) => g.id === g1Outcome.garmentCode)!;
      expect(garment1).toBeDefined();
      expect(garment1.rfidUid).toBe("04771122");
      expect(garment1.size).toBe("M");
      expect(garment1.stage).toBe("stitching");
      expect(garment1.disposition).toBe("not-inspected");

      // Verify exact actual lineage for Garment 1
      const cut1 = s.cuttingOutputs.find((c) => c.id === garment1.cuttingOutputId)!;
      expect(cut1.issueId).toBe(issueRecord.id);
      expect(cut1.lotId).toBe(lot.id);
      expect(cut1.fabricUsed).toBe(2.0); // 4.0m / 2 planned shirts = 2.0m each

      // Cutting source remains active on bench for Garment 2 without re-entering bundle data!
      expect(activeBenchSource.active).toBe(true);

      // Garment 2 (Size L) cut and tagged with fresh card 04882233
      const g2Ctx = E.prepareActionContext(s, cutStaff, "cutting", "bind_garment_tag", {
        kind: "bind_garment_tag",
        cuttingSourceSelectionId: activeBenchSource.id,
        orderId: order.id,
        size: "L",
      });
      E.acknowledgeContext(s, cutStaff, g2Ctx);

      const g2Outcome = E.resolveRfidScan(s, cutStaff, "04882233");
      expect(g2Outcome.resolution).toBe("accepted");
      const garment2 = s.garments.find((g) => g.id === g2Outcome.garmentCode)!;
      expect(garment2.rfidUid).toBe("04882233");
      expect(garment2.size).toBe("L");

      // -------------------------------------------------------------
      // 7. Routine Assembly Advancement at Stations 4 & 5
      // -------------------------------------------------------------
      // Station 4: Routine Stitching scan — identity resolved purely from card UID 04771122
      const stitchOutcome = E.routineScan(s, stitchStaff, "04771122", "stitching");
      expect(stitchOutcome.resolution).toBe("accepted");
      expect(garment1.stage).toBe("finishing");

      // Station 5: Routine Finishing scan — advances directly to Final QC
      const finishOutcome = E.routineScan(s, finishStaff, "04771122", "finishing");
      expect(finishOutcome.resolution).toBe("accepted");
      expect(garment1.stage).toBe("final-qc");
      expect(garment1.disposition).toBe("awaiting-inspection");

      // Inspection record created for Member 3 (QA) handoff
      const insp = s.inspections.find((i) => i.subjectId === garment1.id && i.kind === "final");
      expect(insp).toBeDefined();
      expect(insp?.status).toBe("open");

      // -------------------------------------------------------------
      // 8. End-to-End Trace Lineage Verification
      // -------------------------------------------------------------
      // Garment 1 -> Cutting Output 1 -> Issue Movement -> Material Lot (Cotton Poplin)
      expect(garment1.cuttingOutputId).toBe(cut1.id);
      expect(cut1.issueId).toBe(issueRecord.id);
      expect(cut1.lotId).toBe(lot.id);
      expect(issueRecord.lotId).toBe(lot.id);
      expect(lot.material).toBe("100% Organic GOTS Cotton Poplin, Sky Blue, 140cm");
    });
  });
});
