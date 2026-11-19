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
} from "../quality/quality-service";
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

// ---------------------------------------------------------------- Inspections Querying

qualityRouter.get("/inspections", async (req: Request, res: Response) => {
  try {
    const scope = getQueryParam(req.query["scope"]);
    const garmentId = getQueryParam(req.query["garmentId"]);
    const lotId = getQueryParam(req.query["lotId"]);

    const result = await runInTransaction((tx) =>
      listInspections(tx, {
        ...(scope ? { scope } : {}),
        ...(garmentId ? { garmentId } : {}),
        ...(lotId ? { lotId } : {}),
      }),
    );
    return sendSuccess(res, result, 200);
  } catch (err) {
    return sendError(res, err, 500);
  }
});

qualityRouter.get("/inspections/:id", async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params["id"]);
    const result = await runInTransaction((tx) => getInspectionDetail(tx, id));
    if (!result) {
      return sendError(res, ApiError.notFound(`Inspection '${id}' not found.`));
    }
    return sendSuccess(res, result, 200);
  } catch (err) {
    return sendError(res, err, 500);
  }
});

// ---------------------------------------------------------------- Rework & Repairs

qualityRouter.get("/rework", async (req: Request, res: Response) => {
  try {
    const status = getQueryParam(req.query["status"]);
    const departmentCode = getQueryParam(req.query["departmentCode"]);

    const result = await runInTransaction((tx) =>
      listReworkCases(tx, {
        ...(status ? { status } : {}),
        ...(departmentCode ? { departmentCode } : {}),
      }),
    );
    return sendSuccess(res, result, 200);
  } catch (err) {
    return sendError(res, err, 500);
  }
});

qualityRouter.get("/rework/:id", async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params["id"]);
    const result = await runInTransaction((tx) => getReworkCaseDetail(tx, id));
    if (!result) {
      return sendError(res, ApiError.notFound(`Rework case '${id}' not found.`));
    }
    return sendSuccess(res, result, 200);
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
        departmentCode: req.body.departmentCode,
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
        workSummary: req.body.workSummary,
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
        releaseReason: req.body.releaseReason,
      }),
    );
    return sendSuccess(res, result, 200);
  } catch (err) {
    return sendError(res, err, 400);
  }
});
