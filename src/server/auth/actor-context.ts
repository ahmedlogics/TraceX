/**
 * Server-side Staff Authentication & ActorContext Middleware.
 * Owned by Member 4 (Staff access, shared UI and public journey).
 *
 * Implements token/cookie extraction, session evaluation against database/mock records,
 * session revocation/suspension checks, and route authorization guards for Express/Node.
 */
import type { ActorContext, StaffCapabilityGrant } from "@/domain/actor";
import { createActorContext, hasDepartment, hasGrant, hasRole } from "@/domain/actor";
import type { Department, Role, StaffUser } from "@/domain/types";

/**
 * Express-compatible request interface.
 */
export interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string>;
  actor?: ActorContext;
  sessionToken?: string;
}

/**
 * Express-compatible response interface.
 */
export interface ResponseLike {
  status(code: number): this;
  json(body: unknown): this;
}

export type NextFunctionLike = (err?: unknown) => void;

/**
 * Interface for database/store session resolution (mapping to staff_sessions table).
 */
export interface StaffSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
  lastActiveAt: Date;
}

/**
 * Token extractor: extracts bearer token from Authorization header or secure cookie.
 */
export function extractSessionToken(req: RequestLike): string | null {
  const authHeader = req.headers["authorization"] ?? req.headers["Authorization"];
  const authStr = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (authStr && authStr.startsWith("Bearer ")) {
    return authStr.slice(7).trim();
  }
  if (req.cookies && req.cookies["weartrail_session"]) {
    return req.cookies["weartrail_session"];
  }
  return null;
}

/**
 * Express middleware factory: verifies the session and attaches `req.actor`.
 * Re-evaluates session validity on every request so suspensions/revocations take immediate effect.
 */
export function createAuthMiddleware(
  lookupUser: (userId: string) => Promise<StaffUser | null>,
  lookupSession: (
    token: string,
  ) => Promise<{ session: StaffSessionRecord; user: StaffUser } | null>,
) {
  return async (req: RequestLike, res: ResponseLike, next: NextFunctionLike): Promise<void> => {
    try {
      const token = extractSessionToken(req);
      if (!token) {
        res.status(401).json({
          error: "UNAUTHORIZED",
          message: "Authentication required. No session token provided.",
        });
        return;
      }

      const resolved = await lookupSession(token);
      if (!resolved) {
        res.status(401).json({
          error: "INVALID_SESSION",
          message: "Session token is invalid, expired, or revoked.",
        });
        return;
      }

      const { session, user } = resolved;

      // Re-verify user active status
      if (user.status !== "active") {
        res.status(403).json({
          error: "USER_SUSPENDED",
          message: `User account '${user.username}' is ${user.status}. Access denied.`,
        });
        return;
      }

      // Re-check expiry
      if (new Date() > new Date(session.expiresAt) || session.revokedAt) {
        res.status(401).json({
          error: "SESSION_EXPIRED",
          message: "Session has expired or was revoked.",
        });
        return;
      }

      // Attach authoritative ActorContext
      req.actor = createActorContext(user, session.id);
      req.sessionToken = token;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Route guard: requires active authenticated actor.
 */
export function requireActor(req: RequestLike, res: ResponseLike, next: NextFunctionLike): void {
  if (!req.actor) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Authentication required.",
    });
    return;
  }
  next();
}

/**
 * Route guard: requires specific role(s).
 */
export function requireRole(...roles: Role[]) {
  return (req: RequestLike, res: ResponseLike, next: NextFunctionLike): void => {
    if (!req.actor || !hasRole(req.actor, roles)) {
      res.status(403).json({
        error: "FORBIDDEN_ROLE",
        message: `Forbidden: Requires role [${roles.join(", ")}]. Current role: ${req.actor?.role ?? "none"}.`,
      });
      return;
    }
    next();
  };
}

/**
 * Route guard: requires specific department(s).
 */
export function requireDepartment(...departments: Department[]) {
  return (req: RequestLike, res: ResponseLike, next: NextFunctionLike): void => {
    if (!req.actor || !hasDepartment(req.actor, departments)) {
      res.status(403).json({
        error: "FORBIDDEN_DEPARTMENT",
        message: `Forbidden: Requires department [${departments.join(", ")}]. Current department: ${req.actor?.department ?? "none"}.`,
      });
      return;
    }
    next();
  };
}

/**
 * Route guard: requires specific fine-grained capability grant.
 */
export function requireGrant(grant: StaffCapabilityGrant) {
  return (req: RequestLike, res: ResponseLike, next: NextFunctionLike): void => {
    if (!req.actor || !hasGrant(req.actor, grant)) {
      res.status(403).json({
        error: "FORBIDDEN_GRANT",
        message: `Forbidden: Missing required grant '${grant}'.`,
      });
      return;
    }
    next();
  };
}
