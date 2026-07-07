// In-memory brute-force protection — resets on server restart.
// For multi-instance deployments, replace with a Redis-backed store.

interface Entry {
  failures: number;
  blockedUntil: number;
}

const store = new Map<string, Entry>();

const MAX_FAILURES = 5;
const BLOCK_MS = 15 * 60 * 1000; // 15 minutes

export function isBlocked(key: string): { blocked: boolean; retryAfterSeconds: number } {
  const entry = store.get(key);
  if (!entry) return { blocked: false, retryAfterSeconds: 0 };
  if (Date.now() < entry.blockedUntil) {
    return { blocked: true, retryAfterSeconds: Math.ceil((entry.blockedUntil - Date.now()) / 1000) };
  }
  // Block expired — clean up
  store.delete(key);
  return { blocked: false, retryAfterSeconds: 0 };
}

export function recordFailure(key: string): void {
  const entry = store.get(key) ?? { failures: 0, blockedUntil: 0 };
  // If a previous block expired, restart the counter
  if (Date.now() >= entry.blockedUntil) entry.failures = 0;
  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES) {
    entry.blockedUntil = Date.now() + BLOCK_MS;
  }
  store.set(key, entry);
}

export function resetFailures(key: string): void {
  store.delete(key);
}
