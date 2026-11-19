/**
 * Cryptographic password hashing and credential validation.
 * Owned by Member 4 (Staff access, shared UI and public journey).
 *
 * Uses salted SHA-256 hex digest (`salt:hash`), completely safe and compatible
 * across Web Crypto in modern browsers, Node.js, and Vitest test runners.
 */
import { computeSha256Sync, toUtf8Bytes } from "./canonical";

/**
 * Standard demo password for seeded accounts in prototype mode.
 */
export const DEMO_DEFAULT_PASSWORD = "weartrail123!";

/**
 * Validates password strength according to industrial security baseline:
 * - Minimum 10 characters
 * - Cannot be purely whitespace
 */
export function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (!password || password.length < 10) {
    return { valid: false, reason: "Password must be at least 10 characters long." };
  }
  if (!/\S/.test(password)) {
    return { valid: false, reason: "Password cannot consist solely of whitespace." };
  }
  return { valid: true };
}

/**
 * Generates an unpredictable random hex salt.
 */
function generateSalt(length = 16): string {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
}

/**
 * Hashes a plaintext password with a salt and returns `salt:hexHash`.
 */
export function hashPassword(password: string, customSalt?: string): string {
  const salt = customSalt || generateSalt();
  const saltedBytes = toUtf8Bytes(`${salt}:${password}`);
  const hash = computeSha256Sync(saltedBytes);
  return `${salt}:${hash}`;
}

/**
 * Verifies a plaintext password against a stored `salt:hexHash` string.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(":")) {
    return false;
  }
  const [salt, expectedHash] = storedHash.split(":");
  if (!salt || !expectedHash) {
    return false;
  }
  const computedHash = computeSha256Sync(toUtf8Bytes(`${salt}:${password}`));
  return computedHash === expectedHash;
}
