import crypto from "crypto";

/**
 * HMAC-SHA256 signing for the open-tracking pixel URL.
 *
 * The pixel is served unauthenticated (it loads inside recipients' email
 * clients), so the URL must carry a signature that proves it was minted by
 * the server for that specific emailId. Without it, anyone who enumerates
 * emailId values could forge open events and poison campaign metrics
 * (CN-002).
 *
 * The signature is keyed by AUTH_SECRET (NextAuth's session secret) — the
 * same secret already used to sign JWTs — so no new env var is required.
 */

function getSigningKey(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET env var not set (needed for tracking pixel signing)");
  return secret;
}

/** Returns a URL-safe signature for the given emailId. */
export function signEmailId(emailId: string): string {
  return crypto.createHmac("sha256", getSigningKey()).update(emailId).digest("base64url");
}

/**
 * Verifies a signature against an emailId using a constant-time comparison.
 * Returns true on match, false otherwise (never throws on mismatch).
 */
export function verifyEmailId(emailId: string, signature: string | null | undefined): boolean {
  if (!signature) return false;
  try {
    const expected = Buffer.from(signEmailId(emailId));
    const provided = Buffer.from(signature);
    if (expected.length !== provided.length) return false;
    return crypto.timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}
