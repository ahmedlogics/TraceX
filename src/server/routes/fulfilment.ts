import { Router, type Request, type Response, type NextFunction } from "express";
import { runInTransaction } from "../db/client";
import {
  getPersistedFulfilmentEligibility,
  createPackage,
  packGarment,
  sealPackage,
  receiveWarehouseStock,
  allocatePackageToShipment,
  verifyShipmentGarment,
  confirmShipmentDeparture,
  listPackages,
  getPackageDetail,
  listShipments,
  getShipmentDetail,
} from "../fulfilment/fulfilment-service";
import { sendSuccess, sendError, ApiError } from "../middleware/responses";
import type { ActorContext, StaffRole, Department } from "../contracts/actor";

export const fulfilmentRouter = Router();

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? "";
  return param ?? "";
}

function getQueryParam(param: unknown): string | undefined {
  if (typeof param === "string") return param;
  if (Array.isArray(param) && typeof param[0] === "string") return param[0];
  return undefined;
}

function resolveActor(req: Request, _res: Response, next: NextFunction): void {
  if (req.actor) {
    return next();
  }

  if (process.env["NODE_ENV"] !== "production") {
    const role = (req.headers["x-actor-role"] as StaffRole) || "logistics";
    const dept = (req.headers["x-actor-dept"] as Department) || "packing";
    const username = (req.headers["x-actor-username"] as string) || "logistics.operator";
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

// Apply authentication middleware to all fulfilment routes
fulfilmentRouter.use(resolveActor);

// ---------------------------------------------------------------- Authoritative Eligibility Gate

fulfilmentRouter.get("/eligibility/:garmentId", async (req: Request, res: Response) => {
  try {
    const garmentId = getParam(req.params["garmentId"]);
    const op = getQueryParam(req.query["operation"]);
    const operation = (op as "packing" | "warehouse" | "dispatch") || "packing";
    const packageId = getQueryParam(req.query["packageId"]);
    const shipmentId = getQueryParam(req.query["shipmentId"]);

    const result = await runInTransaction((tx) =>
      getPersistedFulfilmentEligibility(tx, garmentId, operation, {
        ...(packageId ? { packageId } : {}),
        ...(shipmentId ? { shipmentId } : {}),
      }),
    );
    return sendSuccess(res, result, 200);
  } catch (err) {
    return sendError(res, err, 400);
  }
});

// ---------------------------------------------------------------- Packaging Operations

fulfilmentRouter.get("/packages", async (req: Request, res: Response) => {
  try {
    const status = getQueryParam(req.query["status"]);
    const result = await runInTransaction((tx) =>
      listPackages(tx, {
        ...(status ? { status } : {}),
      }),
    );
    return sendSuccess(res, result, 200);
  } catch (err) {
    return sendError(res, err, 500);
  }
});

fulfilmentRouter.get("/packages/:id", async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params["id"]);
    const result = await runInTransaction((tx) => getPackageDetail(tx, id));
    if (!result) {
      return sendError(res, ApiError.notFound(`Package '${id}' not found.`));
    }
    return sendSuccess(res, result, 200);
  } catch (err) {
    return sendError(res, err, 500);
  }
});

fulfilmentRouter.post("/packages", async (req: Request, res: Response) => {
  try {
    const result = await runInTransaction((tx) => createPackage(tx, req.actor!, req.body));
    return sendSuccess(res, result, 201);
  } catch (err) {
    return sendError(res, err, 400);
  }
});

fulfilmentRouter.post("/packages/:id/pack", async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params["id"]);
    const result = await runInTransaction((tx) =>
      packGarment(tx, req.actor!, {
        packageId: id,
        garmentId: req.body.garmentId,
      }),
    );
    return sendSuccess(res, result, 201);
  } catch (err) {
    return sendError(res, err, 400);
  }
});

fulfilmentRouter.post("/packages/:id/seal", async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params["id"]);
    const result = await runInTransaction((tx) => sealPackage(tx, req.actor!, id));
    return sendSuccess(res, result, 200);
  } catch (err) {
    return sendError(res, err, 400);
  }
});

// ---------------------------------------------------------------- Warehouse Receipt

fulfilmentRouter.post("/warehouse/receive", async (req: Request, res: Response) => {
  try {
    const result = await runInTransaction((tx) => receiveWarehouseStock(tx, req.actor!, req.body));
    return sendSuccess(res, result, 200);
  } catch (err) {
    return sendError(res, err, 400);
  }
});

// ---------------------------------------------------------------- Shipments & Departure Gate

fulfilmentRouter.get("/shipments", async (req: Request, res: Response) => {
  try {
    const status = getQueryParam(req.query["status"]);
    const result = await runInTransaction((tx) =>
      listShipments(tx, {
        ...(status ? { status } : {}),
      }),
    );
    return sendSuccess(res, result, 200);
  } catch (err) {
    return sendError(res, err, 500);
  }
});

fulfilmentRouter.get("/shipments/:id", async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params["id"]);
    const result = await runInTransaction((tx) => getShipmentDetail(tx, id));
    if (!result) {
      return sendError(res, ApiError.notFound(`Shipment '${id}' not found.`));
    }
    return sendSuccess(res, result, 200);
  } catch (err) {
    return sendError(res, err, 500);
  }
});

fulfilmentRouter.post("/shipments/:id/packages/:packageId", async (req: Request, res: Response) => {
  try {
    const shipmentId = getParam(req.params["id"]);
    const packageId = getParam(req.params["packageId"]);
    const result = await runInTransaction((tx) =>
      allocatePackageToShipment(tx, req.actor!, shipmentId, packageId),
    );
    return sendSuccess(res, result, 201);
  } catch (err) {
    return sendError(res, err, 400);
  }
});

fulfilmentRouter.post("/shipments/:id/verify-garment", async (req: Request, res: Response) => {
  try {
    const shipmentId = getParam(req.params["id"]);
    const result = await runInTransaction((tx) =>
      verifyShipmentGarment(tx, req.actor!, {
        shipmentId,
        garmentId: req.body.garmentId,
      }),
    );
    return sendSuccess(res, result, 200);
  } catch (err) {
    return sendError(res, err, 400);
  }
});

fulfilmentRouter.post("/shipments/:id/depart", async (req: Request, res: Response) => {
  try {
    const shipmentId = getParam(req.params["id"]);
    const result = await runInTransaction((tx) =>
      confirmShipmentDeparture(tx, req.actor!, shipmentId),
    );
    return sendSuccess(res, result, 200);
  } catch (err) {
    return sendError(res, err, 400);
  }
});
