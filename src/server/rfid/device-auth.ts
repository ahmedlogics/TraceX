import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { ApiError } from "../middleware/responses";
import type { PrismaTransactionClient } from "../db/types";

export interface AuthenticatedDevice {
  deviceId: string;
  deviceName: string;
}

/**
 * Extracts the raw device credential secret from request headers.
 * Accepts either:
 * - Authorization: Bearer <secret>
 * - X-Device-Secret: <secret>
 */
export function extractDeviceSecret(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const authHeader = headers["authorization"] ?? headers["Authorization"];
  const authStr = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (authStr && authStr.startsWith("Bearer ")) {
    const token = authStr.slice(7).trim();
    if (token) return token;
  }

  const customHeader = headers["x-device-secret"] ?? headers["X-Device-Secret"];
  const customStr = Array.isArray(customHeader) ? customHeader[0] : customHeader;
  if (customStr && customStr.trim()) {
    return customStr.trim();
  }

  return null;
}

/**
 * Computes the 32-byte SHA-256 digest of a device secret string.
 */
export function hashDeviceSecret(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

/**
 * Authenticates an incoming device request against PostgreSQL device_credentials and devices.
 * Enforces:
 * - Credential must exist matching the SHA-256 digest
 * - Credential must not be revoked (revoked_at IS NULL)
 * - Credential must not be expired (expires_at IS NULL OR expires_at > now)
 * - Device must exist and be enabled (enabled === true)
 * - Claimed device ID in the envelope must match the credential's device_id
 */
export async function authenticateDevice(
  headers: Record<string, string | string[] | undefined>,
  claimedDeviceId: string,
  db: PrismaClient | PrismaTransactionClient,
): Promise<AuthenticatedDevice> {
  const secret = extractDeviceSecret(headers);
  if (!secret) {
    throw ApiError.unauthorized(
      "Device authentication required: missing Bearer token or X-Device-Secret header.",
      undefined,
      "WT_ERR_DEVICE_UNAUTHORIZED",
    );
  }

  const digest = new Uint8Array(hashDeviceSecret(secret));

  const credential = await db.device_credentials.findFirst({
    where: {
      credential_digest: digest,
      revoked_at: null,
      OR: [
        { expires_at: null },
        { expires_at: { gt: new Date() } },
      ],
    },
  });

  if (!credential) {
    throw ApiError.unauthorized(
      "Device credential is invalid, expired, or revoked.",
      undefined,
      "WT_ERR_INVALID_DEVICE_CREDENTIAL",
    );
  }

  const device =
    (credential as any).devices ??
    (await db.devices.findUnique({
      where: { id: credential.device_id },
    }));

  if (!device || !device.enabled) {
    throw ApiError.forbidden(
      `Device '${credential.device_id}' is disabled by factory administration. Access denied.`,
      { deviceId: credential.device_id },
      "WT_ERR_DEVICE_DISABLED",
    );
  }

  if (claimedDeviceId && credential.device_id !== claimedDeviceId) {
    throw ApiError.forbidden(
      `Claimed device identity '${claimedDeviceId}' does not match authenticated credential identity '${credential.device_id}'.`,
      {
        claimedDeviceId,
        authenticatedDeviceId: credential.device_id,
      },
      "WT_ERR_DEVICE_IDENTITY_MISMATCH",
    );
  }

  return {
    deviceId: credential.device_id,
    deviceName: device.name,
  };
}
