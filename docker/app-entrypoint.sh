#!/bin/sh
# Mailwave app container entrypoint.
#
# Responsibilities (kept minimal by design — see docs/docker.md):
#   1. Wait for Postgres to accept connections (defensive; depends_on already
#      guarantees service_healthy, but this also covers manual `docker run`).
#   2. exec node server.js so signals reach the Next.js process directly.
#
# Migrations are NOT run here. The dedicated one-shot `migrate` service owns
# migrations (see docker-compose.yml) to avoid races between scaled app
# replicas. If you run the app outside compose, run `npx prisma migrate deploy`
# (or `npx prisma db push` when no migrations exist) before starting it.
#
# Runs as the non-root `nextjs` user (uid 1001) set in the Dockerfile.

set -e

# Resolve host:port from DATABASE_URL when possible; fall back to defaults.
PG_HOST="${POSTGRES_HOST:-postgres}"
PG_PORT="${POSTGRES_PORT:-5432}"

# If DATABASE_URL is set, parse host/port out of it for a more accurate probe.
if [ -n "${DATABASE_URL:-}" ]; then
  # Strip scheme: postgresql://user:pass@host:port/db?...
  rest="${DATABASE_URL#*://}"
  # Strip credentials and path/query.
  authority="${rest%%/*}"
  authority="${authority%%?*}"
  # authority now is user:pass@host:port (or host:port)
  hostport="${authority##*@}"
  if [ -n "$hostport" ]; then
    PG_HOST="${hostport%%:*}"
    port_part="${hostport##*:}"
    # Only override port when hostport actually contained a port.
    if [ "$port_part" != "$hostport" ]; then
      PG_PORT="$port_part"
    fi
  fi
fi

echo "[app-entrypoint] waiting for Postgres at ${PG_HOST}:${PG_PORT} ..."

# Node-based TCP probe — no external deps required in the slim image.
node -e '
const net = require("net");
const host = process.env.PG_HOST;
const port = parseInt(process.env.PG_PORT || "5432", 10);
const max = parseInt(process.env.PG_WAIT_MAX_ATTEMPTS || "60", 10);
const delayMs = parseInt(process.env.PG_WAIT_DELAY_MS || "1000", 10);

function tryOnce(i) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port }, () => {
      sock.end();
      resolve(true);
    });
    sock.on("error", () => resolve(false));
  }).then((ok) => ok ? true : (i >= max ? false : new Promise((r) => {
    setTimeout(() => tryOnce(i + 1).then(r), delayMs);
  })));
}

tryOnce(1).then((ok) => {
  if (!ok) {
    console.error("[app-entrypoint] Postgres not reachable after " + max + " attempts, exiting");
    process.exit(1);
  }
  console.log("[app-entrypoint] Postgres is reachable, starting app");
});
'

echo "[app-entrypoint] starting: node server.js"
exec node server.js
