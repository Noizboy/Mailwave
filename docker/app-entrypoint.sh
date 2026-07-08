#!/bin/sh
# Mailwave app container entrypoint.
#
# Responsibilities (kept minimal by design; see docs/docker.md):
#   1. Wait for Postgres to accept connections.
#   2. Optionally run Prisma migrations when RUN_MIGRATIONS=true.
#   3. exec node server.js so signals reach the Next.js process directly.
#
# By default migrations are NOT run here. The dedicated one-shot `migrate`
# service owns migrations (see docker-compose.yml) to avoid races between
# scaled app replicas. For Easypanel's simpler service model you can opt in
# with RUN_MIGRATIONS=true on exactly one app replica.
#
# Runs as the non-root `nextjs` user (uid 1001) set in the Dockerfile.

set -e

# Resolve host:port from DATABASE_URL when possible; fall back to defaults.
# These are read by the node probe below via process.env, so they MUST be
# exported (plain shell vars are invisible to node -e). Easypanel deploy was
# stuck in a restart loop because PG_HOST was unset in node -> probe hit
# localhost:5432 -> ECONNREFUSED -> "Postgres not reachable".
export PG_HOST="${POSTGRES_HOST:-postgres}"
export PG_PORT="${POSTGRES_PORT:-5432}"

# If DATABASE_URL is set, parse host/port out of it for a more accurate probe.
if [ -n "${DATABASE_URL:-}" ]; then
  # Strip scheme: postgresql://user:pass@host:port/db?...
  rest="${DATABASE_URL#*://}"
  # Strip path/query (everything from the first '/').
  authority="${rest%%/*}"
  # authority now is user:pass@host:port (or host:port)
  hostport="${authority##*@}"
  if [ -n "$hostport" ]; then
    PG_HOST="${hostport%%:*}"
    port_part="${hostport##*:}"
    # Only override port when hostport actually contained a port.
    if [ "$port_part" != "$hostport" ]; then
      PG_PORT="$port_part"
    fi
    export PG_HOST PG_PORT
  fi
fi

echo "[app-entrypoint] waiting for Postgres at ${PG_HOST}:${PG_PORT} ..."

# Node-based TCP probe; no external deps required in the slim image.
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
  console.log("[app-entrypoint] Postgres is reachable, continuing startup");
});
'

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  if [ ! -x node_modules/.bin/prisma ]; then
    echo "[app-entrypoint] RUN_MIGRATIONS=true but node_modules/.bin/prisma is missing" >&2
    exit 1
  fi

  strategy="${MIGRATION_STRATEGY:-auto}"
  echo "[app-entrypoint] running Prisma migrations with strategy=${strategy}"

  case "$strategy" in
    deploy)
      node_modules/.bin/prisma migrate deploy
      ;;
    push)
      node_modules/.bin/prisma db push --accept-data-loss=false
      ;;
    auto|"")
      if [ -d prisma/migrations ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
        node_modules/.bin/prisma migrate deploy
      else
        node_modules/.bin/prisma db push --accept-data-loss=false
      fi
      ;;
    *)
      echo "[app-entrypoint] invalid MIGRATION_STRATEGY='$strategy' (expected auto, deploy, or push)" >&2
      exit 1
      ;;
  esac
fi

echo "[app-entrypoint] starting: node server.js"
exec node server.js
