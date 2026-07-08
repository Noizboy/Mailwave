#!/bin/sh
# Mailwave BullMQ worker entrypoint.
#
# Responsibilities (kept minimal by design — see docs/docker.md):
#   1. Wait for Redis and Postgres to accept connections.
#   2. exec npx tsx jobs/worker.ts so SIGTERM/SIGINT reach the worker
#      process directly (graceful shutdown is handled in jobs/worker.ts).
#
# Migrations are NOT run here — the dedicated one-shot `migrate` service
# owns them to avoid races between scaled worker replicas.
#
# Runs as the non-root `nextjs` user (uid 1001) set in the Dockerfile.
# HOME=/tmp and NPM_CONFIG_CACHE=/tmp/.npm are set in the Dockerfile worker
# stage so npx/npm don't EACCES on a missing home dir.

set -e

REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"

PG_HOST="${POSTGRES_HOST:-postgres}"
PG_PORT="${POSTGRES_PORT:-5432}"

# Parse REDIS_URL for an accurate probe.
if [ -n "${REDIS_URL:-}" ]; then
  rest="${REDIS_URL#*://}"
  authority="${rest%%/*}"
  authority="${authority%%?*}"
  hostport="${authority##*@}"
  if [ -n "$hostport" ]; then
    REDIS_HOST="${hostport%%:*}"
    port_part="${hostport##*:}"
    if [ "$port_part" != "$hostport" ]; then
      REDIS_PORT="$port_part"
    fi
  fi
fi

# Parse DATABASE_URL for an accurate probe.
if [ -n "${DATABASE_URL:-}" ]; then
  rest="${DATABASE_URL#*://}"
  authority="${rest%%/*}"
  authority="${authority%%?*}"
  hostport="${authority##*@}"
  if [ -n "$hostport" ]; then
    PG_HOST="${hostport%%:*}"
    port_part="${hostport##*:}"
    if [ "$port_part" != "$hostport" ]; then
      PG_PORT="$port_part"
    fi
  fi
fi

echo "[worker-entrypoint] waiting for Redis at ${REDIS_HOST}:${REDIS_PORT} and Postgres at ${PG_HOST}:${PG_PORT} ..."

node -e '
const net = require("net");

function probe(host, port, label, max, delayMs) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port }, () => { sock.end(); resolve(true); });
    sock.on("error", () => resolve(false));
  }).then((ok) => ok ? true : (max <= 1 ? false : new Promise((r) => {
    setTimeout(() => probe(host, port, label, max - 1, delayMs).then(r), delayMs);
  })));
}

const max = parseInt(process.env.WAIT_MAX_ATTEMPTS || "60", 10);
const delayMs = parseInt(process.env.WAIT_DELAY_MS || "1000", 10);

Promise.all([
  probe(process.env.REDIS_HOST, parseInt(process.env.REDIS_PORT || "6379", 10), "Redis", max, delayMs),
  probe(process.env.PG_HOST, parseInt(process.env.PG_PORT || "5432", 10), "Postgres", max, delayMs),
]).then(([redisOk, pgOk]) => {
  if (!redisOk) { console.error("[worker-entrypoint] Redis not reachable"); process.exit(1); }
  if (!pgOk)    { console.error("[worker-entrypoint] Postgres not reachable"); process.exit(1); }
  console.log("[worker-entrypoint] Redis and Postgres reachable, starting worker");
});
'

echo "[worker-entrypoint] starting: node_modules/.bin/tsx jobs/worker.ts"
# Call the tsx binary directly instead of `npx tsx` so we don't depend on
# npx's cache being writable (the failure mode that blocked migrate).
exec node_modules/.bin/tsx jobs/worker.ts
