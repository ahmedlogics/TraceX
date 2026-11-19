import express, { type Express } from "express";
import { serverConfig } from "./config";
import { requestIdMiddleware } from "./middleware/requestId";
import { createCorsMiddleware } from "./middleware/cors";
import { errorHandlerMiddleware, notFoundMiddleware } from "./middleware/errorHandler";
import { healthRouter } from "./routes/health";

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

  // 5. Catch unmapped routes
  app.use(notFoundMiddleware);

  // 6. Central error handler
  app.use(errorHandlerMiddleware);

  return app;
}
