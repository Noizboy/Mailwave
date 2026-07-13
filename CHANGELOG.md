# Changelog

All notable changes to Mailwave are documented here.

---

## [Unreleased]

### Changed
- **Login / Signup — logo del sistema**: Reemplazado el ícono genérico de `lucide-react` (Mail) por el logo real del sistema (`public/logo.png`) en la pantalla de autenticación. Se eliminó el título "MailWave" duplicado, dejando solo el logo y el subtitle. La directiva CSP `upgrade-insecure-requests` se movió a producción únicamente para evitar que el navegador convierta peticiones HTTP a HTTPS en desarrollo.

### Added
- **Campaign duplication** — Added a "Duplicate" action to the campaign list dropdown. Copying a campaign creates a new `pending` campaign named `"Copy of <original>"` with the same Campaign Details (`language`, `emailLength`), AI Instructions (`goal`, `product`, `cta`, `tone`, `systemPrompt`, `aiProvider`, `aiModel`), Sending Configuration (`intervalType`, `minInterval`, `maxInterval`, `dailyLimit`, `hourlyLimit`), and contact list. Runtime state (`scheduledAt`, counters, `activeSendRunId`, `startedAt`, `completedAt`) is never copied. Generated emails are not duplicated — the new campaign starts empty in `pending` status. If a campaign named `"Copy of <original>"` already exists the action shows an error toast.
- **Completed campaigns are read-only** — Once a campaign reaches `completed` status all editing and re-use actions are blocked: "Re-Generate Emails", "Retry Failed", "Cancel", per-email Edit/Regenerate/Approve/Skip buttons, and the Edit controls on Campaign Details, AI Instructions, and Sending Configuration sections. The campaign can only be viewed or duplicated.

### Fixed
- **Campaign send loop pausa innecesariamente entre emails** — Después de enviar cada email el worker marcaba la campaña como `paused`, lo que hacía aparecer el botón "Resume Sending" en la UI aunque un job de continuación ya estaba programado en BullMQ para el siguiente envío. El usuario tenía que hacer clic manualmente para continuar. Ahora la campaña permanece en `sending` durante los intervalos entre envíos; solo pasa a `paused` si el usuario la pausa manualmente. El botón "Resume Sending" ya no aparece entre envíos.
- **Re-Generate Emails preserva emails SKIPPED** — Al hacer Re-Generate, los emails con `approvalStatus: "skipped"` ya no se reseteaban a `pending` ni eran regenerados por el worker. El `updateMany` en el route ahora excluye `approvalStatus: "skipped"`, y el worker omite cualquier email skipped como defensa adicional.
- **Tarjeta "Queued" mostraba valor incorrecto al completar campaña con SKIPPEDs** — `deriveCampaignMetrics` contaba emails con `approvalStatus: "skipped"` como `pendingCount` porque su `status` de generación sigue siendo `"generated"` (el send job nunca los toca). Corregido excluyendo `approvalStatus: "skipped"` del contador `pendingCount` en `lib/campaign-metrics.ts`.
- **Sending progress bar with skipped emails** — The progress bar on the campaign detail page started pre-filled when emails were marked as skipped during review. Skipped emails now reduce the denominator rather than inflate the numerator: progress is calculated as `(sent + failed) / (total − skipped)`, so the bar starts at 0% and only advances as emails are actually sent or fail.
- **Regenerate Subject / Regenerate Email**: Los botones fallaban con `404 model "gpt-4o-mini" not found` cuando el proveedor activo era Anthropic pero `campaign.aiModel` tenía un modelo stale de un proveedor anterior. El route ahora usa exclusivamente `aiConfig.model` (el modelo configurado y verificado en AI Integration), sin ningún fallback a `campaign.aiModel` ni a `DEFAULT_MODELS`.
- **AI Settings — cambio de modelo sin re-test**: Al editar el nombre del modelo sin cambiar la API key, el status permanecía `connected` sin volver a verificar la conexión. Ahora cualquier cambio en el campo modelo también fuerza el re-test (`configChanged` incluye `rest.model !== existing?.model`).
- **Campaign worker freeze — send pacing (SEND-001)**: Replaced a blocking `setTimeout` inside the BullMQ send loop with a re-enqueue pattern. When `nextSendAt` is in the future the job enqueues a successor with `delay` and returns immediately, freeing the worker thread. Previously a future `nextSendAt` held the worker for the entire wait duration (up to hours), causing the UI to show `sending` indefinitely.
- **Campaign worker freeze — send interval (SEND-002)**: Replaced the blocking `setTimeout` interval sleep applied after each sent email with the same re-enqueue pattern. With `interval > 0` the job sends one email, updates `nextSendAt`, enqueues a successor, and returns. With `interval = 0` (burst mode) the loop continues uninterrupted. Previously a 5-minute interval with 100 contacts kept the worker blocked for 8+ hours.
- **Generate worker stall detection (GEN-001)**: Added `lockDuration: 300_000` and `lockRenewTime: 120_000` to `startGenerateWorker`. BullMQ's default 30-second lock window could cause large generation jobs (500+ contacts) to be incorrectly marked as stalled and re-queued, producing duplicate `CampaignEmail` rows.
- **isServiceError hardening (GEN-002)**: HTTP 429 (rate limit), 401, and 403 are now treated as batch-aborting errors via status code, in addition to the existing ≥ 500 check. Added `APIConnectionError`, `APIUserAbortError`, `AuthenticationError`, and `AuthError` SDK class names. Previously a 429 or a `APIConnectionError` with no `.status` fell through to the per-contact catch, recording a `failed` row for every contact instead of aborting cleanly.
- **SMTP connection timeouts (SEND-004)**: `nodemailer.createTransport` now receives `connectionTimeout: 10_000` and `socketTimeout: 30_000`. Also added `lockDuration: 60_000` / `lockRenewTime: 20_000` to `startSendWorker`; safe after SEND-001/002 since each job now completes in under a second.
- **Sileo toast z-index** — Toast notifications were hidden behind modal overlays because both Sileo's viewport and Radix Dialog shared `z-index: 50`. Added a CSS override in `app/globals.css` that raises `[data-sileo-viewport]` to `z-index: 9999` so toasts always render above any modal or backdrop.
- **`AUTH_URL` migration** — Renamed `NEXTAUTH_URL` to `AUTH_URL` across the entire project to align with Auth.js v5 (next-auth `^5.0.0-beta.31`), which expects `AUTH_URL` as its primary environment variable. Using `NEXTAUTH_URL` caused an `UnknownAction: Cannot parse action at /api/auth/*` error in production. Updated all `.env*` files, Dockerfiles, Compose files, CI workflow, and `lib/jobs/send-campaign.ts`.
- **Open tracking pixel placement** — Moved the tracking pixel `<img>` to the top of the email HTML (before the body `<div>`) so it is never cut off by email clients that truncate long HTML (e.g. Gmail at ~102 KB). Replaced `style="display:none"` with explicit inline dimension and spacing attributes for better compatibility with Outlook and corporate email clients.
- **Permanent open-event deduplication** — The tracking pixel previously blocked duplicate open events for only 10 minutes per email via a Redis key with TTL. The block is now permanent (no TTL): once the first `opened` `DeliveryEvent` is recorded for an email, the Redis key persists indefinitely so no further open events are ever written. Added `markBlockPermanent` to `lib/rate-limit.ts` and updated `isBlocked` to treat TTL-less Redis keys (`pttl === -1`) as blocked.
- **Open tracking pixel URL broken in production** — The `worker` service in `docker-compose.yml` was missing `AUTH_URL` in its `environment` block. The worker builds the tracking pixel URL as `${AUTH_URL}/api/track/...`; without the variable it resolved to an empty string, producing a relative URL (`/api/track/...`) that email clients cannot reach. Added `AUTH_URL` to the worker environment alongside the existing `app` service declaration.
- **False open events from security scanner proxies** — Corporate email security scanners (Microsoft Office SafeLinks, Proofpoint, IronPort, Barracuda, Mimecast, Sophos, Forcepoint, Abnormal, AppRiver, Cloudflare Email) prefetch images at delivery time before the user opens the email. The tracking pixel endpoint now detects these scanners via User-Agent and returns the pixel without recording an `opened` DeliveryEvent. Gmail (GoogleImageProxy) and Yahoo Mail (YahooMailProxy) are intentionally not blocked here — those proxies fetch when the user opens the email, so their events are recorded and filtered by the 15 s sentAt threshold in the emails API.
- **Apple Mail Privacy Protection false opens (CN-003)** — iOS 15+ and macOS 12+ route all image prefetches through Apple relay servers (`17.0.0.0/8`) before the user opens the email. The UA is generic Safari and indistinguishable from a real user, so the IP subnet is the only reliable signal. Requests from `17.x.x.x` are now dropped at the pixel endpoint without recording an event.
- **Extended email security scanner blocklist** — Added Cisco IronPort, Sophos, Forcepoint, Abnormal Security, AppRiver, and Cloudflare Email Security to the `EMAIL_PROXY_UA` blocklist. These corporate gateways prefetch images as part of their scanning pipeline and were previously unfiltered.
- **Per-(emailId, IP) open deduplication** — A 60-second fixed-window rate limit keyed on `track:email:{emailId}:{ip}` now prevents multi-node proxy deployments (e.g. Proofpoint Enterprise, Mimecast clusters) from inflating open counts by scanning the same email from multiple egress IPs.
- **Open event metadata** — Each `opened` `DeliveryEvent` now stores `{ ip, ua }` in the existing `metadata` JSON field. No schema change required. This enables retrospective filtering as new proxy patterns are identified.

### Changed
- Removed duplicate `docker-compose.easypanel.yml`. It was byte-for-byte identical to `docker-compose.yml`, which is the canonical Compose file for Easypanel installs.

### Performance
- **Send loop rate-limit N+1 eliminated (TD-H1)** — Hourly and daily sent-count queries were running once per recipient inside the send loop. They now run once before the loop; local counters track progress in-memory. A 1 000-recipient campaign goes from 2 000 extra DB queries to 2.
- **Batch contact import (TD-H4)** — The import/save endpoint replaced a per-row `contact.upsert` + `listMember.upsert` loop with 4 bulk queries regardless of import size: find existing emails, `createMany` new contacts, fetch all IDs, `createMany` memberships. A 10 000-row import goes from 20 000 queries to 4.
- **Generate loop pre-fetch (TD-M6)** — `campaignEmail.findUnique` per list member was replaced with a single `findMany` before the loop. The in-loop check is now an O(1) `Map` lookup.
- **Reports open-rate query (TD-H3)** — Replaced an unbounded `deliveryEvent.findMany` (all opened events across all campaigns) with a targeted `campaignEmail.findMany` that fetches only sent emails that have at least one opened event. Eliminates a full-table scan on large accounts.
- **DB indexes on userId (TD-M5)** — Added `@@index([userId])` to `List`, `Campaign`, and `Import` models. Every user-scoped query on these tables was previously a full table scan.

### Security / Correctness
- **Corrupted email bodies fixed (CN-QP-001)** — Outbound emails were arriving garbled (`Šh,­...`) because nodemailer's `encoding: "base64"` in the `alternatives` array means "decode this string from base64 before sending", not "use base64 CTE". HTML is now pre-encoded with `Buffer.from(html, "utf-8").toString("base64")` before being handed to nodemailer.
- **Send route status gate corrected (TD-H5)** — The send endpoint was accepting `pending_review` as a valid status to trigger sending, but the worker silently no-ops for that status. Campaigns in `pending_review` now receive a clear `409` instead of a phantom `200 queued`.
- **Campaign PATCH exposes only safe statuses (TD-M3)** — The PATCH schema for campaigns now restricts the `status` field to states a user can set manually (`pending`, `pending_review`, `ready_to_send`, `paused`). Previously `sending`, `completed`, and `failed` were also accepted, allowing clients to corrupt the state machine.
- **Enum validation on email list query params (TD-M1/M2)** — `approvalStatus` and `status` filter params on `GET /campaigns/[id]/emails` are now validated with zod. Invalid values return `400` instead of a Prisma runtime error. `perPage` is clamped to `[1, 100]`.
- **Import body validation (TD-M4)** — `POST /import/[id]/save` now validates its JSON body with a zod schema. Malformed JSON or unknown fields return `400` instead of silently proceeding.
- **Export row cap (TD-H2)** — `GET /reports/export` now caps results at 10 000 rows and returns `X-Truncated: true` when the limit is hit. Previously an account with 100 k+ emails could exhaust server memory.

### Refactoring
- **Sidebar context moved to components (TD-L2)** — `lib/sidebar-context.tsx` relocated to `components/layout/sidebar-context.tsx`. All imports updated; old file removed.
- **`getDailyDigestQueue` singleton added (TD-L3)** — Queue accessor added to `lib/jobs/queue.ts` matching the pattern of the other three queues.
- **Dead `markBlockPermanent` export removed (TD-L1)** — Unused export and its in-memory helper deleted from `lib/rate-limit.ts`. The JSDoc incorrectly claimed it was used by the tracking pixel.

### Tests
- **17 new API route tests (TD-L4)** — Added coverage for `GET /campaigns/[id]/emails` (401, 404, 400, 15 s open-threshold filter, perPage clamp), `PATCH /campaigns/[id]/emails/[emailId]` (401, 404, 403 suppressed contact, success), `POST /campaigns/[id]/emails/[emailId]/regenerate` (401, 404, 400 no AI config, success, 500 AI error), `GET /settings/sending-limits` (stored values), and `PUT /settings/sending-limits` (401, 400, smtp upsert, suppress-job enqueue, no job without suppressAfterEmails). Total: 272 tests.

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
