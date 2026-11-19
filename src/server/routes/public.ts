import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../db/client";
import { getPublicJourney, getPublicProof } from "../public/public-service";
import { ApiError, sendSuccess } from "../middleware/responses";

export const publicRouter = Router();

function getParamString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value) && typeof value[0] === "string") return value[0].trim();
  return "";
}

/**
 * GET /api/public/journey/:publicId
 * Anonymous endpoint: Shoppers access garment provenance without authentication.
 */
publicRouter.get(
  "/journey/:publicId",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const publicId = getParamString(req.params["publicId"]);

      if (!publicId) {
        throw ApiError.badRequest(
          "Public garment ID is required.",
          undefined,
          "WT_ERR_INVALID_PUBLIC_ID",
        );
      }

      const journey = await getPublicJourney(prisma, publicId);

      if (!journey) {
        throw ApiError.notFound(
          `Garment public record '${publicId}' was not found.`,
          { publicId },
          "WT_ERR_NOT_FOUND",
        );
      }

      sendSuccess(res, journey);
      return;
    } catch (err) {
      next(err);
      return;
    }
  },
);

/**
 * GET /api/public/proof/:publicId
 * Anonymous endpoint: Provides technical cryptographic proof and canonical JSON payload.
 */
publicRouter.get(
  "/proof/:publicId",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const publicId = getParamString(req.params["publicId"]);

      if (!publicId) {
        throw ApiError.badRequest(
          "Public garment ID is required.",
          undefined,
          "WT_ERR_INVALID_PUBLIC_ID",
        );
      }

      const proof = await getPublicProof(prisma, publicId);

      if (!proof) {
        throw ApiError.notFound(
          `Cryptographic proof record for '${publicId}' was not found.`,
          { publicId },
          "WT_ERR_NOT_FOUND",
        );
      }

      sendSuccess(res, proof);
      return;
    } catch (err) {
      next(err);
      return;
    }
  },
);

/**
 * GET /api/public/download/:publicId
 * Anonymous endpoint: Downloads the exact canonical JSON payload as a file.
 */
publicRouter.get(
  "/download/:publicId",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const publicId = getParamString(req.params["publicId"]);
      if (!publicId) {
        throw ApiError.badRequest(
          "Public garment ID is required.",
          undefined,
          "WT_ERR_INVALID_PUBLIC_ID",
        );
      }

      const proof = await getPublicProof(prisma, publicId);
      if (!proof) {
        throw ApiError.notFound(
          `Public record for '${publicId}' was not found.`,
          { publicId },
          "WT_ERR_NOT_FOUND",
        );
      }

      const filename = `${proof.publicId}-v${proof.version}-public-payload.json`;
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.send(JSON.stringify(proof.payload, null, 2));
      return;
    } catch (err) {
      next(err);
      return;
    }
  },
);
