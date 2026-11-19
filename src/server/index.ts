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

// Contracts for Teammates
export * from "./contracts";

// RFID Scan Ingestion, Routing & Simulation
export {
  scanRoutingService,
  ScanRoutingService,
} from "./rfid/scan-router";
export {
  VersionedScanEnvelopeSchema,
  type ValidatedScanEnvelope,
} from "./rfid/schemas";
export {
  authenticateDevice,
  extractDeviceSecret,
  hashDeviceSecret,
  type AuthenticatedDevice,
} from "./rfid/device-auth";
export {
  resolveReaderSession,
  isOperatorAuthorizedForStation,
  type ResolvedReaderSession,
} from "./rfid/session-resolver";
export {
  validateActionContext,
  stationRequiresContext,
} from "./rfid/context-validator";
export {
  checkExistingScan,
  computeRequestFingerprint,
  existingScanToOutcome,
  type ExistingScanEvaluation,
} from "./rfid/deduplication";
export {
  buildSimulatedEnvelope,
  dispatchSimulatedScanHttp,
  type SimulateScanOptions,
  type SimulationResult,
} from "./rfid/simulator";
export { rfidRouter } from "./routes/rfid";
