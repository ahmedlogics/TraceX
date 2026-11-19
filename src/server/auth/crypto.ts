import crypto from "node:crypto";

const SCRYPT_KEY_LEN = 64;
const SALT_LEN = 16;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

function scryptAsync(
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey as Buffer);
    });
  });
}

/**
 * Computes a secure scrypt password hash with a random cryptographic salt.
 * Format: scrypt$<salt_hex>$<hash_hex>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LEN);
  const derivedKey = await scryptAsync(password, salt, SCRYPT_KEY_LEN, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  });

  return `scrypt$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

/**
 * Verifies a plaintext password against a stored scrypt password hash
 * using constant-time equality check to prevent timing attacks.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const parts = storedHash.split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") {
      return false;
    }

    const saltHex = parts[1]!;
    const hashHex = parts[2]!;

    // Validate hex encoding and expected lengths
    if (!/^[0-9a-fA-F]+$/.test(saltHex) || !/^[0-9a-fA-F]+$/.test(hashHex)) {
      return false;
    }

    const salt = Buffer.from(saltHex, "hex");
    const expectedKey = Buffer.from(hashHex, "hex");

    if (salt.length !== SALT_LEN || expectedKey.length !== SCRYPT_KEY_LEN) {
      return false;
    }

    const derivedKey = await scryptAsync(password, salt, SCRYPT_KEY_LEN, {
      N: SCRYPT_COST,
      r: SCRYPT_BLOCK_SIZE,
      p: SCRYPT_PARALLELIZATION,
    });

    return crypto.timingSafeEqual(derivedKey, expectedKey);
  } catch {
    return false;
  }
}

/**
 * Generates a high-entropy session token (32 random bytes, 64 hex characters).
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Computes SHA-256 digest of a session token for secure database storage.
 * The raw token is stored in the client cookie/header, while only the digest
 * is persisted in PostgreSQL (staff_sessions.token_digest Bytes @unique).
 */
export function hashSessionToken(token: string): Buffer {
  return crypto.createHash("sha256").update(token, "utf8").digest();
}
