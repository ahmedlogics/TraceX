import type { Response } from "express";

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
    [key: string]: unknown;
  };
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
  meta: {
    requestId: string;
    timestamp: string;
  };
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly details?: unknown;

  public get code(): string {
    return this.errorCode;
  }

  constructor(
    statusCode: number,
    errorCode: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static badRequest(message: string, details?: unknown, code = "WT_ERR_BAD_REQUEST"): ApiError {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(message = "Authentication required", details?: unknown, code = "WT_ERR_UNAUTHORIZED"): ApiError {
    return new ApiError(401, code, message, details);
  }

  static forbidden(message = "Access denied", details?: unknown, code = "WT_ERR_FORBIDDEN"): ApiError {
    return new ApiError(403, code, message, details);
  }

  static notFound(message = "Resource not found", details?: unknown, code = "WT_ERR_NOT_FOUND"): ApiError {
    return new ApiError(404, code, message, details);
  }

  static conflict(message: string, details?: unknown, code = "WT_ERR_CONFLICT"): ApiError {
    return new ApiError(409, code, message, details);
  }

  static unprocessable(message: string, details?: unknown, code = "WT_ERR_UNPROCESSABLE"): ApiError {
    return new ApiError(422, code, message, details);
  }

  static notImplemented(message = "Not implemented", details?: unknown, code = "WT_ERR_NOT_IMPLEMENTED"): ApiError {
    return new ApiError(501, code, message, details);
  }

  static internal(message = "Internal server error", details?: unknown, code = "WT_ERR_INTERNAL"): ApiError {
    return new ApiError(500, code, message, details);
  }
}

/**
 * Sends a standardized JSON success response.
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  extraMeta?: Record<string, unknown>,
): Response<ApiSuccessResponse<T>> {
  const reqId = (res.req as { id?: string })?.id || "unknown";
  return res.status(statusCode).json({
    success: true,
    data,
    meta: {
      requestId: reqId,
      timestamp: new Date().toISOString(),
      ...extraMeta,
    },
  });
}

/**
 * Sends a standardized JSON error response.
 */
export function sendError(
  res: Response,
  err: ApiError | Error | unknown,
  fallbackStatusCode = 500,
  fallbackCode = "WT_ERR_INTERNAL",
): Response<ApiErrorResponse> {
  const reqId = (res.req as { id?: string })?.id || "unknown";
  const timestamp = new Date().toISOString();

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.errorCode,
        message: err.message,
        details: err.details,
      },
      meta: {
        requestId: reqId,
        timestamp,
      },
    });
  }

  const message = err instanceof Error ? err.message : "An unexpected server error occurred";
  return res.status(fallbackStatusCode).json({
    success: false,
    error: {
      code: fallbackCode,
      message,
    },
    meta: {
      requestId: reqId,
      timestamp,
    },
  });
}
