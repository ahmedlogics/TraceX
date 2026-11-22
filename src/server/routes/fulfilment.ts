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
  dispatchBoxScan,
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

// ---------------------------------------------------------------- Aggregated Fulfilment Overview

fulfilmentRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const data = await runInTransaction(async (tx) => {
      const packages = await listPackages(tx);
      const openShipments = await listShipments(tx);

      const allGarments = await tx.garments.findMany({
        include: {
          cutting_jobs: {
            include: {
              production_orders: {
                include: { product_spec_versions: true },
              },
            },
          },
          package_items: {
            include: {
              packages: true,
            },
          },
          garment_holds: {
            where: { released_at: null },
          },
          rfid_tag_bindings: {
            where: { unbound_at: null },
          },
        },
        orderBy: { created_at: "desc" },
      });

      const mapGarment = (g: any) => {
        const activeBinding = g.rfid_tag_bindings?.[0];
        const activeHold = g.garment_holds?.[0];
        const activePkgItem = g.package_items?.[0];

        return {
          id: g.id,
          code: g.code,
          orderId: g.production_order_id,
          publicId: g.public_id,
          productName:
            g.cutting_jobs?.production_orders?.product_spec_versions?.product_name ?? "Handcrafted Garment",
          size: g.size_label ?? "M",
          cuttingOutputId: g.cutting_job_id,
          stage: g.stage,
          disposition: g.quality_disposition,
          hold: activeHold
            ? {
                id: activeHold.id,
                reason: activeHold.hold_reason,
                openedAt: activeHold.created_at.toISOString(),
                releasedAt: activeHold.released_at?.toISOString() ?? null,
              }
            : null,
          packageId: activePkgItem?.package_id ?? undefined,
          shipmentId: g.shipment_id ?? undefined,
          rfidUid: activeBinding?.tag_uid ?? undefined,
        };
      };

      const awaitingPacking: any[] = [];
      const packedAwaitingReceipt: any[] = [];
      const inStock: any[] = [];
      const blocked: any[] = [];

      for (const raw of allGarments) {
        const g = mapGarment(raw);
        if (g.hold || g.disposition === "held" || g.disposition === "rejected") {
          blocked.push(g);
        } else if (g.stage === "warehouse" || g.stage === "allocated") {
          inStock.push(g);
        } else if (g.packageId) {
          packedAwaitingReceipt.push(g);
        } else if (g.stage === "finished" && g.disposition === "released") {
          awaitingPacking.push(g);
        }
      }

      return {
        awaitingPacking,
        packedAwaitingReceipt,
        inStock,
        blocked,
        packages,
        openShipments: openShipments.filter((s: any) => s.status !== "departed"),
      };
    });

    return sendSuccess(res, data, 200);
  } catch (err) {
    return sendError(res, err, 500);
  }
});

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

fulfilmentRouter.post("/pack", async (req: Request, res: Response) => {
  try {
    const garmentId = req.body.garmentId;
    if (!garmentId) {
      throw ApiError.badRequest("garmentId is required.");
    }

    const result = await runInTransaction(async (tx) => {
      let packageId = req.body.packageId;
      if (!packageId) {
        const openPkg = await tx.packages.findFirst({
          where: { status: "open" },
          orderBy: { created_at: "desc" },
        });

        if (openPkg) {
          packageId = openPkg.id;
        } else {
          const newPkg = await createPackage(tx, req.actor!, {});
          packageId = (newPkg as any).packageId || newPkg.id;
        }
      }

      return await packGarment(tx, req.actor!, { packageId, garmentId });
    });

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

fulfilmentRouter.post("/receive-stock", async (req: Request, res: Response) => {
  try {
    const garmentId = req.body.garmentId;
    const binId = req.body.binId || "BIN-A1";
    const result = await runInTransaction((tx) =>
      receiveWarehouseStock(tx, req.actor!, { garmentId, binId }),
    );
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

fulfilmentRouter.post("/shipments/:id/verify-dispatch", async (req: Request, res: Response) => {
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

// Station 9: Aggregate Carton Dispatch Scan
fulfilmentRouter.post("/dispatch-box", async (req: Request, res: Response) => {
  try {
    const { boxTagOrId, shipmentId } = req.body as { boxTagOrId?: string; shipmentId?: string };
    if (!boxTagOrId) throw ApiError.badRequest("boxTagOrId is required.");

    const result = await runInTransaction((tx) =>
      dispatchBoxScan(tx, req.actor!, boxTagOrId, shipmentId),
    );
    return sendSuccess(res, result, 200);
  } catch (err) {
    return sendError(res, err, 400);
  }
});

// Create a shipment
fulfilmentRouter.post("/shipments", async (req: Request, res: Response) => {
  try {
    const { carrier, destination, plannedDate, garmentIds } = req.body as {
      carrier?: string;
      destination?: string;
      plannedDate?: string;
      garmentIds?: string[];
    };

    if (!carrier || !destination || !plannedDate) {
      throw ApiError.badRequest("carrier, destination, and plannedDate are required.");
    }

    const result = await runInTransaction(async (tx) => {
      const count = await tx.shipments.count();
      const code = `SHP-${String(count + 1).padStart(3, "0")}`;

      let staffUserId = req.actor!.actorId;
      const staffUser = await tx.staff_users.findUnique({ where: { id: staffUserId } });
      if (!staffUser) {
        const fallback = await tx.staff_users.findFirst({ where: { suspended_at: null } });
        staffUserId = fallback ? fallback.id : staffUserId;
      }

      const shipment = await tx.shipments.create({
        data: {
          code,
          destination_details: { carrier, destination },
          planned_at: new Date(plannedDate),
          status: "draft",
          created_by: staffUserId,
          created_at: new Date(),
        },
      });

      if (Array.isArray(garmentIds) && garmentIds.length > 0) {
        for (const gId of garmentIds) {
          const item = await tx.package_items.findFirst({
            where: { garment_id: gId, removed_at: null },
          });
          if (item) {
            await allocatePackageToShipment(tx, req.actor!, shipment.id, item.package_id);
          }
        }
      }

      return {
        shipmentId: shipment.id,
        code: shipment.code,
        carrier,
        destination,
        status: shipment.status,
      };
    });

    return sendSuccess(res, result, 201);
  } catch (err) {
    return sendError(res, err, 400);
  }
});

// Update shipment plan
fulfilmentRouter.post("/shipments/:id/plan", async (req: Request, res: Response) => {
  try {
    const shipmentId = getParam(req.params["id"]);
    const { garmentIds, markPlanned } = req.body as {
      garmentIds?: string[];
      markPlanned?: boolean;
    };

    const result = await runInTransaction(async (tx) => {
      const shipment = await tx.shipments.findUnique({ where: { id: shipmentId } });
      if (!shipment) throw ApiError.notFound(`Shipment '${shipmentId}' not found.`);

      if (shipment.status === "dispatched") {
        throw ApiError.conflict("Dispatched shipment cannot be updated.");
      }

      if (Array.isArray(garmentIds) && garmentIds.length > 0) {
        for (const gId of garmentIds) {
          const item = await tx.package_items.findFirst({
            where: { garment_id: gId, removed_at: null },
          });
          if (item) {
            const exists = await tx.shipment_packages.findFirst({
              where: {
                shipment_id: shipmentId,
                package_id: item.package_id,
                deallocated_at: null,
              },
            });
            if (!exists) {
              await allocatePackageToShipment(tx, req.actor!, shipmentId, item.package_id);
            }
          }
        }
      }

      if (markPlanned) {
        await tx.shipments.update({
          where: { id: shipmentId },
          data: { status: "approved" },
        });
      }

      return { updated: true, shipmentId };
    });

    return sendSuccess(res, result, 200);
  } catch (err) {
    return sendError(res, err, 400);
  }
});

// Allocate garment to shipment
fulfilmentRouter.post("/shipments/:id/allocate", async (req: Request, res: Response) => {
  try {
    const shipmentId = getParam(req.params["id"]);
    const { garmentId } = req.body as { garmentId?: string };
    if (!garmentId) throw ApiError.badRequest("garmentId is required.");

    const result = await runInTransaction(async (tx) => {
      const item = await tx.package_items.findFirst({
        where: { garment_id: garmentId, removed_at: null },
      });
      if (!item) {
        throw ApiError.badRequest(`Garment '${garmentId}' is not packed in an active package.`);
      }

      await allocatePackageToShipment(tx, req.actor!, shipmentId, item.package_id);

      return { allocated: true, garmentId, shipmentId, packageId: item.package_id };
    });

    return sendSuccess(res, result, 200);
  } catch (err) {
    return sendError(res, err, 400);
  }
});
