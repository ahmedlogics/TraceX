import path from "node:path";
import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { getPgPool, closePgPool } from "./pool";
import type { PrismaTransactionClient } from "./types";

// Explicitly load .env from the application root
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

declare global {
  var __wt_prisma: PrismaClient | undefined;
}

/**
 * Creates a fresh Prisma Client instance configured with the PostgreSQL driver adapter
 * explicitly bound to the private 'supplyease' schema.
 */
export function createPrismaClient(): PrismaClient {
  const pool = getPgPool();
  const adapter = new PrismaPg(pool, {
    schema: "supplyease",
    disposeExternalPool: false,
  });

  return new PrismaClient({
    adapter,
    log: process.env["NODE_ENV"] === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * Returns the singleton Prisma Client instance.
 * Avoids instantiating multiple clients during server execution or hot-reloading.
 */
export function getPrismaClient(): PrismaClient {
  if (!globalThis.__wt_prisma) {
    globalThis.__wt_prisma = createPrismaClient();
  }
  return globalThis.__wt_prisma;
}

/**
 * Shared, server-only Prisma Client instance.
 * Uses a lazy Proxy so importing this module does not throw if DATABASE_URL is not yet configured.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
});

/**
 * Disconnects Prisma Client and terminates the underlying PostgreSQL pool.
 */
export async function disconnectPrisma(): Promise<void> {
  if (globalThis.__wt_prisma) {
    await globalThis.__wt_prisma.$disconnect();
    globalThis.__wt_prisma = undefined;
  }
  await closePgPool();
}

/**
 * Shared transaction helper.
 * Executes the provided callback within an interactive Prisma transaction.
 * If an existing transaction client is supplied, it reuses it instead of starting a new transaction,
 * guaranteeing that domain operations share the exact same atomic transaction boundary.
 */
export async function runInTransaction<T>(
  callback: (tx: PrismaTransactionClient) => Promise<T>,
  existingTx?: PrismaTransactionClient,
): Promise<T> {
  if (existingTx) {
    return callback(existingTx);
  }
  const client = getPrismaClient();
  return client.$transaction(
    async (tx) => {
      return callback(tx as PrismaTransactionClient);
    },
    {
      maxWait: 20000,
      timeout: 60000,
    },
  );
}
