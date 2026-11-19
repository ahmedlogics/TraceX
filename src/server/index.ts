// Database pool, client, and transaction helpers
export {
  prisma,
  getPrismaClient,
  createPrismaClient,
  disconnectPrisma,
  runInTransaction,
  getPgPool,
  closePgPool,
  type PrismaTransactionClient,
  type DatabasePoolOptions,
} from "./db";

// Configuration
export { serverConfig, getSanitizedConfig, type ServerConfig } from "./config";

// Express App & Server
export { createExpressApp } from "./app";
export { startServer, gracefulShutdown } from "./server";

// Middleware & Response utilities
export {
  ApiError,
  sendSuccess,
  sendError,
  type ApiResponse,
  type ApiSuccessResponse,
  type ApiErrorResponse,
  type ApiErrorDetail,
} from "./middleware/responses";
export { validateRequest, type RequestValidationSchemas } from "./middleware/validation";
export { requestIdMiddleware } from "./middleware/requestId";
export { createCorsMiddleware } from "./middleware/cors";
export { errorHandlerMiddleware, notFoundMiddleware } from "./middleware/errorHandler";

// Domain Services & Routers
export * from "./quality/quality-service";
export * from "./fulfilment/fulfilment-service";
export { qualityRouter } from "./routes/quality";
export { fulfilmentRouter } from "./routes/fulfilment";

// Contracts for Teammates
export * from "./contracts";
