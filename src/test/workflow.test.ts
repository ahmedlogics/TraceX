import { describe, expect, it } from "vitest";
import { canAccessRoute } from "@/domain/permissions";
import type { DemoState, StaffUser } from "@/domain/types";
import * as E from "@/mock/engine";
import { createSeed } from "@/mock/fixtures";
import { projectJourney } from "@/mock/projection";

const as = (s: DemoState, username: string): StaffUser => s.users.find((u) => u.username === username)!;
const final = (s: DemoState) => s.inspections.find((i) => i.id === "INSP-002")!;
const checked = (s: DemoState, id: string) => s.inspections.find((i) => i.id === id)!.checklist.map((c) => ({ ...c, checked: true }));

describe("access rules", () => {
  it("blocks the manager from submitting a QC result", () => {
    const s = createSeed();
    expect(() => E.submitInspection(s, as(s, "manager.demo"), { inspectionId: "INSP-002", checklist: checked(s, "INSP-002"), notes: "", result: "pass" })).toThrow(/inspector/);
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
    expect(E.simulateTrigger(s, q, "S4")).toBe("accepted");
    expect(E.simulateTrigger(s, q, "S4")).toBe("ignored-duplicate");
    expect(final(s).status).toBe("open");

    E.submitInspection(s, q, { inspectionId: "INSP-002", checklist: final(s).checklist, notes: "", result: "fail", defectReason: "Open seam" });
    const g = () => s.garments.find((x) => x.id === "SHIRT-002")!;
    expect(g().hold).not.toBeNull();
    expect(projectJourney(s, "shirt-002-demo")?.status).toBe("Temporarily on hold");
    const rc = s.rework[0]!;

    // Held garment on a planned shipment stays blocked.
    E.updateShipmentPlan(s, as(s, "manager.demo"), { shipmentId: "SHP-002", garmentIds: ["SHIRT-002"], markPlanned: true });
    expect(() => E.packGarment(s, as(s, "packing.demo"), "SHIRT-002")).toThrow(/hold/);

    E.assignRework(s, as(s, "manager.demo"), rc.id, "stitching");
    expect(() => E.completeRework(s, as(s, "finishing.demo"), rc.id, "x")).toThrow();
    E.completeRework(s, as(s, "stitching.demo"), rc.id, "Re-stitched");
    expect(() => E.releaseHold(s, as(s, "stitching.demo"), "SHIRT-002")).toThrow();

    const reId = s.rework[0]!.reinspectionId!;
    E.submitInspection(s, q, { inspectionId: reId, checklist: checked(s, reId), notes: "", result: "pass" });
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
