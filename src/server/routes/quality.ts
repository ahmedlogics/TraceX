import { Router, type Request, type Response, type NextFunction } from "express";
import { runInTransaction } from "../db/client";
import {
  executeIncomingQc,
  prepareQcContext,
  executeFinalQcScan,
  assignReworkCase,
  recordRepair,
  releaseHold,
  listInspections,
  getInspectionDetail,
  listReworkCases,
  getReworkCaseDetail,
  ensureStaffUserRecord,
} from "../quality/quality-service";
import { createInternalCommitment } from "../ledger/commitment-service";
import { sendSuccess, sendError, ApiError } from "../middleware/responses";
import type { ActorContext, StaffRole, Department } from "../contracts/actor";

export const qualityRouter = Router();

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? "";
  return param ?? "";
}

function getQueryParam(param: unknown): string | undefined {
  if (typeof param === "string") return param;
  if (Array.isArray(param) && typeof param[0] === "string") return param[0];
  return undefined;
}

/**
 * Authentication & Actor Context middleware.
 * In production: strictly enforces session-derived req.actor.
 * In test mode: allows x-actor-* headers for isolated harness integration testing.
 */
function resolveActor(req: Request, _res: Response, next: NextFunction): void {
  if (req.actor) {
    return next();
  }

  if (process.env["NODE_ENV"] !== "production") {
    const role = (req.headers["x-actor-role"] as StaffRole) || "quality";
    const dept = (req.headers["x-actor-dept"] as Department) || "quality";
    const username = (req.headers["x-actor-username"] as string) || "quality.inspector";
    const actorId = (req.headers["x-actor-id"] as string) || `test-actor-${role}`;

    req.actor = {
      actorId,
      username,
      displayName: username,
      role,
      department: dept,
      authenticatedAt: new Date(),
    };
    return next();
  }

  return next(
    ApiError.unauthorized(
      "Authentication required: staff session token missing or unverified.",
      undefined,
      "WT_ERR_UNAUTHORIZED",
    ),
  );
}

// Apply authentication middleware to all quality routes
qualityRouter.use(resolveActor);

// ---------------------------------------------------------------- Incoming Material QC

qualityRouter.post("/incoming-qc", async (req: Request, res: Response) => {
  try {
    const result = await runInTransaction((tx) => executeIncomingQc(tx, req.actor!, req.body));
    return sendSuccess(res, result, 201);
  } catch (err) {
    return sendError(res, err, 400);
  }
});

// ---------------------------------------------------------------- Final QA Context & Scan

qualityRouter.post("/context", async (req: Request, res: Response) => {
  try {
    const result = await runInTransaction((tx) => prepareQcContext(tx, req.actor!, req.body));
    return sendSuccess(res, result, 201);
  } catch (err) {
    return sendError(res, err, 400);
  }
});

qualityRouter.post("/scan", async (req: Request, res: Response) => {
  try {
    const result = await runInTransaction((tx) => executeFinalQcScan(tx, req.actor!, req.body));
    return sendSuccess(res, result, 200);
  } catch (err) {
    return sendError(res, err, 400);
  }
});

// ---------------------------------------------------------------- DTO Mappers

function mapInspection(i: any) {
  const kind = (i.scope || "final") as "incoming" | "final" | "reinspection";
  const status = !i.outcome ? "open" : i.outcome === "pass" ? "passed" : "failed";
  const subjectType = i.garment_id ? "garment" : "lot";
  const subjectId = i.garments?.code || i.material_lots?.code || i.garment_id || i.material_lot_id || "";

  let checklist: any[] = [];
  if (i.answers && typeof i.answers === "object" && Array.isArray((i.answers as any).checklist)) {
    checklist = (i.answers as any).checklist;
  }

  return {
    id: i.code || i.id,
    inspectionId: i.id,
    kind,
    subjectType,
    subjectId,
    status,
    assigneeId: i.inspector_id,
    checklist,
    notes: i.notes || "",
    defectReason: i.defect_reason || undefined,
    submittedAt: i.submitted_at ? new Date(i.submitted_at).toISOString() : undefined,
    submittedBy: i.staff_users?.display_name || i.staff_users?.username || undefined,
    createdAt: new Date(i.created_at).toISOString(),
  };
}

function mapReworkCase(r: any) {
  let status: "awaiting-assignment" | "assigned" | "repaired" | "closed" = "awaiting-assignment";
  if (r.status === "assigned") status = "assigned";
  else if (r.status === "repaired") status = "repaired";
  else if (r.status === "closed") status = "closed";

  const garmentId = r.garment_holds?.garments?.code || r.garment_id || "";

  return {
    id: r.code || r.id,
    reworkCaseId: r.id,
    garmentId,
    inspectionId: r.inspection_id || "",
    defectReason: r.defect_description || "",
    status,
    assignedDepartment: r.assigned_department_code || r.department_code || undefined,
    assignedBy: r.assigned_by || undefined,
    repairNote: r.repair_records?.[0]?.work_summary || undefined,
    repairedBy: r.repair_records?.[0]?.staff_users?.display_name || undefined,
    reinspectionId: r.reinspection_id || undefined,
    createdAt: new Date(r.opened_at || r.created_at).toISOString(),
    history: [],
  };
}

// ---------------------------------------------------------------- Inspections Querying

qualityRouter.get("/inspections", async (req: Request, res: Response) => {
  try {
    const scope = getQueryParam(req.query["scope"]);
    const garmentId = getQueryParam(req.query["garmentId"]);
    const lotId = getQueryParam(req.query["lotId"]);

    const raw = await runInTransaction((tx) =>
      listInspections(tx, {
        ...(scope ? { scope } : {}),
        ...(garmentId ? { garmentId } : {}),
        ...(lotId ? { lotId } : {}),
      }),
    );
    const result = raw.map(mapInspection);
    return sendSuccess(res, result, 200);
  } catch (err) {
    return sendError(res, err, 500);
  }
});

qualityRouter.get("/inspections/:id", async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params["id"]);
    const raw = await runInTransaction((tx) => getInspectionDetail(tx, id));
    if (!raw) {
      return sendError(res, ApiError.notFound(`Inspection '${id}' not found.`));
    }
    const inspection = mapInspection(raw);
    const detail: any = { inspection };
    if (raw.garments) {
      detail.garment = {
        id: raw.garments.id,
        code: raw.garments.code,
        publicId: raw.garments.public_id,
        stage: raw.garments.stage,
        qualityDisposition: raw.garments.quality_disposition,
        revision: raw.garments.revision,
      };
    }
    if (raw.material_lots) {
      detail.lot = {
        id: raw.material_lots.id,
        code: raw.material_lots.code,
        material: raw.material_lots.material_name,
        status: "active",
      };
    }
    return sendSuccess(res, detail, 200);
  } catch (err) {
    return sendError(res, err, 500);
  }
});

qualityRouter.post("/inspections/:id/result", async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params["id"]);
    const { checklist, notes, result, defectReason } = req.body as {
      checklist?: any[];
      notes?: string;
      result?: "pass" | "fail";
      defectReason?: string;
    };

    if (!result) {
      return sendError(res, ApiError.badRequest("result is required (pass or fail)."));
    }

    const outcome = await runInTransaction(async (tx) => {
      const inspection = await tx.inspections.findUnique({
        where: { id },
        include: { garments: true, material_lots: true },
      });

      if (!inspection) {
        throw ApiError.notFound(`Inspection '${id}' not found.`);
      }

      const staffUserId = await ensureStaffUserRecord(tx, req.actor!, "final_qc");
      const inspectionTimestamp = new Date();

      await tx.inspections.update({
        where: { id },
        data: {
          outcome: result,
          notes: notes ?? inspection.notes,
          defect_reason: result === "fail" ? defectReason ?? null : null,
          answers: checklist ? ({ checklist } as any) : (inspection.answers as any),
          submitted_at: inspectionTimestamp,
          inspector_id: staffUserId,
        },
      });

      if (inspection.garment_id && inspection.garments) {
        const garment = inspection.garments;
        const newDisposition = result === "pass" ? "released" : "held";

        if (result === "fail") {
          const hold = await tx.garment_holds.create({
            data: {
              garment_id: garment.id,
              opened_by: staffUserId,
              reason: defectReason || notes || "Failed quality inspection",
              kind: "quality",
              opened_at: inspectionTimestamp,
            },
          });

          const reworkCount = await tx.rework_cases.count();
          const reworkCode = `RWK-${garment.code}-${String(reworkCount + 1).padStart(2, "0")}`;

          await tx.rework_cases.create({
            data: {
              code: reworkCode,
              garment_id: garment.id,
              hold_id: hold.id,
              status: "open",
              description: defectReason || notes || "Quality defect requiring rework",
              opened_by: staffUserId,
              opened_at: inspectionTimestamp,
            },
          });
        }

        const latestTrace = await tx.trace_events.findFirst({
          where: { garment_id: garment.id },
          orderBy: { subject_revision: "desc" },
        });
        const nextRevision = Math.max(garment.revision + 1, (latestTrace?.subject_revision ?? 0) + 1);

        await tx.garments.update({
          where: { id: garment.id },
          data: {
            quality_disposition: newDisposition,
            revision: nextRevision,
          },
        });

        const traceEvent = await tx.trace_events.create({
          data: {
            event_type: result === "pass" ? "qa_passed" : "qa_failed",
            garment_id: garment.id,
            subject_revision: nextRevision,
            actor_id: staffUserId,
            inspection_id: inspection.id,
            details: {
              inspectionId: inspection.id,
              scope: inspection.scope,
              outcome: result,
              defectReason: result === "fail" ? defectReason : undefined,
            },
            occurred_at: inspectionTimestamp,
            recorded_at: inspectionTimestamp,
          },
        });

        await createInternalCommitment(
          {
            traceEventId: traceEvent.id,
            payload: {
              eventType: traceEvent.event_type,
              garmentId: garment.id,
              inspectionId: inspection.id,
              outcome: result,
              timestamp: inspectionTimestamp.toISOString(),
            },
          },
          tx,
        );
      }

      return { inspectionId: id, outcome: result };
    });

    return sendSuccess(res, outcome, 200);
  } catch (err) {
    return sendError(res, err, 400);
  }
});

// ---------------------------------------------------------------- Rework & Repairs

qualityRouter.get("/rework", async (req: Request, res: Response) => {
  try {
    const status = getQueryParam(req.query["status"]);
    const departmentCode = getQueryParam(req.query["departmentCode"]);

    const raw = await runInTransaction((tx) =>
      listReworkCases(tx, {
        ...(status ? { status } : {}),
        ...(departmentCode ? { departmentCode } : {}),
      }),
    );
    const result = raw.map(mapReworkCase);
    return sendSuccess(res, result, 200);
  } catch (err) {
    return sendError(res, err, 500);
  }
});

qualityRouter.get("/rework/:id", async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params["id"]);
    const raw = await runInTransaction((tx) => getReworkCaseDetail(tx, id));
    if (!raw) {
      return sendError(res, ApiError.notFound(`Rework case '${id}' not found.`));
    }
    const reworkCase = mapReworkCase(raw);
    const garment = raw.garment_holds?.garments ? {
      id: raw.garment_holds.garments.id,
      code: raw.garment_holds.garments.code,
      publicId: raw.garment_holds.garments.public_id,
      stage: raw.garment_holds.garments.stage,
      qualityDisposition: raw.garment_holds.garments.quality_disposition,
      revision: raw.garment_holds.garments.revision,
    } : { id: reworkCase.garmentId, code: reworkCase.garmentId };
    return sendSuccess(res, { reworkCase, garment, inspections: [] }, 200);
  } catch (err) {
    return sendError(res, err, 500);
  }
});

qualityRouter.post("/rework/:id/assign", async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params["id"]);
    const result = await runInTransaction((tx) =>
      assignReworkCase(tx, req.actor!, {
        reworkCaseId: id,
        departmentCode: req.body.departmentCode || req.body.department,
      }),
    );
    return sendSuccess(res, result, 200);
  } catch (err) {
    return sendError(res, err, 400);
  }
});

qualityRouter.post("/rework/:id/repair", async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params["id"]);
    const result = await runInTransaction((tx) =>
      recordRepair(tx, req.actor!, {
        reworkCaseId: id,
        workSummary: req.body.workSummary || req.body.note || "Completed rework",
      }),
    );
    return sendSuccess(res, result, 201);
  } catch (err) {
    return sendError(res, err, 400);
  }
});

qualityRouter.post("/rework/:id/complete", async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params["id"]);
    const result = await runInTransaction((tx) =>
      recordRepair(tx, req.actor!, {
        reworkCaseId: id,
        workSummary: req.body.note || req.body.workSummary || "Completed rework",
      }),
    );
    return sendSuccess(res, result, 201);
  } catch (err) {
    return sendError(res, err, 400);
  }
});

// ---------------------------------------------------------------- Hold Release

qualityRouter.post("/holds/:id/release", async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params["id"]);
    const result = await runInTransaction((tx) =>
      releaseHold(tx, req.actor!, {
        holdId: id,
        releaseReason: req.body.releaseReason || req.body.reason || "Released by quality inspector",
      }),
    );
    return sendSuccess(res, result, 200);
  } catch (err) {
    return sendError(res, err, 400);
  }
});

qualityRouter.post("/garments/:id/release-hold", async (req: Request, res: Response) => {
  try {
    const garmentId = getParam(req.params["id"]);
    const result = await runInTransaction(async (tx) => {
      const hold = await tx.garment_holds.findFirst({
        where: {
          garment_id: garmentId,
          released_at: null,
        },
        orderBy: { opened_at: "desc" },
      });
      if (!hold) {
        throw ApiError.notFound(`No active hold found for garment '${garmentId}'.`);
      }
      return releaseHold(tx, req.actor!, {
        holdId: hold.id,
        releaseReason: req.body.releaseReason || req.body.reason || "Released by quality inspector",
      });
    });
    return sendSuccess(res, result, 200);
  } catch (err) {
    return sendError(res, err, 400);
  }
});
