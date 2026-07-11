# Changelog

All notable changes to Mailwave are documented here.

---

## [Unreleased]

### Fixed
- **`AUTH_URL` migration** — Renamed `NEXTAUTH_URL` to `AUTH_URL` across the entire project to align with Auth.js v5 (next-auth `^5.0.0-beta.31`), which expects `AUTH_URL` as its primary environment variable. Using `NEXTAUTH_URL` caused an `UnknownAction: Cannot parse action at /api/auth/*` error in production. Updated all `.env*` files, Dockerfiles, Compose files, CI workflow, and `lib/jobs/send-campaign.ts`.

---

## [ac54394] — Prepare Easypanel default deployment

### Added
- `docker-compose.easypanel.yml` as the canonical Easypanel Compose file with Traefik labels, healthchecks, and a `migrate` init container.
- `.env.easypanel.example` with all required project variables documented.
- `Dockerfile.easypanel.app` and `Dockerfile.easypanel.worker` as dedicated build targets for Easypanel.

### Fixed
- Hardened compose file against `.env` drift and Traefik routing edge cases.
- Allowed `/api/health` through the auth middleware so Easypanel health probes pass.
- Exposed `AUTH_TRUST_HOST=true` to the app container so Auth.js accepts the proxied host header.
- Exported `POSTGRES_HOST`, `POSTGRES_PORT`, `REDIS_HOST`, and `REDIS_PORT` so the entrypoint probe can reach them before the app starts.
- Fixed Prisma 7 upgrade breakage and hardened postgres secret handling in the Docker entrypoint.
- Run Prisma and tsx binaries directly; assigned uid 1001 a writable `HOME`.

---

## [a19cf22] — Docker deployment, CI, auth hardening, SSRF guard

### Added
- `Dockerfile` with multi-stage build (`deps` → `builder` → `runner` / `worker`), standalone Next.js output, and non-root runtime user.
- `docker-compose.yml` and `docker-compose.prod.yml` for local and production Docker setups.
- GitHub Actions CI workflow with lint, type-check, build, test, and dependency audit jobs.
- SSRF guard on outbound SMTP connections to block requests to private/loopback addresses.
- `AUTH_TRUST_HOST` support to work behind reverse proxies.

### Fixed
- Encryption key validation rejects known placeholder values at startup.

---

## [e861e4b] — Codex OAuth, login rate limiting, crypto hardening

### Added
- Per-IP and per-account login rate limiting with Redis-backed counters (`lib/rate-limit.ts`).
- AES-256-GCM encryption for SMTP passwords and OAuth tokens at rest (`lib/crypto.ts`).
- `ENCRYPTION_KEY` environment variable (≥32 chars); `scripts/rotate-encryption-key.ts` for zero-downtime key rotation.

### Removed
- Unused `OPENAI_CLIENT_ID` / `OPENAI_CLIENT_SECRET` and the Codex OAuth callback helper.

---

## [b01448f] — SMTP test rate limiting and email validation

### Added
- Per-user and per-IP rate limits on the SMTP test-connection endpoint.
- Strict email format validation on the test endpoint input.

---

## [886faa9] — Mobile responsiveness and smart rate-limit re-queue

### Added
- Mobile-responsive layouts across campaigns, contacts, and settings pages.
- Smart re-queue: paused send-runs are automatically re-enqueued when resumed, respecting `nextSendAt`.

### Fixed
- Cleaned up stale environment variable references.

---

## [057be90] — Send-run ownership, countdown timer, derived metrics

### Added
- Send-run records are scoped to the owning user; cross-user access is blocked.
- Live countdown timer on the campaign detail page showing time until the next email.
- Derived campaign metrics (open rate, click rate, bounce rate) computed from delivery events.

---

## [f78fba7] — Campaign detail UI overhaul and progress bar

### Added
- Redesigned campaign detail page with a sending progress bar, per-contact status breakdown, and a real-time feed of delivery events.
- `failed` and `skipped` counts reflected in the progress bar.

---

## [56ed413] — Email open tracking

### Added
- 1×1 tracking pixel injected into outbound HTML emails (`/api/track/[emailId]`).
- Open rate displayed in campaign reports.
- `Sent` filter on the campaign detail contact list.
