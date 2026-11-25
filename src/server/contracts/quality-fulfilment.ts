/**
 * WearTrail Quality & Fulfilment Server Contracts.
 *
 * Defines strongly-typed DTOs, service interfaces, and payload formats for:
 *   - Incoming fabric lot quality inspection and stock acceptance
 *   - Result-first Final QA and reinspection card evaluation
 *   - Quality holds, rework cases, and repair recording
 *   - Independent inspector enforcement
 *   - Package assembly, warehouse binning, and shipment departure gates
 */
import type { PrismaTransactionClient } from "../db/types";
import type { ActorContext } from "./actor";
import type { ChecklistItem } from "@/domain/types";

// ---------------------------------------------------------------- Incoming QC

export interface IncomingQcPayload {
  lotId: string;
  checklistVersionId?: string | undefined;
  acceptedQty: number;
  heldQty: number;
  rejectedQty: number;
  answers?: Record<string, boolean> | undefined;
  checklist?: ChecklistItem[] | undefined;
  notes?: string | undefined;
  result: "pass" | "fail";
  defectReason?: string | undefined;
  inspectionId?: string | undefined;
}

export interface IncomingQcResult {
  inspectionId: string;
  inspectionCode: string;
  lotId: string;
  lotCode: string;
  status: "accepted" | "rejected";
  acceptedQty: number;
  heldQty: number;
  rejectedQty: number;
  availableAcceptedQty: number;
}

// ---------------------------------------------------------------- Final QA & Context

export interface PrepareQcContextPayload {
  stationCode: string;
  readerSessionId?: string | undefined;
  scope: "final" | "reinspection";
  outcome: "pass" | "fail";
  checklistVersionId?: string | undefined;
  answers?: Record<string, boolean> | undefined;
  checklist?: ChecklistItem[] | undefined;
  defectReason?: string | undefined;
  notes?: string | undefined;
}

export interface FinalQcScanPayload {
  tagUid: string;
  stationCode?: string | undefined;
  actionContextId?: string | undefined;
}

export interface FinalQcScanResult {
  accepted: boolean;
  outcome: "pass" | "fail";
  garmentId: string;
  garmentCode: string;
  inspectionId: string;
  inspectionCode: string;
  qualityDisposition: "released" | "held";
  holdOpened: boolean;
  holdId?: string | undefined;
  reworkCaseId?: string | undefined;
  reworkCaseCode?: string | undefined;
  rejectionReason?: string | undefined;
  rejectionCode?: string | undefined;
}

// ---------------------------------------------------------------- Rework & Holds

export interface AssignReworkPayload {
  reworkCaseId: string;
  departmentCode: string;
}

export interface RecordRepairPayload {
  reworkCaseId: string;
  workSummary: string;
}

export interface ReleaseHoldPayload {
  holdId: string;
  releaseReason: string;
}

// ---------------------------------------------------------------- Fulfilment & Logistics

export interface CreatePackagePayload {
  code?: string | undefined;
  rfidUid?: string | undefined;
}

export interface PackGarmentPayload {
  garmentId: string;
  packageId: string;
}

export interface WarehouseReceivePayload {
  garmentId: string;
  binId: string;
}

export interface ShipmentGarmentVerifyPayload {
  shipmentId: string;
  garmentId: string;
}

export interface ShipmentDepartureResult {
  shipmentId: string;
  shipmentCode: string;
  status: "dispatched";
  departedAt: string;
  dispatchedGarmentCount: number;
}

// ---------------------------------------------------------------- Eligibility DTOs

export interface PersistedEligibilityCheck {
  code: string;
  label: string;
  ok: boolean;
  detail?: string | undefined;
  blocking: boolean;
}

export interface PersistedEligibilityResult {
  garmentId: string;
  garmentCode: string;
  eligible: boolean;
  stage: string;
  qualityDisposition: string;
  hasActiveHold: boolean;
  activeHoldReasons: string[];
  checks: PersistedEligibilityCheck[];
  blockingReasons: string[];
}
