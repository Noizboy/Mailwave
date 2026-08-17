# Changelog

## [Unreleased]

### Changed

- **Footer credit** — the "Created by Alejandro Pujols" credit in the sidebar is now a link to his LinkedIn profile. Bumped version to `v1.1.6`.

## [2026-08-17]

### Added

- **Public Logs API** (`GET /api/public/logs`) — public endpoint to query system logs, protected by an API key via the `X-Api-Key` header.
- **SystemLog table** — new DB table that stores structured events with `level` (info/warn/error), `category`, `message`, JSON `metadata`, `userId` and `createdAt`.
- **ApiKey table** — per-user API key management with SHA-256 hashing, `lastUsedAt` and soft revocation (`revokedAt`).
- **`lib/logger.ts`** — fire-and-forget logging utility that never blocks the caller.
- **`lib/api-key.ts`** — API key generation, hashing and validation; supports a static key via `PUBLIC_LOGS_API_KEY`.
- **API key management routes** — `POST /api/api-keys`, `GET /api/api-keys`, `DELETE /api/api-keys/:id` (require a session).
- **Debug endpoint** (`GET /api/public/logs/debug`) — verifies that `PUBLIC_LOGS_API_KEY` is loaded in the container.
- **`PUBLIC_LOGS_API_KEY`** env var — static key for the public endpoint; declared in `.env.example` and `docker-compose.yml`.

### Instrumentation

Events recorded automatically in `SystemLog`:

| Category   | Events |
|------------|--------|
| `auth`     | Successful login, failed login (unknown email / wrong password), rate-limit blocked |
| `campaign` | Generation started, completed, no eligible contacts |
| `ai`       | AI config error, per-contact failure, AI service error |
| `smtp`     | Email sent, email failed |

### Filters supported

`level`, `category`, `userId`, `from`, `to`, `page`, `pageSize` (max 200)

### Docs

- [`docs/public-logs-api.md`](docs/public-logs-api.md) — full endpoint reference
- [`docs/archive/easypanel-installation.md`](docs/archive/easypanel-installation.md) — updated with `PUBLIC_LOGS_API_KEY`