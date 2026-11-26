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
 * Root index endpoint: provides a clear navigation link to the frontend web app.
 */
healthRouter.get("/", (_req, res) => {
  if (res.req.headers.accept?.includes("text/html")) {
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>TraceX Express API</title></head>
        <body style="font-family: system-ui, -apple-system, sans-serif; padding: 40px; line-height: 1.6; max-width: 600px; margin: 40px auto; color: #1e293b;">
          <h2 style="color: #2B170E;">TraceX Express REST API</h2>
          <p>The backend API service is running on <strong>port 4000</strong>.</p>
          <div style="margin: 24px 0; padding: 16px; background: #f1f5f9; border-radius: 8px;">
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #64748b;">To open the frontend web application, navigate to:</p>
            <a href="http://localhost:8080" style="font-size: 18px; color: #2563eb; font-weight: 600; text-decoration: none;">http://localhost:8080 &rarr;</a>
          </div>
          <p style="font-size: 13px; color: #94a3b8;">If port 8080 is not active, start the frontend in a separate terminal: <code>npm run dev</code></p>
        </body>
      </html>
    `);
  }
  return sendSuccess(res, {
    service: "TraceX Express REST API",
    status: "online",
    apiPort: 4000,
    websiteUrl: "http://localhost:8080",
    message: "Backend API is online. To access the web UI, open http://localhost:8080 in your browser.",
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
