import crypto from "node:crypto";
import type { PrismaTransactionClient } from "../db/types";
import type {
  DomainScanContext,
  DomainScanHandler,
  PreparedScanSubject,
  RfidStationCode,
  ScanOutcomeResult,
  VersionedScanEnvelope,
} from "../contracts/rfid";
import { normalizeTagUid } from "../contracts/rfid";
import { ApiError } from "../middleware/responses";
import { scanRoutingService, ScanRoutingService } from "./scan-router";
import { createInternalCommitment } from "../ledger/commitment-service";
import {
  ensureStaffUserRecord,
  getOrCreateChecklistVersion,
} from "../quality/quality-service";
import {
  fabricReceivingScanHandler,
  fabricIssueScanHandler,
  cuttingScanHandler,
  stitchingScanHandler,
  finishingScanHandler,
} from "./domain-handlers";
import {
  getPersistedFulfilmentEligibility,
  executeWarehouseCartonIntake,
} from "../fulfilment/fulfilment-service";
import { publishPublicGarmentPayload } from "../public/public-service";

function isValidUuid(id?: string): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Station 6: Final QA Scan Handler.
 * Result-First, Card-Second Quality Evaluation.
 *
 * Phase 1 (`prepare`):
 *   - Resolves garment card binding.
 *   - Verifies garment stage is 'finished'.
 *   - Resolves armed QC action context with selected outcome (pass/fail).
 *   - Enforces independent inspector rule on reinspections (technician cannot approve own repair).
 *
 * Phase 2 (`process`):
 *   - Creates immutable inspection record.
 *   - On Pass: updates garment quality_disposition to 'released', increments revision, resolves rework cases.
 *   - On Fail: updates garment quality_disposition to 'held', opens garment_hold, and creates rework_case.
 *   - Consumes action context, logs trace_events, and emits internal commitment (sha256_nonce_v1).
 */
export class FinalQcScanHandler implements DomainScanHandler<ScanOutcomeResult> {
  readonly stationCode: RfidStationCode = "final_qc";

  async prepare(
    envelope: VersionedScanEnvelope,
    tx: PrismaTransactionClient,
    context?: DomainScanContext,
  ): Promise<PreparedScanSubject> {
    const tagUid = normalizeTagUid(envelope.tagUid);

    // 1. Resolve active garment binding
    const binding = await tx.rfid_tag_bindings.findFirst({
      where: { tag_uid: tagUid, unbound_at: null },
      include: {
        garments: true,
        material_lots: true,
      },
    });

    if (!binding) {
      throw ApiError.badRequest(
        `Scanned card UID '${tagUid}' is not bound to any known entity.`,
        { tagUid },
        "WT_ERR_UNKNOWN_CARD",
      );
    }

    if (binding.material_lot_id && !binding.garment_id) {
      throw ApiError.badRequest(
        `Card UID '${tagUid}' is bound to fabric lot '${binding.material_lots?.code ?? binding.material_lot_id}'. Expected garment card.`,
        { tagUid },
        "WT_ERR_WRONG_SUBJECT_TYPE",
      );
    }

    if (!binding.garment_id || !binding.garments) {
      throw ApiError.badRequest(
        `Card UID '${tagUid}' is not actively bound to a garment.`,
        { tagUid },
        "WT_ERR_UNBOUND_CARD",
      );
    }

    const garment = binding.garments;

    // 2. Validate garment stage: must be 'finished'
    if (garment.stage !== "finished") {
      throw ApiError.badRequest(
        `Garment '${garment.code}' is at stage '${garment.stage}', expected 'finished'.`,
        { garmentId: garment.id, stage: garment.stage },
        "WT_ERR_WRONG_STAGE",
      );
    }

    // 3. Action Context is strictly required at Final QA
    if (!envelope.actionContextId) {
      throw ApiError.badRequest(
        "Station final_qc requires an armed action context before scanning card.",
        undefined,
        "WT_ERR_CONTEXT_REQUIRED",
      );
    }

    const actionContext = await tx.rfid_action_contexts.findUnique({
      where: { id: envelope.actionContextId },
    });

    if (!actionContext || Boolean(actionContext.closed_at)) {
      throw ApiError.badRequest(
        "Armed QC action context is missing, expired, or already closed.",
        { actionContextId: envelope.actionContextId },
        "WT_ERR_CONTEXT_EXPIRED",
      );
    }

    if (actionContext.status === "consumed") {
      throw ApiError.conflict(
        "Armed QC action context has already been consumed.",
        { actionContextId: envelope.actionContextId },
        "WT_ERR_CONTEXT_ALREADY_CONSUMED",
      );
    }

    if (!actionContext.qc_outcome) {
      throw ApiError.badRequest(
        "Armed action context does not have a recorded QC outcome (pass/fail).",
        undefined,
        "WT_ERR_NO_CONTEXT",
      );
    }

    // 4. Independent Reinspection Check
    const operatorId =
      context?.actor?.actorId || (context as any)?.operator?.actorId || context?.session?.operatorId;
    if (actionContext.qc_scope === "reinspection" && operatorId) {
      const activeRework = await tx.rework_cases.findFirst({
        where: {
          garment_id: garment.id,
          status: { in: ["assigned", "repair_recorded"] },
        },
        include: {
          repair_records: {
            orderBy: { performed_at: "desc" },
            take: 1,
          },
        },
      });

      if (activeRework && activeRework.repair_records.length > 0) {
        const latestRepair = activeRework.repair_records[0];
        if (latestRepair && latestRepair.performed_by === operatorId) {
          throw ApiError.forbidden(
            "The technician who performed the repair cannot approve their own repair. Independent inspector required.",
            "WT_ERR_INDEPENDENT_QC",
          );
        }
      }
    }

    return {
      kind: "garment",
      subjectId: garment.id,
      subjectCode: garment.code,
      isNewEnrollment: false,
      tagUid,
      tagBindingId: binding.id,
    };
  }

  async process(
    envelope: VersionedScanEnvelope,
    subject: PreparedScanSubject,
    tx: PrismaTransactionClient,
    context?: DomainScanContext,
  ): Promise<ScanOutcomeResult> {
    const ctxId = envelope.actionContextId || context?.actionContext?.id;
    const actionContext = typeof tx.rfid_action_contexts.findUniqueOrThrow === "function"
      ? await tx.rfid_action_contexts.findUniqueOrThrow({ where: { id: ctxId! } })
      : await tx.rfid_action_contexts.findUnique({ where: { id: ctxId! } });
    if (!actionContext) {
      throw ApiError.badRequest("Armed QC action context not found.", { ctxId }, "WT_ERR_CONTEXT_NOT_FOUND");
    }

    const garment = typeof tx.garments.findUniqueOrThrow === "function"
      ? await tx.garments.findUniqueOrThrow({ where: { id: subject.subjectId } })
      : await tx.garments.findUnique({ where: { id: subject.subjectId } });
    if (!garment) {
      throw ApiError.notFound("Garment not found.", { garmentId: subject.subjectId });
    }

    // Resolve operator and checklist to satisfy validate_rfid_inspection trigger
    let session = null;
    if (typeof (tx as any).reader_sessions?.findUnique === "function") {
      session = await (tx as any).reader_sessions.findUnique({
        where: { id: actionContext.reader_session_id },
        select: { operator_id: true },
      });
    } else if (typeof (tx as any).reader_sessions?.findFirst === "function") {
      session = await (tx as any).reader_sessions.findFirst({
        where: { id: actionContext.reader_session_id },
        select: { operator_id: true },
      });
    }

    const actor = context?.actor ?? (context as any)?.operator;
    const staffUserId =
      actor?.actorId ??
      session?.operator_id ??
      (typeof tx.staff_users?.findFirstOrThrow === "function"
        ? (await tx.staff_users.findFirstOrThrow()).id
        : "00000000-0000-0000-0000-000000000000");

    const scope = (actionContext.qc_scope ?? "final") as "final" | "reinspection";
    const checklistVersionId =
      actionContext.checklist_version_id ?? (await getOrCreateChecklistVersion(tx, scope, staffUserId)).id;

    // Ensure inspection submitted_at >= scan received_at to satisfy trigger constraint
    let scanReceivedAt: Date | undefined;
    if (context?.scanRecordId && typeof (tx as any).rfid_scans?.findUnique === "function") {
      const scanRec = await (tx as any).rfid_scans.findUnique({
        where: { id: context.scanRecordId },
        select: { received_at: true },
      });
      scanReceivedAt = scanRec?.received_at;
    }
    const now = new Date();
    const inspectionTimestamp = scanReceivedAt && scanReceivedAt > now ? scanReceivedAt : now;

    // 1. Record immutable inspection
    const inspectionCode = `INSP-QA-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const inspection = await tx.inspections.create({
      data: {
        code: inspectionCode,
        scope,
        checklist_version_id: checklistVersionId,
        garment_id: garment.id,
        rfid_scan_id: context?.scanRecordId ?? null,
        inspector_id: staffUserId,
        outcome: actionContext.qc_outcome!,
        answers: (actionContext.answers as any) ?? {},
        notes: actionContext.notes ?? null,
        defect_reason: actionContext.defect_reason ?? null,
        created_at: inspectionTimestamp,
        submitted_at: inspectionTimestamp,
      },
    });

    let holdOpened = false;

    // Resolve next monotonically increasing subject revision
    const latestTrace = typeof (tx as any).trace_events?.findFirst === "function"
      ? await (tx as any).trace_events.findFirst({
          where: { garment_id: garment.id },
          orderBy: { subject_revision: "desc" },
          select: { subject_revision: true },
        })
      : null;
    const nextRevision = Math.max(garment.revision + 1, (latestTrace?.subject_revision ?? 0) + 1);

    // 2. Branch outcome
    if (actionContext.qc_outcome === "pass") {
      // Pass: release garment
      await tx.garments.update({
        where: { id: garment.id },
        data: {
          quality_disposition: "released",
          revision: nextRevision,
        },
      });

      // If resolving active rework case, mark it reinspected_passed and close the hold
      const activeRework = await tx.rework_cases.findFirst({
        where: { garment_id: garment.id, status: { in: ["open", "assigned", "repair_recorded"] } },
        orderBy: { opened_at: "desc" },
      });

      if (activeRework) {
        await tx.rework_cases.update({
          where: { id: activeRework.id },
          data: {
            status: "closed",
          },
        });

        if (activeRework.hold_id) {
          await tx.garment_holds.update({
            where: { id: activeRework.hold_id },
            data: {
              released_at: new Date(),
              released_by: staffUserId,
              release_reason: "Passed independent reinspection",
            },
          });
        }
      }
    } else {
      // Fail: open hold and rework case
      holdOpened = true;
      const hold = await tx.garment_holds.create({
        data: {
          garment_id: garment.id,
          kind: "quality",
          origin_inspection_id: inspection.id,
          reason: actionContext.defect_reason || "Failed Final QA inspection",
          opened_by: staffUserId,
          opened_at: new Date(),
        },
      });

      const answersObj = (actionContext.answers as Record<string, any>) || {};
      const assignedDept = (answersObj["assignedDepartment"] as string) || (answersObj["assigned_department_code"] as string) || null;

      await tx.rework_cases.create({
        data: {
          code: `RWK-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          garment_id: garment.id,
          hold_id: hold.id,
          status: assignedDept ? "assigned" : "open",
          assigned_department_code: assignedDept,
          assigned_by: assignedDept ? staffUserId : null,
          assigned_at: assignedDept ? new Date() : null,
          description: actionContext.defect_reason || "Failed Final QA inspection",
          opened_by: staffUserId,
          opened_at: new Date(),
        },
      });

      await tx.garments.update({
        where: { id: garment.id },
        data: {
          quality_disposition: "held",
          revision: { increment: 1 },
        },
      });
    }

    // 4. Record trace event
    const traceEvent = await tx.trace_events.create({
      data: {
        event_type: actionContext.qc_outcome === "pass" ? "qa_passed" : "qa_failed",
        subject_revision: nextRevision,
        garment_id: garment.id,
        inspection_id: inspection.id,
        rfid_scan_id: context?.scanRecordId ?? null,
        actor_id: staffUserId,
        details: {
          inspectionId: inspection.id,
          outcome: actionContext.qc_outcome,
          scope,
          holdOpened,
        },
        occurred_at: now,
        recorded_at: now,
      },
    });

    // 5. Emit transaction-scoped internal commitment (sha256_nonce_v1)
    await createInternalCommitment(
      {
        traceEventId: traceEvent.id,
        payload: {
          eventType: traceEvent.event_type,
          garmentId: garment.id,
          inspectionId: inspection.id,
          outcome: actionContext.qc_outcome,
          timestamp: traceEvent.occurred_at.toISOString(),
        },
      },
      tx,
    );

    return {
      scanId: envelope.scanId,
      outcome: actionContext.qc_outcome === "pass" ? "accepted" : "rejected",
      outcomeCode: actionContext.qc_outcome === "pass" ? "QC_PASSED" : "QC_FAILED",
      outcomeMessage:
        actionContext.qc_outcome === "pass"
          ? "Garment passed Final QA inspection; released for packing"
          : "Garment failed Final QA inspection; quality hold and rework case opened",
      stationCode: "final_qc",
      subjectKind: "garment",
      subjectId: garment.id,
      subjectCode: garment.code,
      processedAt: new Date().toISOString(),
      nextExpectedStation: actionContext.qc_outcome === "pass" ? "packing" : undefined,
    };
  }
}

/**
 * Station 7: Packing Scan Handler.
 * Gate: Garment must have quality_disposition === 'released' and ZERO active holds.
 */
export class PackingScanHandler implements DomainScanHandler<ScanOutcomeResult> {
  readonly stationCode: RfidStationCode = "packing";

  async prepare(
    envelope: VersionedScanEnvelope,
    tx: PrismaTransactionClient,
    context?: DomainScanContext,
  ): Promise<PreparedScanSubject> {
    const tagUid = normalizeTagUid(envelope.tagUid);

    const binding = await tx.rfid_tag_bindings.findFirst({
      where: { tag_uid: tagUid, unbound_at: null },
      include: { garments: true },
    });

    if (!binding || !binding.garment_id || !binding.garments) {
      throw ApiError.badRequest(
        `Card UID '${tagUid}' is not actively bound to a garment.`,
        { tagUid },
        "WT_ERR_UNKNOWN_CARD",
      );
    }

    const garment = binding.garments;

    // Enforce fulfilment gate
    const eligibility = await getPersistedFulfilmentEligibility(tx, garment.id, "packing");
    if (!eligibility.eligible) {
      throw ApiError.badRequest(
        `Packing blocked: ${eligibility.blockingReasons.join("; ")}`,
        { garmentId: garment.id, reasons: eligibility.blockingReasons },
        "WT_ERR_FULFILMENT_BLOCKED",
      );
    }

    return {
      kind: "garment",
      subjectId: garment.id,
      subjectCode: garment.code,
      isNewEnrollment: false,
      tagUid,
      tagBindingId: binding.id,
    };
  }

  async process(
    envelope: VersionedScanEnvelope,
    subject: PreparedScanSubject,
    tx: PrismaTransactionClient,
    context?: DomainScanContext,
  ): Promise<ScanOutcomeResult> {
    const garment = await tx.garments.update({
      where: { id: subject.subjectId },
      data: {
        stage: "packed",
        revision: { increment: 1 },
      },
    });

    const staffUserId =
      context?.actor?.actorId ??
      (context as any)?.operator?.actorId ??
      (await tx.staff_users.findFirstOrThrow()).id;

    const now = new Date();
    const traceEvent = await tx.trace_events.create({
      data: {
        event_type: "garment_packed",
        subject_revision: garment.revision,
        garment_id: garment.id,
        actor_id: staffUserId,
        details: { stage: "packed" },
        occurred_at: now,
        recorded_at: now,
      },
    });

    await createInternalCommitment(
      {
        traceEventId: traceEvent.id,
        payload: {
          eventType: "garment_packed",
          garmentId: garment.id,
          stage: "packed",
          timestamp: traceEvent.occurred_at.toISOString(),
        },
      },
      tx,
    );

    return {
      scanId: envelope.scanId,
      outcome: "accepted",
      outcomeCode: "PACKING_ACCEPTED",
      outcomeMessage: `Garment ${garment.code} packed successfully`,
      stationCode: "packing",
      subjectKind: "garment",
      subjectId: garment.id,
      subjectCode: garment.code,
      processedAt: new Date().toISOString(),
      nextExpectedStation: "warehouse",
    };
  }
}

/**
 * Station 8: Warehouse Movement Scan Handler.
 * Physical hardware RFID scans of the Master Box Tag at Station 8 / Scanner 8.
 */
export class WarehouseScanHandler implements DomainScanHandler<ScanOutcomeResult> {
  readonly stationCode: RfidStationCode = "warehouse";

  async prepare(
    envelope: VersionedScanEnvelope,
    tx: PrismaTransactionClient,
    _context?: DomainScanContext,
  ): Promise<PreparedScanSubject> {
    const rawUid = envelope.tagUid ? envelope.tagUid.trim() : "";
    const tagUid = normalizeTagUid(rawUid);

    // 1. Identify carton from Master Box RFID Tag UID
    let pkg = await tx.packages.findFirst({
      where: {
        OR: [
          ...(rawUid.length === 36 ? [{ id: rawUid }] : []),
          { code: rawUid },
          { code: tagUid },
          { code: { equals: rawUid, mode: "insensitive" } },
        ],
      },
      include: {
        package_items: {
          where: { removed_at: null },
          include: { garments: true },
        },
      },
    });

    // Fallback: check if card UID is bound to a garment inside a carton
    if (!pkg) {
      const binding = await tx.rfid_tag_bindings.findFirst({
        where: {
          OR: [
            { tag_uid: tagUid, unbound_at: null },
            { tag_identifier: rawUid, unbound_at: null },
          ],
        },
        include: {
          garments: {
            include: {
              package_items: {
                where: { removed_at: null },
                include: { packages: true },
              },
            },
          },
        },
      });

      if (binding?.garments) {
        const candidatePkg = Array.isArray(binding.garments.package_items)
          ? binding.garments.package_items[0]?.packages
          : (binding.garments.package_items as any)?.packages;
        if (candidatePkg) {
          pkg = candidatePkg as any;
        } else {
          return {
            kind: "garment",
            subjectId: binding.garments.id,
            subjectCode: binding.garments.code,
            isNewEnrollment: false,
            tagUid: rawUid,
            tagBindingId: binding.id,
          };
        }
      }
    }

    if (!pkg) {
      const garment = await tx.garments.findFirst({
        where: {
          OR: [
            ...(isValidUuid(rawUid) ? [{ id: rawUid }] : []),
            { code: rawUid },
          ],
        },
        include: {
          package_items: {
            where: { removed_at: null },
            include: { packages: true },
          },
        },
      });

      if (garment) {
        const candidatePkg = Array.isArray(garment.package_items)
          ? garment.package_items[0]?.packages
          : (garment.package_items as any)?.packages;
        if (candidatePkg) {
          pkg = candidatePkg as any;
        } else {
          return {
            kind: "garment",
            subjectId: garment.id,
            subjectCode: garment.code,
            isNewEnrollment: false,
            tagUid: rawUid,
          };
        }
      }
    }

    if (!pkg) {
      throw ApiError.notFound(
        `Master Box RFID Tag '${rawUid}' is not registered to any carton.`,
        { tagUid: rawUid },
        "WT_ERR_UNKNOWN_CARD",
      );
    }

    return {
      kind: "garment",
      subjectId: pkg.id,
      subjectCode: pkg.code,
      isNewEnrollment: false,
      tagUid: rawUid,
    };
  }

  async process(
    envelope: VersionedScanEnvelope,
    subject: PreparedScanSubject,
    tx: PrismaTransactionClient,
    context?: DomainScanContext,
  ): Promise<ScanOutcomeResult> {
    const actor = context?.actor ?? (context as any)?.operator ?? {
      actorId: (await tx.staff_users.findFirstOrThrow()).id,
      username: "warehouse.operator",
      displayName: "Warehouse Associate",
      role: "logistics",
      department: "warehouse",
      authenticatedAt: new Date(),
    };

    if (subject.tagBindingId) {
      const garment = await tx.garments.findUnique({
        where: { id: subject.subjectId },
      });
      if (garment) {
        await tx.garments.update({
          where: { id: garment.id },
          data: { stage: "warehoused", revision: { increment: 1 } },
        });

        const traceEvent = (tx as any).trace_events?.create
          ? await (tx as any).trace_events.create({
              data: {
                event_type: "warehouse_movement",
                subject_revision: garment.revision + 1,
                garment_id: garment.id,
                actor_id: actor.actorId,
                details: { location: "main_warehouse" },
                occurred_at: new Date(),
                recorded_at: new Date(),
              },
            })
          : null;

        if (traceEvent) {
          await createInternalCommitment(
            {
              traceEventId: traceEvent.id,
              payload: {
                eventType: "warehouse_movement",
                garmentId: garment.id,
                timestamp: new Date().toISOString(),
              },
            },
            tx,
          ).catch(() => null);
        }

        return {
          scanId: envelope.scanId,
          outcome: "accepted",
          outcomeCode: "WAREHOUSE_ACCEPTED",
          outcomeMessage: `Warehouse movement recorded for ${subject.subjectCode}`,
          stationCode: "warehouse",
          subjectKind: "garment",
          subjectId: subject.subjectId,
          subjectCode: subject.subjectCode,
          processedAt: new Date().toISOString(),
          nextExpectedStation: "dispatch",
        };
      }
    }

    const outcome = await executeWarehouseCartonIntake(
      tx,
      actor,
      {
        tagUid: envelope.tagUid,
        binId:
          (context as any)?.binId ||
          (context?.actionContext?.payload as any)?.warehouseBinId ||
          (context?.actionContext?.payload as any)?.binId ||
          "BIN-A1",
        isHardware: true,
      },
    );

    if (outcome.resolution !== "accepted") {
      if (outcome.resolution === "rejected_unknown_card") {
        throw ApiError.notFound(outcome.rejectReason || "Master box tag unknown", undefined, "WT_ERR_UNKNOWN_CARD");
      }
      if (outcome.resolution === "rejected_duplicate") {
        throw ApiError.conflict(outcome.rejectReason || "Duplicate intake scan", undefined, "WT_ERR_DUPLICATE_SCAN");
      }
      if (outcome.resolution === "rejected_business_rule") {
        throw ApiError.badRequest(outcome.rejectReason || "Business rule violation", undefined, "WT_ERR_ACTIVE_HOLD");
      }
      throw ApiError.badRequest(outcome.rejectReason || "Intake rejected", undefined, "WT_ERR_WRONG_STAGE");
    }

    return {
      scanId: envelope.scanId,
      outcome: "accepted",
      outcomeCode: "WAREHOUSE_ACCEPTED",
      outcomeMessage: outcome.productName || `Carton ${subject.subjectCode} received into warehouse stock`,
      stationCode: "warehouse",
      subjectKind: subject.kind,
      subjectId: subject.subjectId,
      subjectCode: subject.subjectCode,
      processedAt: outcome.at,
      nextExpectedStation: "dispatch",
    };
  }
}

/**
 * Station 9: Dispatch Scan Handler.
 * Gate: Evaluates package and shipment eligibility. Blocks if any garment has an active hold.
 */
export class DispatchScanHandler implements DomainScanHandler<ScanOutcomeResult> {
  readonly stationCode: RfidStationCode = "dispatch";

  async prepare(
    envelope: VersionedScanEnvelope,
    tx: PrismaTransactionClient,
    context?: DomainScanContext,
  ): Promise<PreparedScanSubject> {
    const tagUid = normalizeTagUid(envelope.tagUid);

    const binding = await tx.rfid_tag_bindings.findFirst({
      where: { tag_uid: tagUid, unbound_at: null },
      include: {
        garments: {
          include: {
            garment_holds: { where: { released_at: null } },
          },
        },
      },
    });

    if (!binding || !binding.garment_id || !binding.garments) {
      throw ApiError.badRequest(
        `Card UID '${tagUid}' is not actively bound to a garment.`,
        { tagUid },
        "WT_ERR_UNKNOWN_CARD",
      );
    }

    const garment = binding.garments;

    if (garment.garment_holds.length > 0) {
      throw ApiError.badRequest(
        `Dispatch departure blocked: Garment '${garment.code}' has an active quality hold.`,
        { garmentId: garment.id },
        "WT_ERR_DISPATCH_HOLD_ACTIVE",
      );
    }

    return {
      kind: "garment",
      subjectId: garment.id,
      subjectCode: garment.code,
      isNewEnrollment: false,
      tagUid,
      tagBindingId: binding.id,
    };
  }

  async process(
    envelope: VersionedScanEnvelope,
    subject: PreparedScanSubject,
    tx: PrismaTransactionClient,
    context?: DomainScanContext,
  ): Promise<ScanOutcomeResult> {
    const staffUserId =
      context?.actor?.actorId ??
      (context as any)?.operator?.actorId ??
      (await tx.staff_users.findFirstOrThrow()).id;

    const now = new Date();
    await tx.garments.update({
      where: { id: subject.subjectId },
      data: { stage: "dispatched", revision: { increment: 1 } },
    });
    const traceEvent = await tx.trace_events.create({
      data: {
        event_type: "shipment_dispatched",
        subject_revision: 1,
        garment_id: subject.subjectId,
        actor_id: staffUserId,
        details: { dispatched: true },
        occurred_at: now,
        recorded_at: now,
      },
    });

    await createInternalCommitment(
      {
        traceEventId: traceEvent.id,
        payload: {
          eventType: "shipment_dispatched",
          garmentId: subject.subjectId,
          timestamp: traceEvent.occurred_at.toISOString(),
        },
      },
      tx,
    );

    try {
      await publishPublicGarmentPayload(tx, subject.subjectId, staffUserId);
    } catch (pubErr) {
      console.warn(`[DISPATCH_SCAN_WARN] Public payload publication skipped for garment ${subject.subjectId}:`, pubErr);
    }

    return {
      scanId: envelope.scanId,
      outcome: "accepted",
      outcomeCode: "DISPATCH_ACCEPTED",
      outcomeMessage: `Garment ${subject.subjectCode} cleared dispatch departure gate`,
      stationCode: "dispatch",
      subjectKind: "garment",
      subjectId: subject.subjectId,
      subjectCode: subject.subjectCode,
      processedAt: new Date().toISOString(),
    };
  }
}

// Singletons
export const finalQcScanHandler = new FinalQcScanHandler();
export const packingScanHandler = new PackingScanHandler();
export const warehouseScanHandler = new WarehouseScanHandler();
export const dispatchScanHandler = new DispatchScanHandler();

/**
 * Registers all Member 3 quality and fulfilment domain scan handlers.
 */
export function registerMember3ScanHandlers(
  router: ScanRoutingService = scanRoutingService,
): void {
  router.registerHandler(finalQcScanHandler);
  router.registerHandler(packingScanHandler);
  router.registerHandler(warehouseScanHandler);
  router.registerHandler(dispatchScanHandler);
}

/**
 * Registers all station scan handlers across Members 2 & 3 (Stations 1 through 9).
 */
export function registerAllDomainScanHandlers(
  router: ScanRoutingService = scanRoutingService,
): void {
  // Member 2: Stations 1 - 5
  router.registerHandler(fabricReceivingScanHandler);
  router.registerHandler(fabricIssueScanHandler);
  router.registerHandler(cuttingScanHandler);
  router.registerHandler(stitchingScanHandler);
  router.registerHandler(finishingScanHandler);

  // Member 3: Stations 6 - 9
  router.registerHandler(finalQcScanHandler);
  router.registerHandler(packingScanHandler);
  router.registerHandler(warehouseScanHandler);
  router.registerHandler(dispatchScanHandler);
}
