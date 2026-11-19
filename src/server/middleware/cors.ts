import cors from "cors";
import { serverConfig } from "../config";
import { ApiError } from "./responses";

/**
 * Creates and configures CORS middleware with strict allowed origin matching.
 */
export function createCorsMiddleware() {
  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. server-to-server, curl, local development tools)
      if (!origin) {
        return callback(null, true);
      }

      const isAllowed = serverConfig.corsAllowedOrigins.includes(origin);
      if (isAllowed) {
        return callback(null, true);
      }

      return callback(
        ApiError.forbidden(
          `CORS policy violation: origin '${origin}' is not authorized.`,
          undefined,
          "WT_ERR_CORS_FORBIDDEN",
        ),
      );
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id", "X-WearTrail-Device"],
    exposedHeaders: ["X-Request-Id"],
    maxAge: 86400, // 24 hours
  });
}
