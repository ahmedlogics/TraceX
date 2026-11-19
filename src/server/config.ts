import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Load .env explicitly from application root
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const ServerConfigSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(4000),
  nodeEnv: z.enum(["development", "test", "production"]).default("development"),
  bodyLimit: z.string().default("1mb"),
  corsAllowedOrigins: z
    .string()
    .default(
      "http://localhost:3000,http://localhost:5173,http://localhost:8080,http://127.0.0.1:3000,http://127.0.0.1:5173,http://127.0.0.1:8080",
    )
    .transform((val) =>
      val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  bridgeSharedSecret: z.string().min(16).optional(),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

function loadConfig(): ServerConfig {
  const raw = {
    port: process.env["WEARTRAIL_PORT"] || process.env["PORT"] || 4000,
    nodeEnv: process.env["NODE_ENV"] || "development",
    bodyLimit: process.env["BODY_LIMIT"] || "1mb",
    corsAllowedOrigins: process.env["CORS_ALLOWED_ORIGINS"],
    bridgeSharedSecret: process.env["BRIDGE_SHARED_SECRET"],
  };

  const parsed = ServerConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => ` - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`[WearTrail Configuration Error] Invalid server environment:\n${issues}`);
  }

  return parsed.data;
}

export const serverConfig = loadConfig();

/**
 * Returns a sanitized copy of server configuration for safe diagnostic logging.
 * Secrets such as bridgeSharedSecret and credentials are strictly masked.
 */
export function getSanitizedConfig(config: ServerConfig = serverConfig): Record<string, unknown> {
  return {
    port: config.port,
    nodeEnv: config.nodeEnv,
    bodyLimit: config.bodyLimit,
    corsAllowedOrigins: config.corsAllowedOrigins,
    bridgeSharedSecretConfigured: Boolean(config.bridgeSharedSecret),
  };
}
