import type { Request, Response, NextFunction } from "express";
import { ApiError, sendError } from "./responses";
import { serverConfig } from "../config";

/**
 * Strips potentially sensitive credentials or connection tokens from logged error messages.
 */
function sanitizeErrorMessage(msg: string): string {
  return msg
    .replace(/(?:password|token|secret|key|authorization)=([^&\s]+)/gi, "$1=******")
    .replace(/(?:Bearer)\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer ******")
    .replace(/postgresql:\/\/[^:]+:[^@]+@/gi, "postgresql://******:******@");
}

/**
 * Central Express error handling middleware.
 * Guarantees consistent JSON error envelopes, request correlation via requestId,
 * sanitized diagnostic console logs, and protection of server internals in production.
 */
export function errorHandlerMiddleware(
  err: Error | ApiError | unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const reqId = req.id || "unknown";
  const method = req.method;
  const path = req.originalUrl || req.url;

  if (err instanceof ApiError) {
    // Expected application errors
    if (err.statusCode >= 500) {
      console.error(
        `[WT_SERVER_ERROR] [${reqId}] ${method} ${path} -> ${err.statusCode} (${err.errorCode}):`,
        sanitizeErrorMessage(err.message),
      );
    } else {
      console.warn(
        `[WT_CLIENT_WARN] [${reqId}] ${method} ${path} -> ${err.statusCode} (${err.errorCode}):`,
        sanitizeErrorMessage(err.message),
      );
    }
    sendError(res, err);
    return;
  }

  // Unhandled / Unexpected runtime error
  const standardError = err instanceof Error ? err : new Error(String(err));
  const sanitizedMsg = sanitizeErrorMessage(standardError.message);

  console.error(
    `[WT_UNHANDLED_ERROR] [${reqId}] ${method} ${path} -> 500 (WT_ERR_INTERNAL):`,
    sanitizedMsg,
    serverConfig.nodeEnv !== "production" ? standardError.stack : undefined,
  );

  const clientMessage =
    serverConfig.nodeEnv === "production"
      ? "An unexpected internal server error occurred"
      : sanitizedMsg;

  const publicError = new ApiError(500, "WT_ERR_INTERNAL", clientMessage);
  sendError(res, publicError);
}

/**
 * 404 Not Found fallback middleware for unmapped API endpoints.
 */
export function notFoundMiddleware(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Endpoint not found: ${req.method} ${req.originalUrl || req.url}`));
}
