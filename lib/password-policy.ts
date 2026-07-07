import crypto from "crypto";

/**
 * Password policy (CN-011).
 *
 * Based on NIST SP 800-63B recommendations:
 *  - Minimum 12 characters (length is the primary strength lever).
 *  - Maximum 128 characters (prevents bcrypt DoS on absurdly long inputs).
 *  - No composition rules (no required symbols/digits/caps) — NIST found these
 *    counterproductive; length + breach-list check is stronger.
 *  - Breach-list check via the Have I Been Pwned range API (k-anonymity: only
 *    the first 5 hex chars of the SHA-1 hash are sent, never the password or
 *    the full hash).
 *  - Rejects the exact demo password and a few well-known leaked passwords
 *    so a local breach-list outage can't let them through.
 *
 * The breach-list check is best-effort: if the HIBP API is unreachable, the
 * policy still enforces length + local denylist and returns a soft warning
 * rather than blocking the user from setting any password at all.
 */

const MIN_LENGTH = 12;
const MAX_LENGTH = 128;

// Local denylist — always rejected regardless of HIBP availability.
const LOCAL_DENYLIST = new Set([
  "password123",
  "password1234",
  "123456789012",
  "qwerty123456",
  "admin123456",
  "letmein123456",
  "welcome123456",
  "iloveyou123456",
]);

export interface PasswordPolicyResult {
  ok: boolean;
  reason?: string;
  /** True if the breach-list check could not be completed (network). */
  breachCheckSkipped?: boolean;
}

export function validatePasswordLength(password: string): PasswordPolicyResult {
  if (typeof password !== "string" || password.length < MIN_LENGTH) {
    return {
      ok: false,
      reason: `Password must be at least ${MIN_LENGTH} characters long.`,
    };
  }
  if (password.length > MAX_LENGTH) {
    return {
      ok: false,
      reason: `Password must be at most ${MAX_LENGTH} characters long.`,
    };
  }
  return { ok: true };
}

/**
 * Checks a password against the Have I Been Pwned breach database using the
 * k-anonymity range API: only the first 5 hex chars of the SHA-1 hash leave
 * the server. Returns the number of times the password appears in known
 * breaches, or null if the check could not be completed.
 */
export async function checkPasswordBreach(password: string): Promise<number | null> {
  const sha1 = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: controller.signal,
      headers: { "Add-Padding": "true" }, // returns counts even for 0-match entries
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const text = await res.text();
    const lines = text.split("\n");
    for (const line of lines) {
      const [hashSuffix, count] = line.trim().split(":");
      if (hashSuffix === suffix) {
        return parseInt(count, 10) || 0;
      }
    }
    return 0;
  } catch {
    // Network error, timeout, or DNS failure — signal that we couldn't check.
    return null;
  }
}

/**
 * Full password policy validation. Async because the breach-list check hits
 * the network (best-effort, 5s timeout).
 *
 * Returns `{ ok: true }` when the password passes all checks, or
 * `{ ok: false, reason }` when it fails. If the breach-list API is
 * unreachable, the password is still accepted as long as it passes length
 * and the local denylist — `breachCheckSkipped: true` is set so the caller
 * can surface a warning.
 */
export async function validatePassword(password: string): Promise<PasswordPolicyResult> {
  // Local denylist first — catches well-known weak passwords regardless of
  // length, so "password123" (11 chars) is rejected as "too common" rather
  // than slipping past the length check.
  if (LOCAL_DENYLIST.has(password.toLowerCase())) {
    return { ok: false, reason: "This password is too common. Please choose a different one." };
  }

  const lengthCheck = validatePasswordLength(password);
  if (!lengthCheck.ok) return lengthCheck;

  const breachCount = await checkPasswordBreach(password);
  if (breachCount === null) {
    // Couldn't reach HIBP — accept with a warning (length + denylist passed).
    return { ok: true, breachCheckSkipped: true };
  }
  if (breachCount > 0) {
    return {
      ok: false,
      reason: `This password has appeared in known data breaches (>${breachCount} times). Please choose a different one.`,
    };
  }

  return { ok: true };
}
