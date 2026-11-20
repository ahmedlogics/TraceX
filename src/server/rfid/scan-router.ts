import type { PrismaClient } from "@prisma/client";
import { getPrismaClient, runInTransaction } from "../db/client";
import type { PrismaTransactionClient } from "../db/types";
import { ApiError } from "../middleware/responses";
import {
  normalizeTagUid,
  type DomainScanContext,
  type DomainScanHandler,
  type IScanRoutingService,
  type PreparedScanSubject,
  type RfidStationCode,
  type ScanOutcomeResult,
  type VersionedScanEnvelope,
} from "../contracts/rfid";
import { authenticateDevice } from "./device-auth";
import { resolveReaderSession } from "./session-resolver";
import { validateActionContext } from "./context-validator";
import {
  checkExistingScan,
  computeRequestFingerprint,
  existingScanToOutcome,
} from "./deduplication";

/**
 * Authoritative WearTrail Scan Router & Transaction Orchestrator.
 *
 * Implements:
 * - Device credential authentication
 * - Hardware reader-to-station mapping resolution
 * - Operator session & ActorContext resolution
 * - Action context validation & single-use consumption
 * - Database-backed idempotency & conflict detection
 * - Atomic two-phase transaction execution calling domain handlers
 * - Non-destructive rejection recording on failure
 */
export class ScanRoutingService implements IScanRoutingService {
  private readonly handlers = new Map<RfidStationCode, DomainScanHandler>();

  /**
   * Registers a domain handler for a specific logical station code.
   */
  public registerHandler(handler: DomainScanHandler): void {
    this.handlers.set(handler.stationCode, handler);
  }

  /**
   * Clears all registered handlers (useful for isolated tests).
   */
  public clearHandlers(): void {
    this.handlers.clear();
  }

  /**
   * Retrieves the domain handler registered for a station code.
   */
  public getHandler(stationCode: RfidStationCode): DomainScanHandler | undefined {
    return this.handlers.get(stationCode);
  }

  /**
   * Transactional routing invocation (used when caller already has a transaction and context).
   */
  public async routeScan(
    envelope: VersionedScanEnvelope,
    tx: PrismaTransactionClient,
    context?: DomainScanContext,
  ): Promise<ScanOutcomeResult> {
    if (!context) {
      throw ApiError.internal(
        "DomainScanContext is required for direct routeScan execution.",
        undefined,
        "WT_ERR_SCAN_ROUTING",
      );
    }

    const handler = this.getHandler(context.session.stationCode);
    if (!handler) {
      throw ApiError.notImplemented(
        `Domain handler for station '${context.session.stationCode}' is not implemented.`,
        { stationCode: context.session.stationCode },
        "WT_ERR_HANDLER_UNAVAILABLE",
      );
    }

    const subject = await handler.prepare(envelope, tx, context);
    return handler.process(envelope, subject, tx, context);
  }

  /**
   * Complete end-to-end scan dispatch pipeline.
   * Ingests, authenticates, deduplicates, and commits the scan within an atomic transaction.
   */
  public async dispatchScan(
    envelope: VersionedScanEnvelope,
    headers: Record<string, string | string[] | undefined>,
    dbClient?: PrismaClient | PrismaTransactionClient,
  ): Promise<ScanOutcomeResult> {
    const db = dbClient ?? getPrismaClient();

    // 1. Authenticate hardware device credential
    await authenticateDevice(headers, envelope.deviceId, db);

    // 2. Compute canonical 32-byte request fingerprint
    const requestFingerprint = computeRequestFingerprint(envelope);

    // 3. Database-backed deduplication and replay conflict check
    const dedup = await checkExistingScan(envelope, requestFingerprint, db);
    if (dedup.isDuplicate) {
      if (dedup.isConflict) {
        throw ApiError.conflict(
          `Conflicting scan identity reuse: scanId '${envelope.scanId}' (or bootId '${envelope.bootId}' / sequence ${envelope.sequence}) has already been recorded with different payload parameters.`,
          {
            deviceId: envelope.deviceId,
            scanId: envelope.scanId,
            sequence: envelope.sequence,
          },
          "WT_ERR_SCAN_CONFLICT",
        );
      }
      // Identical retry: return original recorded outcome idempotently
      return existingScanToOutcome(dedup.existingScan!);
    }

    // 4. Resolve active reader mapping, active operator session, and ActorContext
    const { stationCode, session, actor } = await resolveReaderSession(
      envelope.deviceId,
      envelope.mappingVersion,
      envelope.readerIndex,
      db,
    );

    // 5. Validate action context (if reported or required by station)
    let contextIdToValidate = envelope.actionContextId ?? null;

    if (!contextIdToValidate && envelope.timestamp && typeof (db as any).rfid_action_contexts?.findFirst === "function") {
      const scanTime = new Date(envelope.timestamp);

      // Scoped guard: Auto-resolution is only permitted if the scan has a valid synchronized timestamp.
      // Unsynchronized scans or scans without timestamps cannot safely auto-resolve server-side contexts.
      if (!isNaN(scanTime.getTime())) {
        // Enforce strict causality: A scan cannot consume a context created or acknowledged after the scan occurred.
        // Context must already have been created at or before scanTime.
        const liveContext = await (db as any).rfid_action_contexts.findFirst({
          where: {
            reader_session_id: session.id,
            closed_at: null,
            expires_at: { gt: new Date() },
            created_at: { lte: scanTime },
            status: { in: ["armed", "awaiting_ack"] },
          },
          orderBy: { created_at: "desc" },
        });

        if (liveContext) {
          // If acknowledged_at is recorded, scan must also have occurred at or after acknowledgement
          const ackTime = liveContext.acknowledged_at ? new Date(liveContext.acknowledged_at) : null;
          const isAckValid = !ackTime || isNaN(ackTime.getTime()) || ackTime <= scanTime;

          if (isAckValid) {
            contextIdToValidate = liveContext.id;
          }
        }
      }
    }

    const actionContext = await validateActionContext(
      contextIdToValidate,
      session.id,
      stationCode,
      db,
    );

    const scanContext: DomainScanContext = {
      session,
      actionContext,
      actor,
    };

    const effectiveEnvelope: VersionedScanEnvelope = actionContext?.id
      ? { ...envelope, actionContextId: actionContext.id }
      : envelope;

    // 6. Look up registered domain handler
    const handler = this.getHandler(stationCode);
    if (!handler) {
      // Record rejected scan in rfid_scans so audit/trace trail is preserved
      await this.recordRejectedScan(
        envelope,
        requestFingerprint,
        session.id,
        stationCode,
        "WT_ERR_HANDLER_UNAVAILABLE",
        `Domain handler for station '${stationCode}' is not implemented or unavailable.`,
        db,
      );

      throw ApiError.notImplemented(
        `Domain handler for station '${stationCode}' is not implemented or unavailable.`,
        { stationCode },
        "WT_ERR_HANDLER_UNAVAILABLE",
      );
    }

    // 7. Atomic transaction orchestration
    const executeTx =
      dbClient && typeof (dbClient as any).$transaction === "function"
        ? (fn: (tx: PrismaTransactionClient) => Promise<any>) =>
            (dbClient as any).$transaction(fn, { maxWait: 15000, timeout: 30000 })
        : (fn: (tx: PrismaTransactionClient) => Promise<any>) => runInTransaction(fn);

    try {
      return await executeTx(async (tx) => {
        // Phase 1: Prepare subject (creates garment & bindings for Cutting, or resolves existing for QA)
        const subject: PreparedScanSubject = await handler.prepare(
          effectiveEnvelope,
          tx,
          scanContext,
        );

        // Resolve tag_binding_id to satisfy PostgreSQL CHECK constraint
        let tagBindingId = subject.tagBindingId;
        if (!tagBindingId) {
          const binding = await tx.rfid_tag_bindings.findFirst({
            where: {
              tag_identifier: normalizeTagUid(envelope.tagUid),
              unbound_at: null,
            },
          });
          tagBindingId = binding?.id;
        }

        if (!tagBindingId) {
          throw ApiError.badRequest(
            `Tag UID '${envelope.tagUid}' is not bound to any active subject in rfid_tag_bindings.`,
            { tagUid: envelope.tagUid },
            "WT_ERR_TAG_NOT_BOUND",
          );
        }

        // Insert accepted scan record
        const scanRecord = await tx.rfid_scans.create({
          data: {
            device_id: envelope.deviceId,
            scan_id: envelope.scanId,
            boot_id: envelope.bootId,
            sequence: BigInt(envelope.sequence),
            reader_index: envelope.readerIndex,
            reported_mapping_version: envelope.mappingVersion,
            tag_uid: normalizeTagUid(envelope.tagUid),
            reported_context_id: effectiveEnvelope.actionContextId ?? null,
            resolved_context_id: actionContext?.id ?? null,
            reader_session_id: session.id,
            station_code: stationCode,
            tag_binding_id: tagBindingId,
            garment_id: subject.kind === "garment" ? subject.subjectId : null,
            material_lot_id: subject.kind === "material_lot" ? subject.subjectId : null,
            device_uptime_ms:
              envelope.deviceUptimeMs !== null && envelope.deviceUptimeMs !== undefined
                ? BigInt(envelope.deviceUptimeMs)
                : null,
            request_sha256: new Uint8Array(requestFingerprint),
            outcome: "accepted",
            outcome_code: "success",
            outcome_message: "Scan accepted and processed",
          },
        });

        // Phase 2: Execute station business mutations
        const effectiveScanContext: DomainScanContext = {
          ...scanContext,
          scanRecordId: scanRecord.id,
        };
        const result = await handler.process(effectiveEnvelope, subject, tx, effectiveScanContext);

        // Consume one-use action context if used
        if (actionContext) {
          await tx.rfid_action_contexts.update({
            where: { id: actionContext.id },
            data: {
              status: "consumed",
              closed_at: new Date(),
              close_reason: `consumed_by_scan_${scanRecord.id}`,
            },
          });
        }

        return result;
      });
    } catch (err) {
      // Record rejection outside rolled-back transaction
      const errorCode = err instanceof ApiError ? err.code : "WT_ERR_DOMAIN_HANDLER_FAILED";
      const errorMessage = err instanceof Error ? err.message : String(err);

      await this.recordRejectedScan(
        envelope,
        requestFingerprint,
        session.id,
        stationCode,
        errorCode,
        errorMessage,
        db,
      );

      throw err;
    }
  }

  /**
   * Safely records a rejected scan in rfid_scans without failing the outer request.
   */
  private async recordRejectedScan(
    envelope: VersionedScanEnvelope,
    requestFingerprint: Buffer,
    readerSessionId: string | null,
    stationCode: RfidStationCode | null,
    outcomeCode: string,
    outcomeMessage: string,
    db: PrismaClient | PrismaTransactionClient,
  ): Promise<void> {
    try {
      await db.rfid_scans.create({
        data: {
          device_id: envelope.deviceId,
          scan_id: envelope.scanId,
          boot_id: envelope.bootId,
          sequence: BigInt(envelope.sequence),
          reader_index: envelope.readerIndex,
          reported_mapping_version: envelope.mappingVersion,
          tag_uid: normalizeTagUid(envelope.tagUid),
          reported_context_id: envelope.actionContextId ?? null,
          resolved_context_id: null,
          reader_session_id: readerSessionId,
          station_code: stationCode,
          device_uptime_ms:
            envelope.deviceUptimeMs !== null && envelope.deviceUptimeMs !== undefined
              ? BigInt(envelope.deviceUptimeMs)
              : null,
          request_sha256: new Uint8Array(requestFingerprint),
          outcome: "rejected",
          outcome_code: outcomeCode.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32),
          outcome_message: outcomeMessage.slice(0, 500),
        },
      });
    } catch {
      // Non-fatal if logging fails or already recorded concurrently
    }
  }
}

/**
 * Singleton instance of the Scan Routing Service.
 */
export const scanRoutingService = new ScanRoutingService();
