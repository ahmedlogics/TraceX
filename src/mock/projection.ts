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
  const issue = cut ? s.issues.find((i) => i.id === cut.issueId) : undefined;
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

  // 2. Material Issued (Raw Store)
  if (issue) {
    milestones.push({
      key: "material-issued",
      label: "Material issued to cutting",
      date: day(issue.at),
      department: "Raw Store",
    });
  }

  // 3. Cutting (Production)
  if (cut) {
    milestones.push({
      key: "garment-cut",
      label: "Cut from fabric lot",
      date: day(cut.at),
      department: "Production",
    });
  }

  // 4. Seam Stitching (Production)
  const stitching = events.find((e) => e.label.toLowerCase().includes("stitching"));
  if (
    stitching ||
    ["finishing", "final-qc", "packing", "warehouse", "allocated", "dispatched"].includes(
      g.stage,
    )
  ) {
    milestones.push({
      key: "stitching-completed",
      label: "Seam stitching completed",
      date: day(stitching?.at ?? cut?.at ?? new Date().toISOString()),
      department: "Production",
    });
  }

  // 5. Assembly / Finishing (Production)
  // Only included if finished event exists or garment has moved past finishing stage.
  // Stage "finishing" means garment is actively in finishing, not yet assembled.
  const assembled = events.find(
    (e) => e.label === "Finishing completed" || e.label.toLowerCase().includes("finishing"),
  );
  if (
    assembled ||
    ["final-qc", "packing", "warehouse", "allocated", "dispatched"].includes(g.stage)
  ) {
    const stitchDate = milestones.find((m) => m.key === "stitching-completed")?.date;
    const rawDate = day(assembled?.at ?? stitchDate ?? cut?.at ?? new Date().toISOString());
    const finalDate = stitchDate && rawDate < stitchDate ? stitchDate : rawDate;
    milestones.push({
      key: "garment-assembled",
      label: "Garment assembled",
      date: finalDate,
      department: "Production",
    });
  }

  // 6. Quality Control (Gated: never added if active hold or failed)
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

    // 7. Packaging (Carton)
    const pkg =
      s.packages.find((p) => p.garmentIds.includes(g.id)) ||
      (g.packageId ? s.packages.find((p) => p.id === g.packageId) : undefined);
    const packingEvent = events.find((e) => e.label.toLowerCase().includes("packed"));
    if (pkg || packingEvent || ["packing", "warehouse", "allocated", "dispatched"].includes(g.stage)) {
      milestones.push({
        key: "garment-packed",
        label: "Packaged into master carton",
        date: day(packingEvent?.at ?? pkg?.createdAt ?? when ?? new Date().toISOString()),
        department: "Logistics",
      });
    }

    // 8. Warehouse Receiving
    const whEvent = events.find(
      (e) => e.label.toLowerCase().includes("finished stock") || e.department === "warehouse",
    );
    if (whEvent || ["warehouse", "allocated", "dispatched"].includes(g.stage)) {
      milestones.push({
        key: "warehouse-received",
        label: "Received at distribution warehouse",
        date: day(whEvent?.at ?? pkg?.createdAt ?? when ?? new Date().toISOString()),
        department: "Logistics",
      });
    }

    // 9. Dispatch
    if (g.stage === "dispatched") {
      const sh = s.shipments.find(
        (x) => x.id === g.shipmentId || x.allocatedGarmentIds.includes(g.id),
      );
      const dispatchEvent = events.find((e) => e.label.toLowerCase().includes("dispatched"));
      const dispatchDate = dispatchEvent?.at ?? sh?.departedAt;
      if (dispatchDate) {
        milestones.push({
          key: "dispatched",
          label: "Dispatched to authorized retail network",
          date: day(dispatchDate),
          department: "Logistics",
        });
      }
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
  const issue = cut ? s.issues.find((i) => i.id === cut.issueId) : undefined;
  const events = s.garmentEvents.filter((e) => e.garmentId === g.id);

  const built = buildCanonicalPublicPayload(s, publicId);
  if (!built) return null;

  const milestones: PublicMilestone[] = [];

  // 1. Fabric lot milestone
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

  // 2. Material Issued milestone
  if (issue) {
    milestones.push({
      key: "material-issued",
      label: "Material issued to cutting",
      date: day(issue.at),
      department: "Raw Store",
      description:
        "Inspected fabric rolls cleared from storage and allocated to the cutting line for precision pattern layout.",
    });
  }

  // 3. Cutting milestone
  if (cut) {
    milestones.push({
      key: "garment-cut",
      label: "Cut from fabric lot",
      date: day(cut.at),
      department: "Production",
      description:
        "Individual garment panels precisely cut from fabric lot and paired with an individual tracking credential.",
    });
  }

  // 4. Seam Stitching (Production)
  const stitching = events.find((e) => e.label.toLowerCase().includes("stitching"));
  if (
    stitching ||
    ["finishing", "final-qc", "packing", "warehouse", "allocated", "dispatched"].includes(
      g.stage,
    )
  ) {
    milestones.push({
      key: "stitching-completed",
      label: "Seam stitching completed",
      date: day(stitching?.at ?? cut?.at ?? new Date().toISOString()),
      department: "Production",
      description:
        "Structural seams joined, sleeve panels set, and precision tailoring completed at the designated sewing line.",
    });
  }

  // 5. Assembly / Finishing (Production)
  // Only included if finished event exists or garment has moved past finishing stage.
  // Stage "finishing" means garment is actively in finishing, not yet assembled.
  const assembled = events.find(
    (e) => e.label === "Finishing completed" || e.label.toLowerCase().includes("finishing"),
  );
  if (
    assembled ||
    ["final-qc", "packing", "warehouse", "allocated", "dispatched"].includes(g.stage)
  ) {
    const stitchDate = milestones.find((m) => m.key === "stitching-completed")?.date;
    const rawDate = day(assembled?.at ?? stitchDate ?? cut?.at ?? new Date().toISOString());
    const finalDate = stitchDate && rawDate < stitchDate ? stitchDate : rawDate;
    milestones.push({
      key: "garment-assembled",
      label: "Garment assembled",
      date: finalDate,
      department: "Production",
      description:
        "Hardware attached, seam edges trimmed and neatened, and artisan steam pressing completed for final shape.",
    });
  }

  // 6. Quality milestone
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
        description:
          "Garment passed multi-point quality inspection, verifying seam integrity, dimensional tolerances, and finish.",
      });
    }

    // 7. Packaging milestone
    const pkg =
      s.packages.find((p) => p.garmentIds.includes(g.id)) ||
      (g.packageId ? s.packages.find((p) => p.id === g.packageId) : undefined);
    const packingEvent = events.find((e) => e.label.toLowerCase().includes("packed"));
    if (pkg || packingEvent || ["packing", "warehouse", "allocated", "dispatched"].includes(g.stage)) {
      milestones.push({
        key: "garment-packed",
        label: "Packaged into master carton",
        date: day(packingEvent?.at ?? pkg?.createdAt ?? when ?? new Date().toISOString()),
        department: "Logistics",
        description:
          "Quality-approved garment tagged with brand label, folded in protective wrap, and packed into master shipping carton.",
        details: pkg ? { cartonId: pkg.id } : undefined,
      });
    }

    // 8. Warehouse Receiving
    const whEvent = events.find(
      (e) => e.label.toLowerCase().includes("finished stock") || e.department === "warehouse",
    );
    if (whEvent || ["warehouse", "allocated", "dispatched"].includes(g.stage)) {
      milestones.push({
        key: "warehouse-received",
        label: "Received at distribution warehouse",
        date: day(whEvent?.at ?? pkg?.createdAt ?? when ?? new Date().toISOString()),
        department: "Logistics",
        description:
          "Master shipping carton scanned, verified on intake manifest, and safely cataloged in central warehouse inventory.",
      });
    }

    // 9. Dispatch milestone
    if (g.stage === "dispatched") {
      const sh = s.shipments.find(
        (x) => x.id === g.shipmentId || x.allocatedGarmentIds.includes(g.id),
      );
      const dispatchEvent = events.find((e) => e.label.toLowerCase().includes("dispatched"));
      const dispatchDate = dispatchEvent?.at ?? sh?.departedAt;
      if (dispatchDate) {
        milestones.push({
          key: "dispatched",
          label: "Dispatched to authorized retail network",
          date: day(dispatchDate),
          department: "Logistics",
          description:
            "Sealed commercial consignment departed our facility on scheduled transit to an authorized retail partner.",
        });
      }
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

  const pkg =
    s.packages.find((p) => p.garmentIds.includes(g.id)) ||
    (g.packageId ? s.packages.find((p) => p.id === g.packageId) : undefined);
  const sh = s.shipments.find((x) => x.id === g.shipmentId || x.allocatedGarmentIds.includes(g.id));
  const ledgerEntry = s.ledger.find((l) => l.subjectType === "garment" && l.subjectId === g.id);

  const materialInfo = lot
    ? {
      fabricType: lot.material,
      supplierName: "Certified Sustainable Partner",
      lotReference: lot.id,
      composition: "100% Certified Organic Cotton",
      receivedDate: day(lot.receivedAt),
    }
    : undefined;

  const qualityInfo = {
    disposition: (g.hold ? "held" : passedOk ? "released" : "in-review") as
      | "passed"
      | "released"
      | "held"
      | "in-review",
    inspectionLabel:
      passedOk ? "Passed Multi-Point Quality Assurance"
        : g.hold ? "Under Active Quality Evaluation"
          : "Quality Evaluation Scheduled",
    inspectedDate: day(new Date().toISOString()),
    certificationNote:
      passedOk ?
        "Verified compliant with physical tolerances, seam strength, and finishing standards"
        : undefined,
  };

  const logisticsInfo = {
    cartonCode: pkg?.id,
    packageType: pkg ? "Master Shipping Carton" : undefined,
    packagedDate: pkg?.createdAt ? day(pkg.createdAt) : undefined,
    warehouseDate: ["warehouse", "allocated", "dispatched"].includes(g.stage) ? day(pkg?.createdAt ?? new Date().toISOString()) : undefined,
    dispatchedDate: sh?.departedAt ? day(sh.departedAt) : undefined,
  };

  const blockchain = ledgerEntry
    ? {
      networkName: "hardhat-local",
      contractAddress: "0x5fbdb2315678afecb367f032d93f642f64180aa3",
      transactionHash: "0xd663c4404eecbf240cc84cb92831637105770c5f48b29dce3e38e713e626ecb5",
      blockNumber: 6,
      confirmedAt: day(ledgerEntry.createdAt ?? new Date().toISOString()),
    }
    : undefined;

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
    materialInfo,
    qualityInfo,
    logisticsInfo,
    blockchain,
  };
}

function evidenceFor(s: DemoState, garmentId: string): PublicEvidenceState {
  const g = s.garments.find((x) => x.id === garmentId);
  if (!g) return "unavailable";

  const c = s.ledger.find((l) => l.subjectType === "garment" && l.subjectId === garmentId);
  if (c?.status === "confirmed") return "sample-confirmed";
  if (c?.status === "failed") return "failed";

  // Garment is actively in production; ledger commitment is scheduled upon retail dispatch
  if (g.stage !== "dispatched" || c?.status === "pending" || c?.status === "submitted" || !c) {
    return "pending";
  }

  return "unavailable";
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
