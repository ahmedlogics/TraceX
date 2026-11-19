import { Router, type Request, type Response, type NextFunction } from "express";
import {
  listSuppliers,
  listLots,
  getLotDetail,
  receiveMaterialLot,
  bindLotCard,
  issueMaterial,
  returnMaterial,
} from "../materials/materials-service";
import { sendSuccess } from "../middleware/responses";
import { requireAuthenticatedActor } from "../contracts/actor";

export const materialsRouter = Router();

// GET /api/materials/suppliers — list active suppliers
materialsRouter.get(
  "/suppliers",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const suppliers = await listSuppliers();
      sendSuccess(res, suppliers);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/materials/lots — list material lots
materialsRouter.get(
  "/lots",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const statusParam = req.query["status"];
      const supplierIdParam = req.query["supplierId"];
      const lots = await listLots(req.actor, {
        status: typeof statusParam === "string" ? statusParam : undefined,
        supplierId: typeof supplierIdParam === "string" ? supplierIdParam : undefined,
      });
      sendSuccess(res, lots);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/materials/lots/:id — get lot detail with stock movements
materialsRouter.get(
  "/lots/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lotId = req.params["id"] as string;
      const lot = await getLotDetail(lotId, req.actor);
      if (!lot) {
        res.status(404).json({
          success: false,
          error: { code: "WT_ERR_NOT_FOUND", message: `Lot ${lotId} not found.` },
        });
        return;
      }
      sendSuccess(res, lot);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/materials/lots — receive fabric bundle lot
materialsRouter.post(
  "/lots",
  requireAuthenticatedActor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await receiveMaterialLot(
        {
          materialName: req.body.materialName || req.body.material,
          supplierId: req.body.supplierId,
          supplierCode: req.body.supplierCode,
          supplierName: req.body.supplierName,
          supplierRef: req.body.supplierRef,
          receiptRef: req.body.receiptRef,
          quantity: Number(req.body.quantity ?? req.body.qty),
          unit: req.body.unit,
          tagUid: req.body.tagUid,
        },
        req.actor,
      );
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/materials/lots/:id/bind-card — assign physical bundle RFID card
materialsRouter.post(
  "/lots/:id/bind-card",
  requireAuthenticatedActor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lotId = req.params["id"] as string;
      const result = await bindLotCard(
        {
          lotId,
          tagUid: req.body.tagUid || req.body.uid,
        },
        req.actor,
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/materials/lots/:id/issues — issue fabric to production order
materialsRouter.post(
  "/lots/:id/issues",
  requireAuthenticatedActor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lotId = req.params["id"] as string;
      const result = await issueMaterial(
        {
          lotId,
          orderId: req.body.orderId,
          quantity: Number(req.body.quantity ?? req.body.qty),
          reason: req.body.reason,
        },
        req.actor,
      );
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/materials/issues/:id/return — return unused fabric to lot
materialsRouter.post(
  "/issues/:id/return",
  requireAuthenticatedActor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const issueId = req.params["id"] as string;
      const result = await returnMaterial(
        {
          issueId,
          quantity: Number(req.body.quantity ?? req.body.qty),
          reason: req.body.reason,
        },
        req.actor,
      );
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);
