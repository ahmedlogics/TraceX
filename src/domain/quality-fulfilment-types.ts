/**
 * WearTrail Quality & Fulfilment Domain Types and Contracts.
 *
 * Implements strict domain contracts for:
 *   - Incoming & Final Quality Control (lot & garment level)
 *   - Quality holds, rework cases, and repair records
 *   - Independent reinspection verification (performer cannot approve own repair)
 *   - Package assembly, warehouse binning, and shipment manifest verification
 *   - Authoritative fulfilment eligibility gates
 */
import type {
  ChecklistItem,
  Department,
  Garment,
  Inspection,
  InspectionKind,
  InspectionStatus,
  Package,
  QualityDisposition,
  ReworkCase,
  Shipment,
  StaffUser,
} from "./types";

// ---------------------------------------------------------------- Incoming QC DTOs

export interface IncomingQcInput {
  lotId: string;
  inspectionId: string;
  acceptedQty: number;
  heldQty: number;
  rejectedQty: number;
  checklist: ChecklistItem[];
  notes: string;
  result: "pass" | "fail";
  defectReason?: string | undefined;
}

// ---------------------------------------------------------------- Checklist Configuration

export interface ChecklistVersion {
  id: string;
  kind: InspectionKind;
  version: number;
  title: string;
  department: Department;
  items: ChecklistItem[];
  active: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------- Fulfilment Eligibility

export interface FulfilmentEligibilityCheck {
  code: string;
  label: string;
  ok: boolean;
  detail?: string | undefined;
  blocking: boolean;
}

export interface FulfilmentEligibilityResult {
  garmentId: string;
  eligible: boolean;
  disposition: QualityDisposition;
  hasActiveHold: boolean;
  checks: FulfilmentEligibilityCheck[];
  blockingReasons: string[];
}

/**
 * Authoritative, reusable fulfilment eligibility check.
 * Evaluates whether a garment may proceed to Packing, Warehouse, or Dispatch.
 */
export function checkFulfilmentEligibility(
  garment: Garment,
  inspections: Inspection[] = [],
  operation: "packing" | "warehouse" | "dispatch",
  context?: {
    packageId?: string;
    shipment?: Shipment;
  },
): FulfilmentEligibilityResult {
  const checks: FulfilmentEligibilityCheck[] = [];
  const blockingReasons: string[] = [];

  // Check 1: Active Quality Hold
  const hasHold = !!garment.hold;
  if (hasHold) {
    const reason = `Garment has an active quality hold: "${garment.hold?.reason ?? "Unspecified hold"}"`;
    checks.push({
      code: "NO_ACTIVE_HOLD",
      label: "Zero active quality holds",
      ok: false,
      detail: reason,
      blocking: true,
    });
    blockingReasons.push(reason);
  } else {
    checks.push({
      code: "NO_ACTIVE_HOLD",
      label: "Zero active quality holds",
      ok: true,
      blocking: true,
    });
  }

  // Check 2: Quality Disposition
  const isReleased = garment.disposition === "released" || garment.disposition === "passed";
  if (!isReleased) {
    const reason = `Quality disposition is '${garment.disposition}', expected 'passed' or 'released'`;
    checks.push({
      code: "QUALITY_RELEASED",
      label: "Quality cleared and released",
      ok: false,
      detail: reason,
      blocking: true,
    });
    blockingReasons.push(reason);
  } else {
    checks.push({
      code: "QUALITY_RELEASED",
      label: "Quality cleared and released",
      ok: true,
      blocking: true,
    });
  }

  // Check 3: Current Latest Inspection Status
  const garmentInspections = inspections
    .filter((i) => i.subjectType === "garment" && i.subjectId === garment.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latestInsp = garmentInspections[0];

  if (latestInsp) {
    if (latestInsp.status === "failed") {
      const reason = `Latest inspection ${latestInsp.id} failed (${latestInsp.defectReason ?? "defect"})`;
      checks.push({
        code: "LATEST_INSP_PASSED",
        label: "Latest quality inspection passed",
        ok: false,
        detail: reason,
        blocking: true,
      });
      blockingReasons.push(reason);
    } else if (latestInsp.status === "open") {
      const reason = `Inspection ${latestInsp.id} is still pending completion`;
      checks.push({
        code: "NO_PENDING_INSPECTION",
        label: "No open pending inspections",
        ok: false,
        detail: reason,
        blocking: true,
      });
      blockingReasons.push(reason);
    } else {
      checks.push({
        code: "LATEST_INSP_PASSED",
        label: "Latest quality inspection passed",
        ok: true,
        blocking: true,
      });
    }
  }

  // Operation-specific stage checks
  if (operation === "packing") {
    const stageOk = garment.stage === "packing";
    if (!stageOk) {
      const reason = `Physical stage is '${garment.stage}', expected 'packing'`;
      checks.push({
        code: "STAGE_VALID_FOR_PACKING",
        label: "Garment arrived at packing stage",
        ok: false,
        detail: reason,
        blocking: true,
      });
      blockingReasons.push(reason);
    } else {
      checks.push({
        code: "STAGE_VALID_FOR_PACKING",
        label: "Garment arrived at packing stage",
        ok: true,
        blocking: true,
      });
    }

    if (garment.packageId) {
      const reason = `Already packed in package '${garment.packageId}'`;
      checks.push({
        code: "NOT_ALREADY_PACKED",
        label: "Not already assigned to a package",
        ok: false,
        detail: reason,
        blocking: true,
      });
      blockingReasons.push(reason);
    }
  } else if (operation === "warehouse") {
    const stageOk = garment.stage === "packing" && !!garment.packageId;
    if (!stageOk) {
      const reason = `Garment must be packed in a package before warehouse receipt (stage: ${garment.stage})`;
      checks.push({
        code: "STAGE_VALID_FOR_WAREHOUSE",
        label: "Packed and ready for warehouse receipt",
        ok: false,
        detail: reason,
        blocking: true,
      });
      blockingReasons.push(reason);
    } else {
      checks.push({
        code: "STAGE_VALID_FOR_WAREHOUSE",
        label: "Packed and ready for warehouse receipt",
        ok: true,
        blocking: true,
      });
    }
  } else if (operation === "dispatch") {
    const stageOk = garment.stage === "allocated" || garment.stage === "warehouse";
    if (!stageOk) {
      const reason = `Garment stage is '${garment.stage}', must be 'warehouse' or 'allocated' for dispatch`;
      checks.push({
        code: "STAGE_VALID_FOR_DISPATCH",
        label: "Warehoused and ready for dispatch manifest",
        ok: false,
        detail: reason,
        blocking: true,
      });
      blockingReasons.push(reason);
    } else {
      checks.push({
        code: "STAGE_VALID_FOR_DISPATCH",
        label: "Warehoused and ready for dispatch manifest",
        ok: true,
        blocking: true,
      });
    }

    if (context?.shipment) {
      const onManifest = context.shipment.garmentIds.includes(garment.id);
      if (!onManifest) {
        const reason = `Garment is not on manifest for shipment '${context.shipment.id}'`;
        checks.push({
          code: "ON_SHIPMENT_MANIFEST",
          label: "Included on shipment manifest",
          ok: false,
          detail: reason,
          blocking: true,
        });
        blockingReasons.push(reason);
      } else {
        checks.push({
          code: "ON_SHIPMENT_MANIFEST",
          label: "Included on shipment manifest",
          ok: true,
          blocking: true,
        });
      }
    }
  }

  const eligible = blockingReasons.length === 0;

  return {
    garmentId: garment.id,
    eligible,
    disposition: garment.disposition,
    hasActiveHold: hasHold,
    checks,
    blockingReasons,
  };
}

// ---------------------------------------------------------------- Independent Reinspection Guard

export interface IndependentInspectionCheck {
  allowed: boolean;
  reason?: string | undefined;
}

/**
 * Validates that an inspector evaluating a reinspection or releasing a hold
 * is independent from the repair performer.
 * Rule: The person who completed the repair CANNOT approve the repair!
 */
export function checkIndependentInspection(
  inspectorId: string,
  reworkCase?: ReworkCase | null,
): IndependentInspectionCheck {
  if (!reworkCase) {
    return { allowed: true };
  }

  if (reworkCase.repairedBy && reworkCase.repairedBy === inspectorId) {
    return {
      allowed: false,
      reason:
        "Independent QC Violation: Inspector cannot approve their own repair. Another authorized quality inspector must perform the reinspection.",
    };
  }

  return { allowed: true };
}
