# Running Mailwave in Docker

This guide covers booting the full Mailwave stack (Next.js app + BullMQ
worker + PostgreSQL + Redis) with a single `docker compose up -d --build`
command.

## Prerequisites

- **Docker Engine** 24+ with the **Docker Compose v2** plugin
  (`docker compose ...`, not the legacy `docker-compose` binary). The
  compose file relies on `service_healthy` and `service_completed_successfully`
  conditions which require Compose v2.
- A copy of `.env.docker.example` (see below).
- `openssl` available on the host for generating secrets (or any equivalent
  random source).

## Secret generation

Two secrets are REQUIRED and Mailwave refuses to boot on known placeholders:

| Variable          | Generate with              | Notes |
|-------------------|----------------------------|-------|
| `AUTH_SECRET`     | `openssl rand -base64 32`  | Signs Auth.js sessions. |
| `ENCRYPTION_KEY`  | `openssl rand -hex 16`     | 32-char key encrypting SMTP passwords, API keys, OAuth tokens at rest. |

> **`ENCRYPTION_KEY` rotation warning:** changing this value makes all
> previously encrypted data unrecoverable unless you run
> `npm run rotate-key` with `OLD_ENCRYPTION_KEY` set to the previous value.
> Rotate only with a documented maintenance window.

Also set a strong `POSTGRES_PASSWORD` (used by the `postgres` service) and
reflect it in `DATABASE_URL`.

## First boot

```bash
# 1. Create .env from the Docker template and edit every "changeme" value.
copy .env.docker.example .env       # Windows
# cp .env.docker.example .env       # macOS / Linux

# 2. Generate secrets and paste them into .env.
openssl rand -base64 32             # -> AUTH_SECRET
openssl rand -hex 16                # -> ENCRYPTION_KEY

# 3. Build and boot the whole stack.
docker compose up -d --build
```

The first `up --build` compiles both the `app` and `worker` images, starts
Postgres and Redis, runs the one-shot `migrate` service
(`prisma migrate deploy`, or `prisma db push` when no versioned migrations
exist yet — see [Follow-up DOCKER-011](#follow-up-tasks)), then starts the
app and worker.

Check status:

```bash
docker compose ps
# Expect: postgres (healthy), redis (healthy), migrate (exited 0),
#         app (healthy), worker (up)
```

Open <http://localhost:3001>.

## Architecture

| Service   | Image / target        | Role |
|-----------|-----------------------|------|
| `postgres`| `postgres:16-alpine`  | Primary database. |
| `redis`   | `redis:7-alpine`      | BullMQ queue backend. |
| `migrate` | `mailwave-worker` img | One-shot: applies Prisma migrations, then exits. |
| `app`     | `Dockerfile` `runner` | Next.js standalone server on port 3001. |
| `worker`  | `Dockerfile` `worker` | BullMQ worker (`npx tsx jobs/worker.ts`). |

Startup ordering is enforced with `depends_on` health conditions:

- `migrate` waits for `postgres` (`service_healthy`).
- `app` and `worker` wait for `postgres` + `redis` (`service_healthy`) AND
  `migrate` (`service_completed_successfully`). If migrations fail, the app
  and worker do not start — this is the desired fail-fast behaviour.

Both runtime containers also run a shell entrypoint
(`docker/app-entrypoint.sh`, `docker/worker-entrypoint.sh`) that probes
Postgres/Redis over TCP before `exec`ing the runtime command. This is a
defensive layer for `docker run` outside Compose.

### Why `tsx` is in `dependencies`

The worker executes TypeScript at runtime (`npx tsx jobs/worker.ts`), so
`tsx` is a genuine runtime dependency of the worker image. It has been
moved from `devDependencies` to `dependencies`. This does not bloat the
Next.js standalone `app` image because standalone output only traces files
imported by the server bundle — `tsx` is not part of it.

## Logs

```bash
docker compose logs -f app         # follow app logs
docker compose logs --tail=100 worker
docker compose logs migrate        # migration output
```

## Scaling workers

BullMQ workers scale horizontally. To run 3 worker replicas:

```bash
docker compose up -d --scale worker=3
```

Each replica connects to the same Redis and shares the queues. Graceful
shutdown on `SIGTERM`/`SIGINT` is handled in `jobs/worker.ts`.

## Running the seed

The seed script (`npm run seed`) **refuses to run when
`NODE_ENV=production`**. The Docker images set `NODE_ENV=production`, so
override it when invoking seed:

```bash
docker compose run --rm -e NODE_ENV=development app npm run seed
```

This creates the demo user with `SEED_DEMO_PASSWORD` (defaults to
`password123`). Never seed a production database.

## Health check

The app exposes `GET /api/health` returning `200 {"status":"ok"}` with no
DB call. The `runner` Dockerfile stage defines a `HEALTHCHECK` that probes
this endpoint with Node's built-in `fetch` (no `curl`/`wget` in the slim
image). `docker compose ps` reports `app (healthy)` after ~1 minute.

```bash
curl http://localhost:3001/api/health
# {"status":"ok"}
```

A deeper readiness check (DB + Redis connectivity) can be added as a
follow-up `/api/health/ready` route.

## Postgres backups

Run `pg_dump` from a throwaway container on the `mailwave-net` network:

```bash
docker compose run --rm --no-deps postgres \
  pg_dump -U mailwave -d mailwave -Fc -f /tmp/mailwave.dump
docker compose cp postgres:/tmp/mailwave.dump ./mailwave.dump
```

Restore:

```bash
docker compose cp ./mailwave.dump postgres:/tmp/mailwave.dump
docker compose exec postgres pg_restore -U mailwave -d mailwave -1 /tmp/mailwave.dump
```

## Production deployment

Apply the production override on top of the base file:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

The production override:

- Pulls pre-built images from a registry (set `MAILWAVE_APP_IMAGE` /
  `MAILWAVE_WORKER_IMAGE`, or edit the file). Build with `--build` is not
  used in production.
- Removes host port bindings for Postgres, Redis, and the app. The app is
  reachable only inside the compose network at `app:3001`.
- Caps logs with the `json-file` driver (`max-size: 10m`, `max-file: 3`).

Front the app with a reverse proxy that terminates TLS and proxies to
`app:3001`:

- **Caddy**: `reverse_proxy app:3001` (automatic Let's Encrypt).
- **Traefik**: an entrypoint on 443 with a router rule
  `Host(\`mailwave.example.com\`)` and a `docker` provider watching the
  compose network.

Set `NEXTAUTH_URL` to the public HTTPS URL. Real production secrets must
live in `.env` (gitignored) or Docker secrets — never in the override file.

## Updating `ENCRYPTION_KEY`

1. Schedule a maintenance window (encrypted data is unreadable mid-rotation).
2. Set `OLD_ENCRYPTION_KEY` to the current key and `ENCRYPTION_KEY` to the
   new key in `.env`.
3. Run the rotation script in the app image:

   ```bash
   docker compose run --rm app npm run rotate-key
   ```

4. Restart the app and worker.

## Troubleshooting

- **`app` / `worker` never start**: `migrate` exited non-zero. Inspect
  `docker compose logs migrate`. Common cause: `DATABASE_URL` password
  does not match `POSTGRES_PASSWORD`.
- **`ECONNREFUSED` in app/worker logs**: the entrypoint probe gave up.
  Confirm `postgres`/`redis` report `(healthy)` (`docker compose ps`).
- **`prisma db push` runs instead of `migrate deploy`**: expected when
  `prisma/migrations/` is empty (see follow-up DOCKER-011).
- **`seed` errors with "production"**: you forgot
  `-e NODE_ENV=development` (see [Running the seed](#running-the-seed)).

## Follow-up tasks

- **DOCKER-011** — Establish versioned Prisma migrations. Currently
  `prisma/migrations/` does not exist, so the `migrate` service falls back
  to `prisma db push --accept-data-loss=false`. Create the first migration
  with `npx prisma migrate dev --name init` against a dev database, commit
  `prisma/migrations/`, and remove the `db push` fallback branch from
  `docker-compose.yml`.
