import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../db/client";
import {
  authenticateStaff,
  resolveSession,
  revokeSession,
  getCredentialTokenDetails,
  consumeCredentialToken,
  changeStaffPassword,
  revokeOtherStaffSessions,
  SESSION_TTL_MS,
} from "../auth/auth-service";
import { createPrismaAuthMiddleware, extractSessionToken } from "../auth/actor-context";
import { requireAuthenticatedActor, requireRole } from "../contracts/actor";
import { ApiError, sendSuccess } from "../middleware/responses";

export const authRouter = Router();

const prismaAuth = createPrismaAuthMiddleware(prisma);

/**
 * POST /api/auth/login
 * Authenticates staff credentials against PostgreSQL, sets httpOnly session cookie,
 * and returns the session token, user profile, and ActorContext.
 */
authRouter.post(
  "/login",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { username, password } = req.body as { username?: string; password?: string };

      if (!username || typeof username !== "string" || !password || typeof password !== "string") {
        throw ApiError.badRequest(
          "Username and password are required.",
          undefined,
          "WT_ERR_VALIDATION",
        );
      }

      const result = await authenticateStaff(prisma, username, password);

      // Set secure httpOnly cookie
      res.cookie("weartrail_session", result.token, {
        httpOnly: true,
        secure: process.env["NODE_ENV"] === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_TTL_MS,
      });

      sendSuccess(res, {
        token: result.token,
        user: result.user,
        actor: result.actor,
      });
      return;
    } catch (err) {
      next(err);
      return;
    }
  },
);

/**
 * GET /api/auth/me
 * Retrieves current authenticated staff user and authoritative ActorContext.
 */
authRouter.get("/me", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = extractSessionToken(req);
    if (!token) {
      throw ApiError.unauthorized("Authentication required. No session token found.");
    }

    const resolved = await resolveSession(prisma, token);
    if (!resolved) {
      throw ApiError.unauthorized(
        "Session has expired or is invalid.",
        undefined,
        "WT_ERR_INVALID_SESSION",
      );
    }

    sendSuccess(res, {
      user: resolved.user,
      actor: resolved.actor,
    });
    return;
  } catch (err) {
    next(err);
    return;
  }
});

/**
 * POST /api/auth/logout
 * Revokes active session in PostgreSQL and clears the session cookie.
 */
authRouter.post(
  "/logout",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extractSessionToken(req);
      if (token) {
        await revokeSession(prisma, token);
      }

      res.clearCookie("weartrail_session", {
        httpOnly: true,
        secure: process.env["NODE_ENV"] === "production",
        sameSite: "lax",
        path: "/",
      });

      sendSuccess(res, { loggedOut: true });
      return;
    } catch (err) {
      next(err);
      return;
    }
  },
);

/**
 * GET /api/auth/protected-read
 * Milestone 1 verification: Protected read endpoint requiring active ActorContext.
 */
authRouter.get(
  "/protected-read",
  prismaAuth,
  requireAuthenticatedActor,
  (req: Request, res: Response): void => {
    sendSuccess(res, {
      message: "Protected staff data read successfully.",
      actor: req.actor,
    });
  },
);

/**
 * GET /api/auth/protected-admin
 * Milestone 1 verification: Protected endpoint requiring Admin ("admin") role.
 */
authRouter.get(
  "/protected-admin",
  prismaAuth,
  requireAuthenticatedActor,
  requireRole(["admin"]),
  (req: Request, res: Response): void => {
    sendSuccess(res, {
      message: "Administrative privileges confirmed.",
      actor: req.actor,
    });
  },
);

/**
 * GET /api/auth/tokens/:token
 * Anonymous check of a credential invite or reset token.
 */
authRouter.get(
  "/tokens/:token",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = String(req.params["token"] || "").trim();
      const details = await getCredentialTokenDetails(prisma, token);
      sendSuccess(res, details);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/auth/tokens/:token/consume
 * Anonymous consumption of a valid credential token to set password.
 */
authRouter.post(
  "/tokens/:token/consume",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = String(req.params["token"] || "").trim();
      const { newPassword } = req.body as { newPassword?: string };
      if (!newPassword || typeof newPassword !== "string") {
        throw ApiError.badRequest("newPassword is required.", undefined, "WT_ERR_VALIDATION");
      }
      await consumeCredentialToken(prisma, token, newPassword);
      sendSuccess(res, { consumed: true });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/auth/change-password
 * Authenticated staff member changes password.
 */
authRouter.post(
  "/change-password",
  prismaAuth,
  requireAuthenticatedActor,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { currentPassword, newPassword } = req.body as {
        currentPassword?: string;
        newPassword?: string;
      };
      if (!currentPassword || !newPassword) {
        throw ApiError.badRequest(
          "Current and new passwords are required.",
          undefined,
          "WT_ERR_VALIDATION",
        );
      }
      const actor = req.actor!;
      await changeStaffPassword(prisma, actor.actorId, currentPassword, newPassword);
      sendSuccess(res, { changed: true });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/auth/sessions/others
 * Revokes all other sessions for current staff user.
 */
authRouter.delete(
  "/sessions/others",
  prismaAuth,
  requireAuthenticatedActor,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = req.actor!;
      await revokeOtherStaffSessions(prisma, actor.actorId, actor.sessionTokenId);
      sendSuccess(res, { signedOutOthers: true });
    } catch (err) {
      next(err);
    }
  },
);
