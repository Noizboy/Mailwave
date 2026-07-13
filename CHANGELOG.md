# Changelog

All notable changes to Mailwave are documented here.

---

## [Unreleased]

### Fixed
- **Campaign worker freeze — send pacing (SEND-001)**: Replaced a blocking `setTimeout` inside the BullMQ send loop with a re-enqueue pattern. When `nextSendAt` is in the future the job enqueues a successor with `delay` and returns immediately, freeing the worker thread. Previously a future `nextSendAt` held the worker for the entire wait duration (up to hours), causing the UI to show `sending` indefinitely.
- **Campaign worker freeze — send interval (SEND-002)**: Replaced the blocking `setTimeout` interval sleep applied after each sent email with the same re-enqueue pattern. With `interval > 0` the job sends one email, updates `nextSendAt`, enqueues a successor, and returns. With `interval = 0` (burst mode) the loop continues uninterrupted. Previously a 5-minute interval with 100 contacts kept the worker blocked for 8+ hours.
- **Generate worker stall detection (GEN-001)**: Added `lockDuration: 300_000` and `lockRenewTime: 120_000` to `startGenerateWorker`. BullMQ's default 30-second lock window could cause large generation jobs (500+ contacts) to be incorrectly marked as stalled and re-queued, producing duplicate `CampaignEmail` rows.
- **isServiceError hardening (GEN-002)**: HTTP 429 (rate limit), 401, and 403 are now treated as batch-aborting errors via status code, in addition to the existing ≥ 500 check. Added `APIConnectionError`, `APIUserAbortError`, `AuthenticationError`, and `AuthError` SDK class names. Previously a 429 or a `APIConnectionError` with no `.status` fell through to the per-contact catch, recording a `failed` row for every contact instead of aborting cleanly.
- **SMTP connection timeouts (SEND-004)**: `nodemailer.createTransport` now receives `connectionTimeout: 10_000` and `socketTimeout: 30_000`. Also added `lockDuration: 60_000` / `lockRenewTime: 20_000` to `startSendWorker`; safe after SEND-001/002 since each job now completes in under a second.
- **Sileo toast z-index** — Toast notifications were hidden behind modal overlays because both Sileo's viewport and Radix Dialog shared `z-index: 50`. Added a CSS override in `app/globals.css` that raises `[data-sileo-viewport]` to `z-index: 9999` so toasts always render above any modal or backdrop.
- **`AUTH_URL` migration** — Renamed `NEXTAUTH_URL` to `AUTH_URL` across the entire project to align with Auth.js v5 (next-auth `^5.0.0-beta.31`), which expects `AUTH_URL` as its primary environment variable. Using `NEXTAUTH_URL` caused an `UnknownAction: Cannot parse action at /api/auth/*` error in production. Updated all `.env*` files, Dockerfiles, Compose files, CI workflow, and `lib/jobs/send-campaign.ts`.
- **Open tracking pixel placement** — Moved the tracking pixel `<img>` to the top of the email HTML (before the body `<div>`) so it is never cut off by email clients that truncate long HTML (e.g. Gmail at ~102 KB). Replaced `style="display:none"` with explicit inline dimension and spacing attributes for better compatibility with Outlook and corporate email clients.
- **Permanent open-event deduplication** — The tracking pixel previously blocked duplicate open events for only 10 minutes per email via a Redis key with TTL. The block is now permanent (no TTL): once the first `opened` `DeliveryEvent` is recorded for an email, the Redis key persists indefinitely so no further open events are ever written. Added `markBlockPermanent` to `lib/rate-limit.ts` and updated `isBlocked` to treat TTL-less Redis keys (`pttl === -1`) as blocked.

### Changed
- Removed duplicate `docker-compose.easypanel.yml`. It was byte-for-byte identical to `docker-compose.yml`, which is the canonical Compose file for Easypanel installs.

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
