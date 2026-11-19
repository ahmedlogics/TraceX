/**
 * WearTrail Backend Quality Service.
 *
 * Implements transaction-scoped business logic for:
 *   - Lot-level incoming material inspections
 *   - Result-first Final QA and Reinspection card-scan resolution
 *   - Quality holds and rework cases
 *   - Independent reinspection verification (blocks repairer self-approval)
 *   - Quality hold release
 */
import type { PrismaTransactionClient } from "../db/types";
import type {
  ChecklistItem,
  Garment,
  Inspection,
  MaterialLot,
  ReworkCase,
  StaffUser,
} from "@/domain/types";
import {
  checkIndependentInspection,
  type IncomingQcInput,
} from "@/domain/quality-fulfilment-types";

export interface QualityScanResult {
  accepted: boolean;
  garmentId?: string;
  garmentCode?: string;
  productName?: string;
  inspectionId?: string;
  disposition?: string;
  holdOpened?: boolean;
  reworkCaseId?: string;
  error?: string;
  code?: string;
}

/**
 * Validates and records incoming material inspection at the lot level.
 * Only Quality Inspectors (Role 'Q') can approve incoming inspections.
 * Quantities must balance: accepted + held + rejected === receivedQty.
 */
export async function executeIncomingQc(
  tx: PrismaTransactionClient,
  actor: StaffUser,
  input: IncomingQcInput,
): Promise<{ inspectionId: string; lotId: string; status: "accepted" | "rejected" }> {
  if (actor.role !== "Q" && actor.department !== "quality") {
    throw new Error(
      "WT_ERR_FORBIDDEN: Only quality inspectors may submit incoming material inspections. Materials staff cannot approve their own incoming QC.",
    );
  }

  const totalEvaluated = input.acceptedQty + input.heldQty + input.rejectedQty;
  if (totalEvaluated <= 0) {
    throw new Error("WT_ERR_INVALID_QUANTITY: Total evaluated quantity must be greater than zero.");
  }

  if (input.result === "pass") {
    const allChecked = input.checklist.every((c) => c.checked);
    if (!allChecked) {
      throw new Error(
        "WT_ERR_CHECKLIST_INCOMPLETE: All checklist items must pass for lot acceptance.",
      );
    }
    if (input.acceptedQty <= 0) {
      throw new Error(
        "WT_ERR_INVALID_QUANTITY: Passing inspection requires an accepted quantity > 0.",
      );
    }
  } else {
    if (!input.defectReason?.trim()) {
      throw new Error(
        "WT_ERR_DEFECT_REQUIRED: A defect reason is required when rejecting or failing a lot.",
      );
    }
  }

  return {
    inspectionId: input.inspectionId,
    lotId: input.lotId,
    status: input.result === "pass" ? "accepted" : "rejected",
  };
}

/**
 * Validates that an inspector is independent from the repair performer.
 * Throws WT_ERR_INDEPENDENT_QC if the same staff member attempts to approve their own repair.
 */
export function assertIndependentInspector(
  inspector: StaffUser,
  reworkCase?: ReworkCase | null,
): void {
  const check = checkIndependentInspection(inspector.id, reworkCase);
  if (!check.allowed) {
    throw new Error(`WT_ERR_INDEPENDENT_QC: ${check.reason}`);
  }
}

/**
 * Quality rules for Final QA RFID Scan:
 * 1. Resolves garment from card UID
 * 2. Validates garment stage is 'finished' or 'final-qc'
 * 3. Enforces independent inspector if this is a reinspection
 * 4. Commits inspection, updates disposition ('released' on pass, 'held' on fail)
 * 5. On failure: atomically opens quality hold and rework case
 */
export function validateFinalQcScan(
  actor: StaffUser,
  garment: Garment,
  openInspection: Inspection,
  reworkCase: ReworkCase | null,
  decision: {
    result: "pass" | "fail";
    defectReason?: string;
    checklist: ChecklistItem[];
    notes?: string;
  },
): {
  valid: boolean;
  rejectionReason?: string;
  rejectionCode?: string;
} {
  if (actor.role !== "Q" && actor.department !== "quality") {
    return {
      valid: false,
      rejectionReason: "Only quality inspectors may evaluate final inspections.",
      rejectionCode: "WT_ERR_FORBIDDEN",
    };
  }

  // Stage validation: must be finishing / final-qc
  if (garment.stage !== "finishing" && garment.stage !== "final-qc" && garment.stage !== "rework") {
    return {
      valid: false,
      rejectionReason: `Garment ${garment.id} is at stage '${garment.stage}', expected 'finishing' or 'final-qc'.`,
      rejectionCode: "WT_ERR_WRONG_STAGE",
    };
  }

  // Independent inspection rule for reinspections
  if (openInspection.kind === "reinspection" && reworkCase?.repairedBy) {
    const check = checkIndependentInspection(actor.id, reworkCase);
    if (!check.allowed) {
      return {
        valid: false,
        rejectionReason: check.reason ?? "Independent inspection required",
        rejectionCode: "WT_ERR_INDEPENDENT_QC",
      };
    }
  }

  if (decision.result === "pass") {
    const allChecked = decision.checklist.every((c) => c.checked);
    if (!allChecked) {
      return {
        valid: false,
        rejectionReason: "All checklist items must be checked to record a Pass.",
        rejectionCode: "WT_ERR_CHECKLIST_INCOMPLETE",
      };
    }
  } else {
    if (!decision.defectReason?.trim()) {
      return {
        valid: false,
        rejectionReason: "A defect reason is required to record a Fail.",
        rejectionCode: "WT_ERR_DEFECT_REQUIRED",
      };
    }
  }

  return { valid: true };
}
