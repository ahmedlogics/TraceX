import type { Server } from "node:http";
import { createExpressApp } from "./app";
import { serverConfig, getSanitizedConfig } from "./config";
import { disconnectPrisma } from "./db/client";

let serverInstance: Server | null = null;
let isShuttingDown = false;

/**
 * Initiates graceful shutdown of the HTTP server and database connection pool.
 */
export async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[WearTrail Server] Received ${signal}. Starting graceful shutdown...`);

  // 1. Stop accepting new HTTP connections
  if (serverInstance) {
    await new Promise<void>((resolve) => {
      serverInstance?.close((err) => {
        if (err) {
          console.error("[WearTrail Server] Error closing HTTP server:", err.message);
        } else {
          console.log("[WearTrail Server] HTTP server closed.");
        }
        resolve();
      });
    });
    serverInstance = null;
  }

  // 2. Disconnect Prisma Client and terminate PostgreSQL pool
  try {
    console.log("[WearTrail Server] Closing database connection pool...");
    await disconnectPrisma();
    console.log("[WearTrail Server] Database connections closed.");
  } catch (err: unknown) {
    console.error("[WearTrail Server] Error closing database pool:", (err as Error).message);
  }

  console.log("[WearTrail Server] Graceful shutdown complete. Exiting process.");
}

/**
 * Starts the WearTrail Express REST server.
 */
export function startServer(port: number = serverConfig.port): Promise<Server> {
  return new Promise((resolve, reject) => {
    try {
      const app = createExpressApp();
      serverInstance = app.listen(port, () => {
        console.log("==================================================");
        console.log(` WearTrail Express API Server running on port ${port}`);
        console.log(` Environment: ${serverConfig.nodeEnv}`);
        console.log(" Diagnostics:", JSON.stringify(getSanitizedConfig(), null, 2));
        console.log("==================================================");
        resolve(serverInstance!);
      });

      serverInstance.on("error", (err) => {
        console.error("[WearTrail Server Startup Error]", err.message);
        reject(err);
      });

      // Register process shutdown hooks
      process.on("SIGTERM", () => {
        void gracefulShutdown("SIGTERM").then(() => process.exit(0));
      });
      process.on("SIGINT", () => {
        void gracefulShutdown("SIGINT").then(() => process.exit(0));
      });
    } catch (err) {
      reject(err);
    }
  });
}

// Automatically start if invoked directly via tsx
const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith("server.ts") || process.argv[1].endsWith("server.js"));

if (isDirectExecution) {
  startServer().catch((err) => {
    console.error("Fatal startup error:", err);
    process.exit(1);
  });
}
