// Brute-force protection / one-shot blocks backed by Redis when available,
// with a graceful in-memory fallback for tests and dev without Redis (CN-004).
//
// The store is keyed by an arbitrary string. For login, the caller must pass
// a key derived from a trusted client identity (e.g. the hosting proxy's
// resolved remote address) — NOT a raw, spoofable X-Forwarded-For header.

import type { Redis } from "ioredis";

interface Entry {
  failures: number;
  blockedUntil: number;
}

const MAX_FAILURES = 5;
const BLOCK_MS = 15 * 60 * 1000; // 15 minutes

// ---- In-memory fallback (single-instance, resets on restart) ---------------
const memoryStore = new Map<string, Entry>();

function memoryIsBlocked(key: string): { blocked: boolean; retryAfterSeconds: number } {
  const entry = memoryStore.get(key);
  if (!entry) return { blocked: false, retryAfterSeconds: 0 };
  if (Date.now() < entry.blockedUntil) {
    return { blocked: true, retryAfterSeconds: Math.ceil((entry.blockedUntil - Date.now()) / 1000) };
  }
  memoryStore.delete(key);
  return { blocked: false, retryAfterSeconds: 0 };
}

function memoryRecordFailure(key: string): void {
  const entry = memoryStore.get(key) ?? { failures: 0, blockedUntil: 0 };
  if (Date.now() >= entry.blockedUntil) entry.failures = 0;
  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES) {
    entry.blockedUntil = Date.now() + BLOCK_MS;
  }
  memoryStore.set(key, entry);
}

function memoryResetFailures(key: string): void {
  memoryStore.delete(key);
}

function memoryMarkBlock(key: string, blockMs: number): void {
  memoryStore.set(key, { failures: MAX_FAILURES, blockedUntil: Date.now() + blockMs });
}

// ---- Redis backend --------------------------------------------------------
let redisClient: Redis | null = null;
let redisInitAttempted = false;

async function getRedis(): Promise<Redis | null> {
  if (redisInitAttempted) return redisClient;
  redisInitAttempted = true;
  const url = process.env.REDIS_URL;
  if (!url) return null; // No Redis configured — use in-memory.
  try {
    // Lazy import so test environments without ioredis installed don't break.
    const IORedis = (await import("ioredis")).default;
    redisClient = new IORedis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    redisClient.on("error", () => {
      // Connection dropped — fall back to in-memory for subsequent calls.
      redisClient = null;
    });
  } catch {
    redisClient = null;
  }
  return redisClient;
}

const FAIL_PREFIX = "rl:fail:";
const BLOCK_PREFIX = "rl:block:";

function ttlSeconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

// ---- Public API (async to support Redis) ---------------------------------

export async function isBlocked(key: string): Promise<{ blocked: boolean; retryAfterSeconds: number }> {
  const redis = await getRedis();
  if (!redis) return memoryIsBlocked(key);
  try {
    const ttl = await redis.pttl(`${BLOCK_PREFIX}${key}`);
    if (ttl > 0) {
      return { blocked: true, retryAfterSeconds: Math.ceil(ttl / 1000) };
    }
    return { blocked: false, retryAfterSeconds: 0 };
  } catch {
    return memoryIsBlocked(key);
  }
}

export async function recordFailure(key: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) {
    memoryRecordFailure(key);
    return;
  }
  try {
    const failKey = `${FAIL_PREFIX}${key}`;
    const count = await redis.incr(failKey);
    if (count === 1) {
      // First failure in the window — set the failure-key TTL to the block window.
      await redis.pexpire(failKey, BLOCK_MS);
    }
    if (count >= MAX_FAILURES) {
      await redis.set(`${BLOCK_PREFIX}${key}`, "1", "PX", BLOCK_MS);
    }
  } catch {
    memoryRecordFailure(key);
  }
}

export async function resetFailures(key: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) {
    memoryResetFailures(key);
    return;
  }
  try {
    await redis.del(`${FAIL_PREFIX}${key}`, `${BLOCK_PREFIX}${key}`);
  } catch {
    memoryResetFailures(key);
  }
}

/**
 * Immediately blocks `key` for `blockMs` milliseconds, regardless of prior
 * failure count. Used by the tracking pixel to record at most one open event
 * per email per window (CN-002).
 */
export async function markBlock(key: string, blockMs: number): Promise<void> {
  const redis = await getRedis();
  if (!redis) {
    memoryMarkBlock(key, blockMs);
    return;
  }
  try {
    await redis.set(`${BLOCK_PREFIX}${key}`, "1", "PX", blockMs);
  } catch {
    memoryMarkBlock(key, blockMs);
  }
}

// ---- Fixed-window rate limiting (max N requests per window) ----------------
//
// Used by API endpoints that need a per-caller request quota (e.g. max 5 SMTP
// tests per minute). Independent from the brute-force block API above — it
// never blocks the caller for long, it just rejects requests past the quota.

interface WindowEntry {
  count: number;
  windowStart: number;
}

const memoryWindowStore = new Map<string, WindowEntry>();

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

function memoryCheckRateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = memoryWindowStore.get(key);
  if (!entry || now >= entry.windowStart + windowMs) {
    memoryWindowStore.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: max - 1, retryAfterSeconds: 0 };
  }
  if (entry.count < max) {
    entry.count += 1;
    return { allowed: true, remaining: max - entry.count, retryAfterSeconds: 0 };
  }
  const retryAfterSeconds = Math.ceil((entry.windowStart + windowMs - now) / 1000);
  return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
}

const WINDOW_PREFIX = "rl:win:";

/**
 * Fixed-window rate limit. Returns `allowed: false` once `max` requests have
 * been recorded for `key` within the last `windowMs`. Call this once per
 * request, before doing any expensive/sensitive work.
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowMs: number
): Promise<RateLimitResult> {
  if (max <= 0) return { allowed: true, remaining: 0, retryAfterSeconds: 0 };
  const redis = await getRedis();
  if (!redis) return memoryCheckRateLimit(key, max, windowMs);
  try {
    const redisKey = `${WINDOW_PREFIX}${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      // First request in the window — set the TTL.
      await redis.pexpire(redisKey, windowMs);
    }
    if (count > max) {
      const ttl = await redis.pttl(redisKey);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((ttl > 0 ? ttl : windowMs) / 1000)),
      };
    }
    return { allowed: true, remaining: max - count, retryAfterSeconds: 0 };
  } catch {
    return memoryCheckRateLimit(key, max, windowMs);
  }
}

/** Test-only: clears all in-memory state and forces Redis re-init on next call. */
export async function __resetRateLimitStore(): Promise<void> {
  memoryStore.clear();
  memoryWindowStore.clear();
  redisInitAttempted = false;
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      // ignore
    }
    redisClient = null;
  }
}
