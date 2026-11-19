/**
 * Approved public projection service.
 * Owned by Member 4 (Staff access, shared UI and public journey).
 *
 * Reads internal database/mock state and emits ONLY allow-listed, shopper-safe fields.
 * No operators, exact locations, suppliers, warehouse names, private nonces,
 * raw RFID card UIDs, or internal repair notes may pass through here.
 */
import { computeSha256Sync, toCanonicalJson, toUtf8Bytes } from "@/domain/canonical";
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

/**
 * Builds the canonical public payload for an approved garment.
 * Generates deterministic canonical JSON and calculates its SHA-256 hash.
 */
export function buildCanonicalPublicPayload(
  s: DemoState,
  publicId: string,
): { payload: PublicPayload; canonicalJson: string; hash: string; version: number } | null {
  const record = publicProductRecords.find((r) => r.publicId === publicId);
  if (!record || !s.settings.business.publicJourneyEnabled) return null;
  const g = s.garments.find((x) => x.id === record.garmentId);
  if (!g) return null;
  const cut = s.cuttingOutputs.find((c) => c.id === g.cuttingOutputId);
  const lot = cut ? s.lots.find((l) => l.id === cut.lotId) : undefined;
  const events = s.garmentEvents.filter((e) => e.garmentId === g.id);

  const milestones: PublicPayload["milestones"] = [];

  // 1. Fabric Lot Receiving (Materials)
  if (lot && lot.status === "accepted") {
    milestones.push({
      key: "fabric-sourced",
      label: "Fabric lot received",
      date: day(lot.receivedAt),
      department: "Materials",
      lotLevel: true,
    });
  }

  // 2. Cutting (Production)
  if (cut) {
    milestones.push({
      key: "garment-cut",
      label: "Cut from fabric lot",
      date: day(cut.at),
      department: "Production",
    });
  }

  // 3. Assembly (Production)
  const assembled = events.find((e) => e.label === "Finishing completed");
  if (assembled) {
    milestones.push({
      key: "garment-assembled",
      label: "Garment assembled",
      date: day(assembled.at),
      department: "Production",
    });
  }

  // 4. Quality Control
  const passedOk = !g.hold && (g.disposition === "passed" || g.disposition === "released");
  if (passedOk) {
    const passed = s.inspections
      .filter((i) => i.subjectType === "garment" && i.subjectId === g.id && i.status === "passed")
      .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""))[0];
    const released = [...events].reverse().find((e) => e.label === "Quality hold released");
    const when = released?.at ?? passed?.submittedAt;
    if (when) {
      milestones.push({
        key: "quality-passed",
        label: "Passed quality control",
        date: day(when),
        department: "Quality Control",
      });
    }
  }

  // 5. Dispatch (Logistics)
  if (g.stage === "dispatched") {
    const sh = s.shipments.find((x) => x.id === g.shipmentId);
    if (sh?.departedAt) {
      milestones.push({
        key: "dispatched",
        label: "Dispatched to authorized retail network",
        date: day(sh.departedAt),
        department: "Logistics",
      });
    }
  }

  let status: PublicStatus = "In production";
  if (g.hold) {
    status = "Temporarily on hold";
  } else if (g.stage === "dispatched") {
    status = "Dispatched to authorized retail network";
  } else if (passedOk) {
    status = "Passed quality control";
  }

  // Version counter based on garment event history
  const version = Math.max(1, events.length + (g.hold ? 1 : 0));

  const payload: PublicPayload = {
    schema: "weartrail.public-journey/v1",
    publicId: record.publicId,
    version,
    productName: record.productName,
    garmentReference: g.id,
    status,
    ...(g.size ? { size: g.size } : {}),
    ...(lot
      ? {
          materialLot: {
            label: "Fabric lot",
            date: day(lot.receivedAt),
          },
        }
      : {}),
    milestones,
  };

  const canonicalJson = toCanonicalJson(payload);
  const hash = computeSha256Sync(canonicalJson);

  return { payload, canonicalJson, hash, version };
}

export function projectJourney(s: DemoState, publicId: string): PublicJourney | null {
  const record = publicProductRecords.find((r) => r.publicId === publicId);
  if (!record || !s.settings.business.publicJourneyEnabled) return null;
  const g = s.garments.find((x) => x.id === record.garmentId);
  if (!g) return null;
  const cut = s.cuttingOutputs.find((c) => c.id === g.cuttingOutputId);
  const lot = cut ? s.lots.find((l) => l.id === cut.lotId) : undefined;
  const events = s.garmentEvents.filter((e) => e.garmentId === g.id);

  const built = buildCanonicalPublicPayload(s, publicId);
  if (!built) return null;

  const milestones: PublicMilestone[] = [];

  // Fabric lot milestone
  if (lot && lot.status === "accepted") {
    milestones.push({
      key: "fabric-sourced",
      label: "Fabric lot received",
      date: day(lot.receivedAt),
      department: "Materials",
      lotLevel: true,
      description:
        "Fabric received and verified under lot-level quality inspection. This milestone is shared across garments cut from this lot.",
    });
  }

  // Cutting milestone
  if (cut) {
    milestones.push({
      key: "garment-cut",
      label: "Cut from fabric lot",
      date: day(cut.at),
      department: "Production",
      description: "Garment panels precisely cut and assigned an individual tracking credential.",
    });
  }

  // Assembly milestone
  const assembled = events.find((e) => e.label === "Finishing completed");
  if (assembled) {
    milestones.push({
      key: "garment-assembled",
      label: "Garment assembled",
      date: day(assembled.at),
      department: "Production",
      description: "Sewing, seam stitching, and finishing operations completed.",
    });
  }

  // Quality milestone
  const passedOk = !g.hold && (g.disposition === "passed" || g.disposition === "released");
  if (passedOk) {
    const passed = s.inspections
      .filter((i) => i.subjectType === "garment" && i.subjectId === g.id && i.status === "passed")
      .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""))[0];
    const released = [...events].reverse().find((e) => e.label === "Quality hold released");
    const when = released?.at ?? passed?.submittedAt;
    if (when) {
      milestones.push({
        key: "quality-passed",
        label: "Passed quality control",
        date: day(when),
        department: "Quality Control",
        description: "The garment passed comprehensive quality and workmanship evaluation.",
      });
    }
  }

  // Dispatch milestone
  if (g.stage === "dispatched") {
    const sh = s.shipments.find((x) => x.id === g.shipmentId);
    if (sh?.departedAt) {
      milestones.push({
        key: "dispatched",
        label: "Dispatched to authorized retail network",
        date: day(sh.departedAt),
        department: "Logistics",
        description: "Verified shipment left the facility for an authorized retail partner.",
      });
    }
  }

  let status: PublicStatus = "In production";
  if (g.hold) {
    status = "Temporarily on hold";
  } else if (g.stage === "dispatched") {
    status = "Dispatched to authorized retail network";
  } else if (passedOk) {
    status = "Passed quality control";
  }

  return {
    publicId: record.publicId,
    productName: record.productName,
    productDescription: record.productDescription,
    garmentReference: g.id,
    materialOrigin: lot ? "Fabric lot" : undefined,
    status,
    colour: undefined, // Optional: empty/omitted
    size: g.size || undefined,
    journeyHash: built.hash,
    payloadVersion: built.version,
    publishedAt: day(new Date().toISOString()),
    milestones,
    notice: g.hold
      ? {
          kind: "hold",
          title: "Quality review in progress — Not released",
          message:
            "This garment is currently on hold while our quality team completes a review. Its journey record will automatically update upon release.",
        }
      : undefined,
    advisory: record.advisory,
    evidence: evidenceFor(s, g.id),
    sampleCommitmentRef: record.sampleCommitmentRef,
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
  const built = buildCanonicalPublicPayload(s, publicId);
  if (!j || !record || !built) return null;

  const utf8 = toUtf8Bytes(built.canonicalJson);

  return {
    publicId: j.publicId,
    productName: j.productName,
    version: built.version,
    journeyHash: built.hash,
    evidence: j.evidence,
    sampleCommitmentRef: record.sampleCommitmentRef,
    canonicalBytesLength: utf8.length,
    payload: built.payload,
  };
}
