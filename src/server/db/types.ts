import type { PrismaClient } from "@prisma/client";

/**
 * Type representing the Prisma Client instance passed to an interactive transaction callback ($transaction).
 * Backend domain modules use this type when accepting an optional or mandatory transaction context.
 */
export type PrismaTransactionClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Configuration options for the WearTrail database connection pool.
 */
export interface DatabasePoolOptions {
  connectionString?: string;
  maxConnections?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

