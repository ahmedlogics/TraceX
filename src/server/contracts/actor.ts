import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../middleware/responses";

declare global {
  namespace Express {
    interface Request {
      actor?: ActorContext;
    }
  }
}

/**
 * Staff role enum matching the PostgreSQL database enum `supplyease.staff_role`.
 */
export type StaffRole =
  | "admin"
  | "manager"
  | "materials"
  | "production"
  | "quality"
  | "logistics";

/**
 * Factory department enum matching logical factory operations.
 */
export type Department =
  | "receiving"
  | "raw-store"
  | "cutting"
  | "stitching"
  | "finishing"
  | "quality"
  | "packing"
  | "warehouse"
  | "dispatch";

/**
 * Immutable context representing the authenticated staff user invoking an API operation.
 * Derived strictly server-side from verified session credentials.
 */
export interface ActorContext {
  readonly actorId: string;
  readonly username: string;
  readonly displayName: string;
  readonly role: StaffRole;
  readonly department: Department;
  readonly scope?: string;
  readonly authenticatedAt: Date;
  readonly sessionTokenId?: string;
}

/**
 * Middleware enforcing staff authentication.
 *
 * CRITICAL SECURITY RULE:
 * Protected operations must deny access until real authentication is connected by Member 4.
 * No development bypass, mock override, or unauthenticated fallback is permitted in production routes.
 */
export function requireAuthenticatedActor(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.actor) {
    return next(
      ApiError.unauthorized(
        "Authentication required: staff session token missing or unverified. Authentication service is pending Member 4 integration.",
        undefined,
        "WT_ERR_UNAUTHORIZED",
      ),
    );
  }
  next();
}

/**
 * Middleware enforcing role-based authorization for the authenticated actor.
 */
export function requireRole(allowedRoles: StaffRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.actor) {
      return next(
        ApiError.unauthorized(
          "Authentication required for role verification.",
          undefined,
          "WT_ERR_UNAUTHORIZED",
        ),
      );
    }

    if (!allowedRoles.includes(req.actor.role)) {
      return next(
        ApiError.forbidden(
          `Access forbidden: role '${req.actor.role}' is not authorized for this operation. Required: [${allowedRoles.join(", ")}].`,
          { requiredRoles: allowedRoles, actualRole: req.actor.role },
          "WT_ERR_FORBIDDEN",
        ),
      );
    }

    next();
  };
}

/**
 * Middleware enforcing department alignment for the authenticated actor.
 */
export function requireDepartment(allowedDepts: Department[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.actor) {
      return next(
        ApiError.unauthorized(
          "Authentication required for department verification.",
          undefined,
          "WT_ERR_UNAUTHORIZED",
        ),
      );
    }

    if (!allowedDepts.includes(req.actor.department)) {
      return next(
        ApiError.forbidden(
          `Access forbidden: department '${req.actor.department}' is not authorized for this station. Required: [${allowedDepts.join(", ")}].`,
          { requiredDepartments: allowedDepts, actualDepartment: req.actor.department },
          "WT_ERR_DEPT_FORBIDDEN",
        ),
      );
    }

    next();
  };
}
