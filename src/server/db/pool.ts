import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";
import type { DatabasePoolOptions } from "./types";

// Explicitly load .env from the application root
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

declare global {
  var __wt_pg_pool: pg.Pool | undefined;
}

/**
 * Returns the shared singleton PostgreSQL connection pool.
 * Uses the restricted runtime DATABASE_URL and attaches process error handling.
 */
export function getPgPool(options?: DatabasePoolOptions): pg.Pool {
  const connectionString = options?.connectionString || process.env["DATABASE_URL"];

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL environment variable is missing. Please configure DATABASE_URL in your backend .env file.",
    );
  }

  if (!globalThis.__wt_pg_pool) {
    const maxVal = process.env["DB_POOL_MAX"];
    globalThis.__wt_pg_pool = new pg.Pool({
      connectionString,
      max: options?.maxConnections ?? (maxVal ? Number.parseInt(maxVal, 10) : 10),
      idleTimeoutMillis: options?.idleTimeoutMillis ?? 30000,
      connectionTimeoutMillis: options?.connectionTimeoutMillis ?? 10000,
    });

    globalThis.__wt_pg_pool.on("error", (err) => {
      // Non-sensitive logging of connection pool errors
      console.error("[WearTrail Database Pool Error]", err.message || "Unknown database error");
    });
  }

  return globalThis.__wt_pg_pool;
}

/**
 * Gracefully terminates the singleton connection pool during server shutdown.
 */
export async function closePgPool(): Promise<void> {
  if (globalThis.__wt_pg_pool) {
    await globalThis.__wt_pg_pool.end();
    globalThis.__wt_pg_pool = undefined;
  }
}
