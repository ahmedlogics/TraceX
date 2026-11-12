/**
 * Approved public projection. Reads internal state and emits ONLY allow-listed,
 * shopper-safe fields. No operators, exact locations, suppliers, warehouse names,
 * private payloads or internal repair notes may pass through here.
 */
import type {
  PublicEvidenceState,
  PublicJourney,
  PublicMilestone,
  PublicPayload,
  PublicProof,
  PublicStatus,
} from "@/domain/public-types";
import type { DemoState } from "@/domain/types";
import { publicProductRecords } from "./public-fixtures";

const day = (iso: string) => iso.slice(0, 10);

export function projectJourney(s: DemoState, publicId: string): PublicJourney | null {
  const record = publicProductRecords.find((r) => r.publicId === publicId);
  if (!record || !s.settings.business.publicJourneyEnabled) return null;
  const g = s.garments.find((x) => x.id === record.garmentId);
  if (!g) return null;
  const cut = s.cuttingOutputs.find((c) => c.id === g.cuttingOutputId);
  const lot = cut ? s.lots.find((l) => l.id === cut.lotId) : undefined;
  const events = s.garmentEvents.filter((e) => e.garmentId === g.id);

  const milestones: PublicMilestone[] = [];
  if (lot && lot.status === "accepted") {
    milestones.push({
      key: "fabric-sourced",
      label: "Fabric sourced",
      date: day(lot.receivedAt),
      lotLevel: true,
      description: "The fabric lot this garment was cut from was received and accepted. This is a lot-level record shared by every garment cut from that lot.",
    });
  }
  if (cut) {
    milestones.push({ key: "garment-cut", label: "Cut from that fabric", date: day(cut.at), description: "Garment panels were cut from fabric issued from the lot above." });
  }
  const assembled = events.find((e) => e.label === "Finishing completed");
  if (assembled) {
    milestones.push({ key: "garment-assembled", label: "Garment assembled", date: day(assembled.at), description: "The garment was sewn and finished." });
  }
  const passedOk = !g.hold && (g.disposition === "passed" || g.disposition === "released");
  if (passedOk) {
    const passed = s.inspections
      .filter((i) => i.subjectType === "garment" && i.subjectId === g.id && i.status === "passed")
      .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""))[0];
    const released = [...events].reverse().find((e) => e.label === "Quality hold released");
    const when = released?.at ?? passed?.submittedAt;
    if (when) milestones.push({ key: "quality-passed", label: "Passed quality control", date: day(when), description: "The garment passed final quality inspection." });
  }
  if (g.stage === "dispatched") {
    const sh = s.shipments.find((x) => x.id === g.shipmentId);
    if (sh?.departedAt) milestones.push({ key: "dispatched", label: "Dispatched to authorized retail network", date: day(sh.departedAt), description: "The garment left the factory for an authorized retail partner." });
  }

  let status: PublicStatus = "In production";
  if (g.hold) status = "Temporarily on hold";
  else if (g.stage === "dispatched") status = "Dispatched to authorized retail network";
  else if (passedOk) status = "Passed quality control";

  return {
    publicId: record.publicId,
    productName: record.productName,
    productDescription: record.productDescription,
    status,
    milestones,
    notice: g.hold
      ? { kind: "hold", title: "Quality review in progress", message: "This garment is temporarily held while a quality review is completed. Its journey will update when the review is finished." }
      : undefined,
    advisory: record.advisory,
    evidence: evidenceFor(s, g.id),
  };
}

function evidenceFor(s: DemoState, garmentId: string): PublicEvidenceState {
  const c = s.ledger.find((l) => l.subjectType === "garment" && l.subjectId === garmentId);
  if (!c || c.status === "failed") return "unavailable";
  return c.status === "confirmed" ? "sample-confirmed" : "pending";
}

export function projectProof(s: DemoState, publicId: string): PublicProof | null {
  const j = projectJourney(s, publicId);
  const record = publicProductRecords.find((r) => r.publicId === publicId);
  if (!j || !record) return null;
  const payload: PublicPayload = {
    schema: "weartrail.public-journey/demo-v0",
    publicId: j.publicId,
    productName: j.productName,
    status: j.status,
    milestones: j.milestones.map((m) => ({ key: m.key, date: m.date, ...(m.lotLevel ? { lotLevel: true } : {}) })),
  };
  return { publicId: j.publicId, productName: j.productName, evidence: j.evidence, sampleCommitmentRef: record.sampleCommitmentRef, payload };
}
