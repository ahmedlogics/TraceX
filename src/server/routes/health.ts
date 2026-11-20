import { Router } from "express";
import { getPrismaClient } from "../db/client";
import { sendSuccess } from "../middleware/responses";

export const healthRouter = Router();

/**
 * Liveness probe: reports whether the Express process is running and receiving traffic.
 * Does not check external dependencies.
 */
healthRouter.get(["/healthz", "/health"], (_req, res) => {
  return sendSuccess(res, {
    status: "ok",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness probe: checks if the server is ready to accept production requests by verifying
 * active PostgreSQL connectivity to the private database schema.
 * Never exposes database hosts, credentials, pool counts or usernames in the response.
 */
healthRouter.get("/ready", async (_req, res) => {
  try {
    const prisma = getPrismaClient();
    // Lightweight query against PostgreSQL session to verify live pool connectivity
    await prisma.$queryRaw`SELECT 1`;

    return sendSuccess(res, {
      status: "ready",
      database: "connected",
    });
  } catch (err: unknown) {
    // Return 503 Service Unavailable when the database is unreachable
    return res.status(503).json({
      success: false,
      error: {
        code: "WT_ERR_SERVICE_UNAVAILABLE",
        message: "Database connectivity check failed; server is not ready.",
      },
      meta: {
        requestId: (res.req as { id?: string })?.id || "unknown",
        timestamp: new Date().toISOString(),
      },
    });
  }
});
