import type { PrismaClient } from "@prisma/client";
import type { PrismaTransactionClient } from "../db/types";
import { ApiError } from "../middleware/responses";
import type {
  ActionContextContract,
  ActionContextStatus,
  RfidStationCode,
} from "../contracts/rfid";

/**
 * Checks whether a station strictly requires an explicit action context before a card scan can be processed.
 * Stations like final_qc (decision first, card second) and cutting (source selection first) always require it.
 */
export async function stationRequiresContext(
  stationCode: RfidStationCode,
  db: PrismaClient | PrismaTransactionClient,
): Promise<boolean> {
  if (stationCode === "final_qc") {
    return true;
  }

  const station = await db.rfid_stations.findUnique({
    where: { code: stationCode },
  });

  return Boolean(station?.requires_explicit_context);
}

/**
 * Validates an action context attached to an incoming scan envelope.
 * Enforces:
 * - Ownership: Context must belong to the active reader session.
 * - Expiry: Context must not have expired.
 * - Single-use: Context must not be already consumed or closed.
 * - Not cancelled: Context must not be in cancelled status.
 * - Acknowledgement: If context status is awaiting_ack, must have been acknowledged.
 * - Mandatory context rule: If station requires an action context, envelope must supply a valid one.
 */
export async function validateActionContext(
  reportedContextId: string | null | undefined,
  readerSessionId: string,
  stationCode: RfidStationCode,
  db: PrismaClient | PrismaTransactionClient,
): Promise<ActionContextContract | null> {
  const isRequired = await stationRequiresContext(stationCode, db);

  if (!reportedContextId) {
    if (isRequired) {
      throw ApiError.badRequest(
        `Station '${stationCode}' requires an explicit action context before scanning (decision-first / source-first workflow). No context ID was reported.`,
        { stationCode },
        "WT_ERR_CONTEXT_REQUIRED",
      );
    }
    return null;
  }

  const contextRecord = await db.rfid_action_contexts.findUnique({
    where: { id: reportedContextId },
  });

  if (!contextRecord) {
    throw ApiError.badRequest(
      `Reported action context '${reportedContextId}' does not exist.`,
      { reportedContextId },
      "WT_ERR_CONTEXT_NOT_FOUND",
    );
  }

  // Verify ownership: context must belong to the exact active reader session
  if (contextRecord.reader_session_id !== readerSessionId) {
    throw ApiError.forbidden(
      `Action context '${reportedContextId}' belongs to reader session '${contextRecord.reader_session_id}', not active session '${readerSessionId}'.`,
      {
        reportedContextId,
        contextSessionId: contextRecord.reader_session_id,
        activeSessionId: readerSessionId,
      },
      "WT_ERR_CONTEXT_SESSION_MISMATCH",
    );
  }

  // Verify not already consumed or closed
  if (contextRecord.closed_at !== null || contextRecord.status === "consumed") {
    throw ApiError.badRequest(
      `Action context '${reportedContextId}' has already been consumed or closed. One-use constraint violated.`,
      {
        reportedContextId,
        status: contextRecord.status,
        closedAt: contextRecord.closed_at,
      },
      "WT_ERR_CONTEXT_ALREADY_CONSUMED",
    );
  }

  // Verify not expired
  if (contextRecord.expires_at <= new Date() || contextRecord.status === "expired") {
    throw ApiError.badRequest(
      `Action context '${reportedContextId}' expired at ${contextRecord.expires_at.toISOString()}.`,
      {
        reportedContextId,
        expiresAt: contextRecord.expires_at,
      },
      "WT_ERR_CONTEXT_EXPIRED",
    );
  }

  // Verify not cancelled
  if (contextRecord.status === "cancelled") {
    throw ApiError.badRequest(
      `Action context '${reportedContextId}' was cancelled and cannot be used for scan execution.`,
      { reportedContextId },
      "WT_ERR_CONTEXT_CANCELLED",
    );
  }

  // Map database context into typed ActionContextContract
  const contract: ActionContextContract = {
    id: contextRecord.id,
    readerSessionId: contextRecord.reader_session_id,
    actionCode: contextRecord.action_code,
    status: contextRecord.status as ActionContextStatus,
    createdAt: contextRecord.created_at,
    expiresAt: contextRecord.expires_at,
    acknowledgedAt: contextRecord.acknowledged_at,
    closedAt: contextRecord.closed_at,
    payload: {
      cuttingJobId: contextRecord.cutting_job_id,
      cuttingInputId: contextRecord.cutting_input_id,
      sourceSelectionId: contextRecord.source_selection_id,
      productionOrderId: contextRecord.production_order_id,
      packageId: contextRecord.package_id,
      shipmentId: contextRecord.shipment_id,
      warehouseBinId: contextRecord.warehouse_bin_id,
      quantity: contextRecord.quantity ? Number(contextRecord.quantity) : undefined,
      qcScope: contextRecord.qc_scope,
      qcOutcome: contextRecord.qc_outcome,
      checklistVersionId: contextRecord.checklist_version_id,
      answers: contextRecord.answers as Record<string, unknown>,
      defectReason: contextRecord.defect_reason,
      notes: contextRecord.notes,
    },
  };

  return contract;
}
