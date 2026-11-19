import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../db/client";
import { createPrismaAuthMiddleware } from "../auth/actor-context";
import { requireAuthenticatedActor, requireRole } from "../contracts/actor";
import { ApiError, sendSuccess } from "../middleware/responses";
import {
  getStaffDashboard,
  getStaffAuditTrail,
  getStaffOperationalReports,
  listStaffUsers,
  inviteStaffUser,
  updateStaffUserScope,
  setStaffUserSuspended,
  issueStaffResetToken,
} from "../staff/staff-service";
import type { Role, Department, StaffUser } from "@/domain/types";

export const staffRouter = Router();

const prismaAuth = createPrismaAuthMiddleware(prisma);

// All staff endpoints require valid authentication
staffRouter.use(prismaAuth);
staffRouter.use(requireAuthenticatedActor);

/**
 * Helper to retrieve the authenticated StaffUser DTO from request.
 */
function getStaffUser(req: Request): StaffUser {
  const staffUser = (req as unknown as { staffUser?: StaffUser }).staffUser;
  if (!staffUser) {
    throw ApiError.unauthorized("Authentication required.");
  }
  return staffUser;
}

/**
 * GET /api/staff/dashboard
 * Scoped dashboard metrics, assigned work queue, and operational exceptions.
 */
staffRouter.get(
  "/dashboard",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getStaffUser(req);
      const dashboard = await getStaffDashboard(prisma, user);
      sendSuccess(res, dashboard);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/staff/audit
 * Immutable activity trail scoped by actor role.
 */
staffRouter.get(
  "/audit",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getStaffUser(req);
      const trail = await getStaffAuditTrail(prisma, user);
      sendSuccess(res, trail);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/staff/reports
 * Operational throughput, quality disposition, and commitment metrics.
 */
staffRouter.get(
  "/reports",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getStaffUser(req);
      const reports = await getStaffOperationalReports(prisma, user);
      sendSuccess(res, reports);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/staff/users
 * Personnel directory and administrative user list.
 */
staffRouter.get(
  "/users",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getStaffUser(req);
      const users = await listStaffUsers(prisma, user);
      sendSuccess(res, users);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/staff/settings
 * Device hardware and operational business configuration.
 */
staffRouter.get(
  "/settings",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stations = await prisma.rfid_stations.findMany({
        include: { checkpoints: true },
        orderBy: { workflow_position: "asc" },
      });

      const checkpoints = stations.map((st) => ({
        sensor: `sensor-${st.workflow_position}` as any,
        label: st.name,
        department: st.checkpoints?.department_code ? (st.checkpoints.department_code as any) : "receiving",
        stationCode: st.code as any,
        stationName: st.name,
        enabled: true,
        verified: true,
        measuredReaderIndex: st.workflow_position,
      }));

      sendSuccess(res, {
        device: {
          boardId: "esp32-bridge-01",
          firmware: "1.4.2-wt",
          status: "online",
          mappingVersion: 1,
        },
        checkpoints,
        business: {
          defaultCarrier: "Authorized Retail Logistics",
          reinspectionRequiredAfterRework: true,
          publicJourneyEnabled: true,
          shipmentCutoff: "16:00",
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/staff/users/invite
 * Administrator invites a new staff member.
 */
staffRouter.post(
  "/users/invite",
  requireRole(["admin"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = getStaffUser(req);
      const { username, displayName, role, department } = req.body as {
        username?: string;
        displayName?: string;
        role?: Role;
        department?: Department;
      };

      if (!username || !displayName || !role || !department) {
        throw ApiError.badRequest(
          "Username, displayName, role, and department are required.",
          undefined,
          "WT_ERR_VALIDATION",
        );
      }

      const inviteToken = await inviteStaffUser(prisma, actor, {
        username,
        displayName,
        role,
        department,
      });

      sendSuccess(res, { inviteToken }, 201);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/staff/users/:id/scope
 * Administrator updates a staff member's role or department.
 */
staffRouter.patch(
  "/users/:id/scope",
  requireRole(["admin"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = getStaffUser(req);
      const userId = String(req.params["id"] || "").trim();
      const { role, department } = req.body as {
        role?: Role;
        department?: Department;
      };

      if (!userId || !role || !department) {
        throw ApiError.badRequest(
          "Target userId, role, and department are required.",
          undefined,
          "WT_ERR_VALIDATION",
        );
      }

      await updateStaffUserScope(prisma, actor, {
        userId,
        role,
        department,
      });

      sendSuccess(res, { updated: true });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/staff/users/:id/suspend
 * Administrator suspends or unsuspends a staff member.
 */
staffRouter.patch(
  "/users/:id/suspend",
  requireRole(["admin"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = getStaffUser(req);
      const userId = String(req.params["id"] || "").trim();
      const { suspended } = req.body as { suspended?: boolean };

      if (!userId || typeof suspended !== "boolean") {
        throw ApiError.badRequest(
          "Target userId and boolean suspended flag are required.",
          undefined,
          "WT_ERR_VALIDATION",
        );
      }

      await setStaffUserSuspended(prisma, actor, userId, suspended);

      sendSuccess(res, { suspended });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/staff/users/:id/reset-token
 * Administrator generates a credential reset link token for a staff user.
 */
staffRouter.post(
  "/users/:id/reset-token",
  requireRole(["admin"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = getStaffUser(req);
      const userId = String(req.params["id"] || "").trim();

      if (!userId) {
        throw ApiError.badRequest("Target userId is required.", undefined, "WT_ERR_VALIDATION");
      }

      const token = await issueStaffResetToken(prisma, actor, userId);
      sendSuccess(res, { token });
    } catch (err) {
      next(err);
    }
  },
);
