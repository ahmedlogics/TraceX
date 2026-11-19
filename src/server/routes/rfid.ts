import { Router, type Request, type Response, type NextFunction } from "express";
import { validateBody } from "../middleware/validation";
import { sendSuccess } from "../middleware/responses";
import { VersionedScanEnvelopeSchema } from "../rfid/schemas";
import { scanRoutingService } from "../rfid/scan-router";
import type { VersionedScanEnvelope } from "../contracts/rfid";

export const rfidRouter = Router();

/**
 * POST /api/rfid/scan
 * Authenticated scan ingestion endpoint called by the USB Serial Bridge or Hardware Simulator.
 *
 * Enforces:
 * - Versioned envelope validation (v1)
 * - Hardware device authentication via Bearer or X-Device-Secret
 * - Active reader mapping and operator session validation
 * - Database-backed idempotency & conflict detection
 * - Atomic two-phase transaction execution
 */
rfidRouter.post(
  "/scan",
  validateBody(VersionedScanEnvelopeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const envelope = req.body as VersionedScanEnvelope;
      const result = await scanRoutingService.dispatchScan(envelope, req.headers);
      return sendSuccess(res, result, 200);
    } catch (err) {
      return next(err);
    }
  },
);
