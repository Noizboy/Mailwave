import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const MIN_KEY_LENGTH = 32;

// Placeholders documented in .env.example / .env that must never be accepted in
// any environment. Matching these would let anyone decrypt stored secrets.
const PLACEHOLDER_PATTERNS = [
  /^change-me/i,
  /^your-/i,
  /^your_secret_key_here$/i,
  /^test-encryption-key$/i, // legacy test value — kept here so it can't leak into prod
];

let cachedKey: Buffer | null = null;
let cachedKeySource: string | null = null;

/**
 * Derives a 32-byte AES-256 key from the ENCRYPTION_KEY env var via SHA-256.
 *
 * Security rules:
 *  - The env value MUST be at least 32 characters (no zero-padding of short keys).
 *  - Public placeholders ("change-me...", "your-...") are rejected outright.
 *  - The result is cached per-process, keyed by the raw env value, so repeated
 *    calls don't re-hash. If the env value changes (e.g. in tests) the cache
 *    invalidates automatically.
 */
function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error("ENCRYPTION_KEY env var not set");
  if (secret.length < MIN_KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY must be at least ${MIN_KEY_LENGTH} characters (got ${secret.length}). Generate with: openssl rand -hex 16`
    );
  }
  if (PLACEHOLDER_PATTERNS.some((p) => p.test(secret))) {
    throw new Error(
      "ENCRYPTION_KEY is a known placeholder. Generate a real key with: openssl rand -hex 16"
    );
  }
  if (cachedKey && cachedKeySource === secret) return cachedKey;
  cachedKey = crypto.createHash("sha256").update(secret).digest(); // 32 bytes
  cachedKeySource = secret;
  return cachedKey;
}

/** Test-only: clears the cached key. Used by unit tests that rotate env values. */
export function __resetCryptoKeyCache(): void {
  cachedKey = null;
  cachedKeySource = null;
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(ciphertext: string): string {
  const data = Buffer.from(ciphertext, "base64");
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}
