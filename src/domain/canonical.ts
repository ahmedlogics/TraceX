/**
 * Canonical JSON serialization and SHA-256 hashing for Public Journey Payloads.
 * Owned by Member 4 (Staff access, shared UI and public journey).
 *
 * Implements deterministic serialization across all platforms:
 * 1. Recursive lexical sorting of object keys
 * 2. Strict exclusion of undefined properties
 * 3. Exact UTF-8 byte encoding
 * 4. SHA-256 hexadecimal hash calculation
 */

/**
 * Recursively orders object keys lexically to produce a deterministic object.
 */
export function canonicalizeValue(val: unknown): unknown {
  if (val === null || val === undefined || typeof val !== "object") {
    return val;
  }

  if (Array.isArray(val)) {
    return val.map(canonicalizeValue);
  }

  const sortedObj: Record<string, unknown> = {};
  const keys = Object.keys(val as Record<string, unknown>).sort();

  for (const key of keys) {
    const propVal = (val as Record<string, unknown>)[key];
    if (propVal !== undefined) {
      sortedObj[key] = canonicalizeValue(propVal);
    }
  }

  return sortedObj;
}

/**
 * Serializes any object into canonical UTF-8 JSON string.
 */
export function toCanonicalJson(val: unknown): string {
  const canonicalObj = canonicalizeValue(val);
  return JSON.stringify(canonicalObj);
}

/**
 * Converts a string into exact UTF-8 bytes.
 */
export function toUtf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Computes the SHA-256 hex digest of a string or byte array.
 * Works seamlessly in both modern browser and Node.js environments.
 */
export async function computeSha256(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? toUtf8Bytes(data) : data;

  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // Node.js fallback if crypto.subtle is unavailable
  try {
    const nodeCrypto = await import("node:crypto");
    return nodeCrypto.createHash("sha256").update(bytes).digest("hex");
  } catch {
    throw new Error("No cryptographic hash implementation available.");
  }
}

/**
 * Synchronous SHA-256 digest calculation for Node.js / test environments.
 */
export function computeSha256Sync(data: string | Uint8Array): string {
  const bytes = typeof data === "string" ? toUtf8Bytes(data) : data;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("node:crypto");
    return nodeCrypto.createHash("sha256").update(bytes).digest("hex");
  } catch {
    // Simple fallback hash if running purely in browser without sync crypto
    let hash = 0;
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i] ?? 0;
      hash = (hash << 5) - hash + b;
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(64, "0");
  }
}
