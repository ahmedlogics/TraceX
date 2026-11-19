import path from "node:path";
import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { getPgPool, closePgPool } from "./pool";

// Explicitly load .env from the application root
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

declare global {
  // eslint-disable-next-line no-var
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
