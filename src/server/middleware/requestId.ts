import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

/**
 * Attaches a unique request identifier (UUID v4) to incoming HTTP requests.
 * Uses the client's `X-Request-Id` header if supplied (and valid format); otherwise generates a new UUID.
 * Mirrors the identifier onto the outgoing `X-Request-Id` response header.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers["x-request-id"];
  const isValidHeader =
    typeof incomingId === "string" && /^[a-zA-Z0-9_-]{8,64}$/.test(incomingId);

  const id = isValidHeader ? incomingId : crypto.randomUUID();
  req.id = id;
  res.setHeader("X-Request-Id", id);
  next();
}
