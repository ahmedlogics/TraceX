import type { Request, Response, NextFunction } from "express";
import { type ZodSchema, ZodError } from "zod";
import { ApiError } from "./responses";

export interface RequestValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Express middleware helper for validating request body, query params, and route params using Zod.
 * Replaces unvalidated values with the parsed and type-coerced Zod output on success.
 * Aborts with a structured 400 Bad Request error on validation failure.
 */
export function validateRequest(schemas: RequestValidationSchemas) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.query) {
        req.query = (await schemas.query.parseAsync(req.query)) as typeof req.query;
      }
      if (schemas.params) {
        req.params = (await schemas.params.parseAsync(req.params)) as typeof req.params;
      }
      next();
    } catch (err: unknown) {
      if (err instanceof ZodError) {
        const formatted = err.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
          code: issue.code,
        }));
        next(ApiError.badRequest("Request validation failed", formatted, "WT_ERR_VALIDATION_FAILED"));
      } else {
        next(err);
      }
    }
  };
}
