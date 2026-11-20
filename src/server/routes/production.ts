import { Router, type Request, type Response, type NextFunction } from "express";
import {
  listProductSpecs,
  saveProductSpec,
  listOrders,
  getOrderDetail,
  createProductionOrder,
  approveProductionOrder,
  confirmCuttingSource,
  bindGarmentTag,
  replaceGarmentCard,
  routineProductionScan,
  listGarments,
  getGarmentDetail,
} from "../production/production-service";
import { sendSuccess } from "../middleware/responses";
import { requireAuthenticatedActor } from "../contracts/actor";

export const productionRouter = Router();

// GET /api/production/specs — list product specifications
productionRouter.get(
  "/specs",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const specs = await listProductSpecs();
      sendSuccess(res, specs);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/production/specs — save product specification
productionRouter.post(
  "/specs",
  requireAuthenticatedActor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const specId = await saveProductSpec(req.body, req.actor);
      sendSuccess(res, { specId }, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/production/orders — list production orders
productionRouter.get(
  "/orders",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const statusParam = req.query["status"];
      const orders = await listOrders(req.actor, {
        status: typeof statusParam === "string" ? statusParam : undefined,
      });
      sendSuccess(res, orders);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/production/orders/:id — get order detail
productionRouter.get(
  "/orders/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orderId = req.params["id"] as string;
      const order = await getOrderDetail(orderId, req.actor);
      if (!order) {
        res.status(404).json({
          success: false,
          error: { code: "WT_ERR_NOT_FOUND", message: `Order ${orderId} not found.` },
        });
        return;
      }
      sendSuccess(res, order);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/production/orders — create digital production order
productionRouter.post(
  "/orders",
  requireAuthenticatedActor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await createProductionOrder(
        {
          product: req.body.product,
          styleCode: req.body.styleCode,
          qty: Number(req.body.qty ?? req.body.quantity),
          dueDate: req.body.dueDate,
          workflowVersionId: req.body.workflowVersionId,
        },
        req.actor,
      );
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/production/orders/:id/approve — approve production order
productionRouter.post(
  "/orders/:id/approve",
  requireAuthenticatedActor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orderId = req.params["id"] as string;
      const result = await approveProductionOrder(orderId, req.actor);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/production/orders/:id/cutting-outputs — record cutting output (dashboard fallback)
productionRouter.post(
  "/orders/:id/cutting-outputs",
  requireAuthenticatedActor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orderId = req.params["id"] as string;
      const { issueId, fabricUsed, size, tagUid } = req.body as {
        issueId: string;
        fabricUsed?: number;
        size?: string;
        tagUid?: string;
      };

      // Generate a valid 14-hex uppercase UID if none supplied
      const effectiveUid = tagUid
        ? String(tagUid).trim().toUpperCase()
        : "E0" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();

      const sourceResult = await confirmCuttingSource(
        {
          orderId,
          issueId,
          consumedQty: Number(fabricUsed || 1),
          tagUid: undefined,
        },
        req.actor,
      );

      const bindResult = await bindGarmentTag(
        {
          orderId,
          cuttingJobId: sourceResult.cuttingJobId,
          cuttingSourceSelectionId: sourceResult.cuttingInputId,
          size: size || "M",
          tagUid: effectiveUid,
          fabricUsed: Number(fabricUsed || 1),
        },
        req.actor,
      );

      sendSuccess(res, bindResult.garmentCode, 201);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/production/cutting/select-source — lock confirmed cutting source
productionRouter.post(
  "/cutting/select-source",
  requireAuthenticatedActor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await confirmCuttingSource(
        {
          orderId: req.body.orderId,
          issueId: req.body.issueId,
          consumedQty: Number(req.body.consumedQty),
          wasteQty: req.body.wasteQty ? Number(req.body.wasteQty) : undefined,
          tagUid: req.body.tagUid || req.body.uid,
          readerSessionId: req.body.readerSessionId,
        },
        req.actor,
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/production/cutting/bind-garment — bind fresh card to new cut garment
productionRouter.post(
  "/cutting/bind-garment",
  requireAuthenticatedActor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await bindGarmentTag(
        {
          cuttingSourceSelectionId: req.body.cuttingSourceSelectionId,
          cuttingJobId: req.body.cuttingJobId,
          orderId: req.body.orderId,
          size: req.body.size,
          tagUid: req.body.tagUid || req.body.uid,
          fabricUsed: req.body.fabricUsed !== undefined ? Number(req.body.fabricUsed) : undefined,
        },
        req.actor,
      );
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/production/garments — list garments
productionRouter.get(
  "/garments",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stageParam = req.query["stage"];
      const orderIdParam = req.query["orderId"];
      const garments = await listGarments(req.actor, {
        stage: typeof stageParam === "string" ? stageParam : undefined,
        orderId: typeof orderIdParam === "string" ? orderIdParam : undefined,
      });
      sendSuccess(res, garments);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/production/garments/:id — get garment detail and history
productionRouter.get(
  "/garments/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const garmentId = req.params["id"] as string;
      const garment = await getGarmentDetail(garmentId, req.actor);
      if (!garment) {
        res.status(404).json({
          success: false,
          error: { code: "WT_ERR_NOT_FOUND", message: `Garment ${garmentId} not found.` },
        });
        return;
      }
      sendSuccess(res, garment);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/production/garments/:id/replace-card — replace lost/damaged RFID card
productionRouter.post(
  "/garments/:id/replace-card",
  requireAuthenticatedActor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const garmentId = req.params["id"] as string;
      const result = await replaceGarmentCard(
        {
          garmentId,
          newUid: req.body.newUid || req.body.tagUid,
          reason: req.body.reason,
        },
        req.actor,
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/production/routine-scan — routine assembly scan at stitching/finishing
productionRouter.post(
  "/routine-scan",
  requireAuthenticatedActor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await routineProductionScan(
        {
          tagUid: req.body.tagUid || req.body.uid,
          stationCode: req.body.stationCode,
        },
        req.actor,
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);
