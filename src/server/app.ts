import express, { type Express } from "express";
import { serverConfig } from "./config";
import { requestIdMiddleware } from "./middleware/requestId";
import { createCorsMiddleware } from "./middleware/cors";
import { errorHandlerMiddleware, notFoundMiddleware } from "./middleware/errorHandler";
import { healthRouter } from "./routes/health";
import { rfidRouter } from "./routes/rfid";
import { authRouter } from "./routes/auth";
import { publicRouter } from "./routes/public";
import { staffRouter } from "./routes/staff";

/**
 * Creates and configures the WearTrail Express application.
 * All middleware, routes, request bounds, and error handlers are wired here.
 */
export function createExpressApp(): Express {
  const app = express();

  // 1. Request correlation ID
  app.use(requestIdMiddleware);

  // 2. Strict CORS policy
  app.use(createCorsMiddleware());

  // 3. Bounded request body parsers
  app.use(express.json({ limit: serverConfig.bodyLimit }));
  app.use(express.urlencoded({ extended: false, limit: serverConfig.bodyLimit }));

  // 4. Liveness and Readiness probes
  app.use("/", healthRouter);
  app.use("/api", healthRouter);

  // 5. Staff Authentication & ActorContext (Milestone 1)
  app.use("/api/auth", authRouter);

  // 6. Authenticated RFID Ingestion routes (Ahmed's Backend Live)
  app.use("/api/rfid", rfidRouter);

  // 7. Public Customer Journey & Technical Proof (Milestone 4 - Anonymous)
  app.use("/api/public", publicRouter);

  // 8. Staff Operations, Dashboard, Audit & Reports (Milestone 5 - Protected)
  app.use("/api/staff", staffRouter);

  // 9. Catch unmapped routes
  app.use(notFoundMiddleware);

  // 7. Central error handler
  app.use(errorHandlerMiddleware);

  return app;
}
