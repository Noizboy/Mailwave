# Docker Loop Engineering Tasks

Loop-engineering queue for shipping Mailwave in Docker — orchestrating the
Next.js app, the BullMQ worker, PostgreSQL, and Redis behind a single
`docker compose up` command.

Use this checklist as a loop-engineering queue. Each loop should:

1. Pick exactly one unchecked task.
2. Define the expected outcome before editing.
3. Make the smallest safe change.
4. Run the listed verification commands.
5. Mark the task as completed only after verification passes or the remaining
   risk is documented.

---

## Context

- **Area:** Docker containerisation & orchestration.
- **Repo:** `C:\Users\lexpc\Documents\Repositories\Mailwave`.
- **Current state:** A multi-stage `Dockerfile` exists for the Next.js
  standalone app (port 3001, non-root user). No `docker-compose.yml`, no image
  for the BullMQ worker (`jobs/worker.ts`), no external service definitions
  (PostgreSQL, Redis), no Docker docs.
- **Stack:** Next.js 16 (standalone output), Prisma 7 (`@prisma/adapter-pg`),
  BullMQ + Redis, PostgreSQL, Auth.js, `tsx`-based worker.
- **Goal:** `docker compose up -d --build` boots a healthy Mailwave stack with
  app + worker + Postgres + Redis, migrations applied, secrets via `.env`.

## Conventions

- Task IDs are stable: `DOCKER-001` … `DOCKER-010`. Do not rename.
- Follow-up tasks are appended at the end (new IDs).
- One task per loop; commit code + this file together after verification.
- Secrets live in `.env` (gitignored). Never bake them into images.
- Keep the non-root `nextjs` user (uid 1001) and OpenSSL in all runtime stages.

---

## Tasks

### DOCKER-001. Create `docker-compose.yml` base orchestration

- [ ] **Status:** Pending — *implementation complete; Docker not available on the orchestrator host, so `docker compose config` / `up` verification is deferred to DOCKER-012.*
- **Priority:** High
- **Depends on:** None
- **Files to touch:** `docker-compose.yml` (new), `.env.docker.example` (new)
- **Problem:** There is no way to boot the full stack (app + worker + Postgres
  + Redis) with a single command. Operators must wire each service manually.
- **Expected outcome:** A `docker-compose.yml` defining services `postgres`
  (image `postgres:16-alpine`, `pgdata` volume, `pg_isready` healthcheck),
  `redis` (image `redis:7-alpine`, `redisdata` volume, `redis-cli ping`
  healthcheck), `app` (build `.`), `worker` (build `.`, command override),
  and `migrate` (one-shot `prisma migrate deploy`, `restart: "no"`). Shared
  network `mailwave-net`. `env_file: .env` on app/worker/migrate.
  `.env.docker.example` mirrors `.env.example` with internal hostnames
  (`postgres`, `redis`).
- **Done when:** `docker compose config` validates without error and
  `docker compose up -d postgres redis` brings both services to `healthy`.
- **Verification:**
  ```bash
  docker compose config > nul
  docker compose up -d postgres redis
  docker compose ps   # postgres and redis show (healthy)
  docker compose down
  ```
- **Risk / notes:** Do not publish Postgres/Redis ports to the host in the
  production profile (see DOCKER-009). Default `.env.docker.example` uses
  placeholder secrets; warn the operator to replace them.

### DOCKER-002. Extend `Dockerfile` to package the BullMQ worker

- [ ] **Status:** Pending — *implementation complete (new `worker` target + `tsx` moved to `dependencies`); Docker build verification deferred to DOCKER-012.*
- **Priority:** High
- **Depends on:** None
- **Files to touch:** `Dockerfile`, `package.json` (move `tsx` to dependencies
  if needed), optionally `Dockerfile.worker`
- **Problem:** The current `Dockerfile` runs only `node server.js`. The worker
  (`jobs/worker.ts`) is a TypeScript entrypoint executed via `tsx`, which is a
  devDependency and is not present in the runtime stage.
- **Expected outcome:** Either a new `target` in the `Dockerfile` named
  `worker` (or a separate `Dockerfile.worker`) that reuses the `runner` stage,
  installs/makes available `tsx`, and sets `CMD ["npx", "tsx",
  "jobs/worker.ts"]`. The runtime image must still run as non-root and keep
  OpenSSL. If `tsx` is moved to `dependencies`, document the rationale in
  `docs/docker.md`.
- **Done when:** `docker build --target worker -t mailwave-worker:local .`
  succeeds and `docker run --rm mailwave-worker:local node -e
  "console.log(require('tsx/package.json').version)"` prints a version.
- **Verification:**
  ```bash
  docker build --target worker -t mailwave-worker:local .
  docker run --rm mailwave-worker:local npx tsx --version
  ```
- **Risk / notes:** Preferred path: move `tsx` to `dependencies` so the worker
  does not need a separate install step in the runtime stage. Confirm this does
  not bloat the Next.js image noticeably (standalone output excludes
  devDeps anyway). Alternative: precompile the worker with `tsc` to JS.

### DOCKER-003. Create `docker/app-entrypoint.sh`

- [ ] **Status:** Pending — *implementation complete (waits for Postgres via Node TCP probe, then `exec node server.js`; migrations delegated to the `migrate` service as recommended); runtime verification deferred to DOCKER-012.*
- **Priority:** High
- **Depends on:** DOCKER-001, DOCKER-002
- **Files to touch:** `docker/app-entrypoint.sh` (new), `Dockerfile` (COPY +
  chmod), `docker-compose.yml` (`entrypoint:` override on `app`)
- **Problem:** The app container must wait for Postgres to be healthy and
  apply migrations before starting `node server.js`. Currently nothing
  guarantees this ordering.
- **Expected outcome:** A shell script that (a) waits for Postgres via
  `pg_isready` or a Node `fetch`-based probe, (b) runs `npx prisma migrate
  deploy` (idempotent), (c) `exec node server.js`. It must run as the non-root
  `nextjs` user and forward signals correctly (`exec`).
- **Done when:** `docker compose up app` reaches `healthy`/listening on 3001
  and `docker compose exec app npx prisma migrate status` reports no pending
  migrations.
- **Verification:**
  ```bash
  docker compose up -d
  docker compose logs app | findstr "Ready\|started server"
  curl http://localhost:3001
  docker compose exec app npx prisma migrate status
  ```
- **Risk / notes:** If `prisma/migrations/` does not exist, fall back to
  `prisma db push --accept-data-loss=false` and create a follow-up task to
  establish versioned migrations. The `migrate` one-shot service may make the
  migration step here redundant — pick one canonical place to migrate and
  document it (prefer the one-shot `migrate` service; have this entrypoint
  only wait + start).

### DOCKER-004. Create `docker/worker-entrypoint.sh`

- [ ] **Status:** Pending — *implementation complete (waits for Redis + Postgres via Node TCP probe, then `exec npx tsx jobs/worker.ts`; no migrations run, avoiding races with the `migrate` service); runtime verification deferred to DOCKER-012.*
- **Priority:** High
- **Depends on:** DOCKER-001, DOCKER-002
- **Files to touch:** `docker/worker-entrypoint.sh` (new), `Dockerfile`
  (COPY + chmod), `docker-compose.yml` (`entrypoint:` override on `worker`)
- **Problem:** The worker must not start before Redis and Postgres are ready,
  and must shut down gracefully on `SIGTERM`/`SIGINT` (already handled in
  `jobs/worker.ts`).
- **Expected outcome:** A shell script that (a) waits for Redis
  (`redis-cli ping` or Node probe) and Postgres, (b) `exec npx tsx
  jobs/worker.ts`. Signals must reach the `tsx` process via `exec`.
- **Done when:** `docker compose logs worker` prints
  `MailWave worker started — queues: ...` and `docker compose stop worker`
  exits cleanly within ~10s (graceful shutdown).
- **Verification:**
  ```bash
  docker compose up -d
  docker compose logs worker | findstr "MailWave worker started"
  docker compose stop worker
  docker compose ps worker   # exited 0
  ```
- **Risk / notes:** If `migrate` service (DOCKER-001) already applies
  migrations, the worker entrypoint must NOT re-run them to avoid races. Keep
  it to wait + exec.

### DOCKER-005. Create `.env.docker.example`

- [ ] **Status:** Pending — *implementation complete (file created with internal hostnames `postgres`/`redis`, placeholder secrets, and `openssl` generation notes; `.dockerignore` exception `!.env.docker.example` added); `docker compose --env-file` verification deferred to DOCKER-012.*
- **Priority:** Medium
- **Depends on:** DOCKER-001
- **Files to touch:** `.env.docker.example` (new)
- **Problem:** Operators need a template with the correct internal hostnames
  (`postgres`, `redis`) and clearly flagged secrets to replace before first
  boot.
- **Expected outcome:** A copy of `.env.example` with
  `DATABASE_URL=postgresql://mailwave:changeme@postgres:5432/mailwave?schema=public`,
  `REDIS_URL=redis://redis:6379`, `AUTH_URL=http://localhost:3001`,
  `PORT=3001`, and placeholder `AUTH_SECRET` / `ENCRYPTION_KEY` with comments
  pointing to `openssl rand -base64 32` and `openssl rand -hex 16`.
- **Done when:** File exists and `docker compose --env-file .env.docker.example
  config` validates.
- **Verification:**
  ```bash
  copy .env.docker.example .env
  docker compose config > nul
  ```
- **Risk / notes:** Make sure `.env.docker.example` is NOT in `.dockerignore`'s
  blanket `.env.*` exclusion — add an exception
  `!.env.docker.example`. Verify with `.dockerignore` review.

### DOCKER-006. Add `/api/health` route and image `HEALTHCHECK`

- [ ] **Status:** Pending — *implementation complete (`app/api/health/route.ts` returns `200 {"status":"ok"}`, no DB/auth; `HEALTHCHECK` directive added to the `runner` stage using Node `fetch`); `tsc`/`eslint` clean for the new route; runtime `curl`/`docker compose ps` verification deferred to DOCKER-012.*
- **Priority:** Medium
- **Depends on:** DOCKER-001
- **Files to touch:** `app/api/health/route.ts` (new), `Dockerfile`
  (`HEALTHCHECK` directive on runner)
- **Problem:** `docker compose ps` cannot show `app (healthy)` without a
  healthcheck. The slim image has no `curl`/`wget`, so the check must use
  Node's built-in `fetch` (Node 20+).
- **Expected outcome:** A `GET /api/health` route returning `200
  {"status":"ok"}` (no DB call — keep it cheap). A `HEALTHCHECK` in the
  `Dockerfile` runner stage: `HEALTHCHECK --interval=30s --timeout=5s
  --start-period=20s --retries=3 CMD node -e
  "fetch('http://localhost:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`
- **Done when:** `curl http://localhost:3001/api/health` returns `{"status":"ok"}`
  and `docker compose ps` shows `app (healthy)` after ~1 min.
- **Verification:**
  ```bash
  docker compose up -d
  curl http://localhost:3001/api/health
  docker compose ps app
  ```
- **Risk / notes:** The health route must not require auth and must not leak
  config. Return only `{status:"ok"}`. If a deeper check is desired later,
  add `/api/health/ready` as a follow-up task.

### DOCKER-007. Wire `depends_on` health conditions and migration ordering

- [ ] **Status:** Pending — *implementation complete (`migrate` depends on `postgres: service_healthy`; `app`/`worker` depend on `postgres` + `redis: service_healthy` and `migrate: service_completed_successfully`); cold-boot verification deferred to DOCKER-012.*
- **Priority:** High
- **Depends on:** DOCKER-001, DOCKER-003, DOCKER-004
- **Files to touch:** `docker-compose.yml`
- **Problem:** Without explicit ordering, `app`/`worker` may start before
  Postgres/Redis are ready or before migrations are applied, causing
  connection errors on first boot.
- **Expected outcome:** `migrate` service:
  `depends_on: { postgres: { condition: service_healthy } }`.
  `app` and `worker`:
  `depends_on: { postgres: { condition: service_healthy }, redis: { condition: service_healthy }, migrate: { condition: service_completed_successfully } }`.
- **Done when:** `docker compose up -d` (cold) brings the stack up without
  connection errors in `app`/`worker` logs.
- **Verification:**
  ```bash
  docker compose down -v
  docker compose up -d --build
  timeout /t 30
  docker compose ps
  docker compose logs app worker | findstr /i "error ECONN refused"
  ```
- **Risk / notes:** `service_completed_successfully` requires Compose v2+.
  Document the minimum version in `docs/docker.md`. If `migrate` exits non-zero,
  `app`/`worker` will not start — that is the desired fail-fast behaviour.

### DOCKER-008. Document Docker usage in `docs/docker.md`

- [ ] **Status:** Pending — *implementation complete (`docs/docker.md` written covering prerequisites, secret generation, first boot, architecture, logs, worker scaling, seed under `NODE_ENV=development`, `pg_dump` backups, `ENCRYPTION_KEY` rotation, prod override, troubleshooting; README "Getting Started" cross-linked); end-to-end operator-run verification deferred to DOCKER-012.*
- **Priority:** Medium
- **Depends on:** DOCKER-001, DOCKER-002, DOCKER-003, DOCKER-004, DOCKER-005,
  DOCKER-007
- **Files to touch:** `docs/docker.md` (new), optionally `README.md`
  (cross-link)
- **Problem:** No operator-facing documentation exists for running Mailwave in
  Docker.
- **Expected outcome:** A `docs/docker.md` covering: pre-requisites (Docker +
  Compose v2), secret generation (`AUTH_SECRET`, `ENCRYPTION_KEY`), first boot
  (`cp .env.docker.example .env` → edit → `docker compose up -d --build`),
  logs, scaling workers (`docker compose up -d --scale worker=3`), running
  seed (override `NODE_ENV=development`), Postgres backups (`pg_dump`),
  `ENCRYPTION_KEY` rotation warning with link to `npm run rotate-key`, and the
  warning that `seed` refuses to run under `NODE_ENV=production`.
- **Done when:** A new operator can follow the doc end-to-end and reach a
  logged-in app at `http://localhost:3001`.
- **Verification:**
  ```bash
  mklink docs/docker.md docs/docker.md   # exists check
  docker compose down -v && docker compose up -d --build
  curl http://localhost:3001/api/health
  ```
- **Risk / notes:** Cross-link from `README.md` "Getting Started" section.
  Keep the doc in sync with any change to service names or ports.

### DOCKER-009. (Optional) Production compose profile

- [ ] **Status:** Pending — *implementation complete (`docker-compose.prod.yml` + `.env.docker.prod.example` created; removes host ports for Postgres/Redis/app, adds `json-file` log caps, pulls registry images via `MAILWAVE_APP_IMAGE`/`MAILWAVE_WORKER_IMAGE` + `pull_policy: always`, documents Caddy/Traefik front-end); `docker compose -f ... config` verification deferred to DOCKER-012.*
- **Priority:** Low
- **Depends on:** DOCKER-001, DOCKER-007
- **Files to touch:** `docker-compose.prod.yml` (new), `.env.docker.prod.example`
  (new)
- **Problem:** The base compose is dev-friendly (ports published, no restart
  policy, no log caps). Production needs the opposite.
- **Expected outcome:** An override file that: pulls images from a registry
  instead of building, sets `restart: unless-stopped` on all services, removes
  host port bindings for Postgres/Redis, adds `logging.driver: json-file`
  with `max-size: 10m` / `max-file: 3`, and documents a reverse-proxy (Caddy
  or Traefik) for TLS in front of `app`.
- **Done when:** `docker compose -f docker-compose.yml -f
  docker-compose.prod.yml config` validates and Postgres/Redis show no host
  port mapping.
- **Verification:**
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.prod.yml config > nul
  ```
- **Risk / notes:** Do not put production secrets in the override file. Use
  real `.env` or Docker secrets. Coordinate with Security Agent before
  merging.

### DOCKER-010. (Optional) CI workflow for Docker build & compose validation

- [ ] **Status:** Pending — *implementation complete (`.github/workflows/docker.yml` builds `runner` + `worker` targets, validates base + prod compose `config`, verifies `tsx` in the worker image, and runs a compose smoke test on `main` only); green-run verification deferred until the workflow executes on a real PR (DOCKER-012).*
- **Priority:** Low
- **Depends on:** DOCKER-001, DOCKER-002
- **Files to touch:** `.github/workflows/docker.yml` (new)
- **Problem:** No CI guard catches Dockerfile or compose regressions before
  merge.
- **Expected outcome:** A GitHub Actions workflow (on `push`/`pull_request` to
  `main`) that: runs `docker build -t mailwave:ci .` and
  `docker build --target worker -t mailwave-worker:ci .`, runs `docker compose
  config` against `.env.docker.example`, and (optionally) `docker compose up
  -d --build` with a short smoke `curl /api/health` before tearing down.
- **Done when:** Workflow runs green on a sample PR.
- **Verification:**
  ```bash
  docker build -t mailwave:ci .
  docker build --target worker -t mailwave-worker:ci .
  copy .env.docker.example .env && docker compose config > nul
  ```
- **Risk / notes:** Keep CI fast — skip the full `up` smoke test on every PR
  if it exceeds ~3 min; run it only on `main`. Use `services` or
  `docker compose` carefully within the `ubuntu-latest` runner.

---

## Completion rule

A task can be changed from `- [ ]` to `- [x]` only when:

- The implementation is complete.
- The listed verification command has been run and exits successfully.
- Any failure is documented with a follow-up task (new ID appended below).
- The change is committed if it modifies repository files.

## Follow-up tasks

### DOCKER-011. Establish versioned Prisma migrations

- [ ] **Status:** Pending
- **Priority:** Medium
- **Depends on:** DOCKER-001
- **Files to touch:** `prisma/migrations/` (new), `docker-compose.yml`
  (remove the `db push` fallback branch in the `migrate` service)
- **Problem:** `prisma/migrations/` does not exist, so the `migrate` service
  falls back to `prisma db push --accept-data-loss=false` on every boot.
  Versioned migrations are needed for reproducible, reviewable schema
  changes and for `prisma migrate deploy` (the production-safe path).
- **Expected outcome:** A baseline migration created via
  `npx prisma migrate dev --name init` against a dev database, committed
  under `prisma/migrations/`. The `migrate` service in `docker-compose.yml`
  is simplified to `npx prisma migrate deploy` only.
- **Done when:** `docker compose up -d migrate` exits 0 and
  `npx prisma migrate status` (in the app image) reports no pending
  migrations.
- **Risk / notes:** Coordinate with the Database Agent. Take a DB backup
  before adopting migrations on an existing deployment.

### DOCKER-012. Run Docker verification for DOCKER-001 … DOCKER-010

- [ ] **Status:** Pending
- **Priority:** High
- **Depends on:** DOCKER-001 through DOCKER-010
- **Files to touch:** none (verification-only)
- **Problem:** The orchestrator host does not have the Docker Engine /
  Compose v2 CLI installed, so the `docker build`, `docker compose config`,
  `docker compose up`, and `curl /api/health` verification commands listed
  in DOCKER-001 … DOCKER-010 could not be executed locally. YAML validity
  was checked with `js-yaml`; shell scripts passed `sh -n`; the health route
  passed `tsc --noEmit` and `eslint`.
- **Expected outcome:** On a host with Docker 24+ and Compose v2, run the
  verification block of every DOCKER-001 … DOCKER-010 task end-to-end and
  flip each `- [ ]` to `- [x]` (per the completion rule).
- **Done when:** All listed verification commands exit successfully and
  every task checkbox in this file is marked complete.
- **Risk / notes:** This task is the gate for marking DOCKER-001 …
  DOCKER-010 as truly complete. Until it runs, the tasks remain
  "implementation complete, verification pending".

_(append additional follow-up tasks above this line as they are discovered)_
