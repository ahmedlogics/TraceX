import express, { type Express } from "express";
import { serverConfig } from "./config";
import { requestIdMiddleware } from "./middleware/requestId";
import { createCorsMiddleware } from "./middleware/cors";
import { errorHandlerMiddleware, notFoundMiddleware } from "./middleware/errorHandler";
import { healthRouter } from "./routes/health";
import { materialsRouter } from "./routes/materials";
import { productionRouter } from "./routes/production";
import { tasksRouter } from "./routes/tasks";
import { rfidRouter } from "./routes/rfid";
import { qualityRouter } from "./routes/quality";
import { fulfilmentRouter } from "./routes/fulfilment";
import { authRouter } from "./routes/auth";
import { publicRouter } from "./routes/public";
import { staffRouter } from "./routes/staff";
import { registerMember2ScanHandlers } from "./rfid/domain-handlers";
import { registerMember3ScanHandlers } from "./rfid/quality-fulfilment-handlers";

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

  // 5. Staff Authentication & ActorContext (Member 4)
  app.use("/api/auth", authRouter);

  // 6. Public Customer Journey & Technical Proof (Member 4 - Anonymous)
  app.use("/api/public", publicRouter);

  // 7. Authenticated RFID Ingestion routes & Domain Handlers (Members 1, 2, 3)
  registerMember2ScanHandlers();
  registerMember3ScanHandlers();
  app.use("/api/rfid", rfidRouter);

  // 8. Domain Routers (Members 2 & 3)
  app.use("/api/materials", materialsRouter);
  app.use("/api/production", productionRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/quality", qualityRouter);
  app.use("/api/fulfilment", fulfilmentRouter);

  // 9. Staff Operations, Dashboard, Audit & Reports (Member 4 - Protected)
  app.use("/api/staff", staffRouter);

  // 10. Catch unmapped routes
  app.use(notFoundMiddleware);

  // 8. Central error handler
  app.use(errorHandlerMiddleware);

  return app;
}
