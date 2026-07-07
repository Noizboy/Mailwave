# MailWave Manual Testing Instructions

This document is the canonical manual-test companion to the backend API
contract in `testsprite_tests/tmp/code_summary.yaml`. It exists to prevent the
recurring generation defects seen in TestSprite runs: literal route-segment
paths (`/api/auth/[...nextauth]`), invented `/dashboard/api/...` prefixes,
wrong HTTP methods (`POST` instead of `PUT`), and wrong response-shape
assumptions (redirect/HTML vs JSON, wrapper objects vs arrays, JSON vs CSV).

## Quick Start

- **Email:** `demo@mailwave.app`
- **Password:** `password123`
- **URL:** http://localhost:3001 (TestSprite target port; see `testsprite_tests/config.json`)

---

## Backend API Contract Testing (TestSprite + Manual)

All protected backend routes (`/api/*` except `/api/auth/*` and
`/api/track/[emailId]`) require a valid JWT session. Repeat these steps for
every test that needs authentication.

### Reusable Authenticated Test Flow (NextAuth v5)

1. **Fetch a CSRF token** (preserve the cookie jar across all requests):
   ```bash
   curl -c cookies.txt http://localhost:3001/api/auth/csrf
   # -> { "csrfToken": "..." }
   ```
2. **Submit credentials** as `application/x-www-form-urlencoded` to the
   credentials callback (NOT to `/api/auth/[...nextauth]` — that is a
   route-segment name, not a request path):
   ```bash
   curl -b cookies.txt -c cookies.txt \
     -X POST http://localhost:3001/api/auth/callback/credentials \
     -H "Content-Type: application/x-www-form-urlencoded" \
     --data-urlencode "email=demo@mailwave.app" \
     --data-urlencode "password=password123" \
     --data-urlencode "csrfToken=<csrfToken from step 1>" \
     --data-urlencode "callbackUrl=http://localhost:3001/dashboard"
   ```
   - The response status may be `200`, `302`, or `307`.
     **Do not treat the status or body as the success signal.**
3. **Confirm the session** is established (this is the reliable success check):
   ```bash
   curl -b cookies.txt http://localhost:3001/api/auth/session
   # Success -> 200 with a non-empty body: { "user": { "id", "email", "name" }, "expires": "..." }
   # Failure -> 200 with an empty body: {} (or null)
   ```

**Seed credentials:** `demo@mailwave.app` / `password123`

**Invalid credentials:** any non-seed email or wrong password. The callback
returns a redirect/error and `GET /api/auth/session` stays empty.

**Verification command (server must be running on 3001):**
```bash
curl -s http://localhost:3001/api/auth/csrf
```

### Unauthenticated protected route contract

Every protected route returns HTTP 401 with a JSON body
`{ "error": "Unauthorized" }` when no session is present, e.g.:
```bash
curl -i http://localhost:3001/api/contacts
# -> HTTP/1.1 401 Unauthorized
#    { "error": "Unauthorized" }
```

### Method cheat sheet (common generation mistakes)

| Surface | Correct method | Common mistake |
| --- | --- | --- |
| `PUT /api/settings/smtp` | PUT | POST / PATCH |
| `PUT /api/settings/ai` | PUT | POST / PATCH |
| `PUT /api/settings/sending-limits` | PUT | PATCH |
| `PATCH /api/settings/notification-preferences` | PATCH | POST |
| `PATCH /api/settings/account` | PATCH | POST |
| `POST /api/settings/account/password` | POST | PUT |
| `GET /api/reports` | JSON response | assume CSV |
| `GET /api/reports/export` | CSV download (`text/csv`) | assume JSON |
| `GET /api/notifications` | `{ notifications, unreadCount }` | assume bare array |
| `PATCH /api/notifications` | mark all read | assume GET / POST |
| `PATCH /api/notifications/[id]` | mark one read | assume POST |
| `POST /api/campaigns/[id]/generate\|send\|pause\|cancel\|approve-all\|retry-failed` | POST | mixed methods |

### Reports vs export (JSON vs CSV)

- `GET /api/reports` → `application/json` with `{ summary, campaigns }`.
- `GET /api/reports/emails` → `application/json` detail rows.
- `GET /api/reports/export` → `text/csv` file download
  (`Content-Disposition: attachment; filename="mailwave-export.csv"`),
  optional `?campaignId=` filter. **Not JSON.**

### Notifications payload shape

- `GET /api/notifications` → `{ notifications: Notification[], unreadCount: number }`
  (optional `?take=`, default 50, capped 200). **Not a bare array.**
- `PATCH /api/notifications` → mark all read → `{ ok: true }`.
- `PATCH /api/notifications/[id]` → mark one read (user-scoped) → `{ ok: true }`.

### Import flow

- `POST /api/import` — multipart form field `file` (text/csv) →
  `{ importId, rowCount, validCount, invalidCount, duplicateCount, missingDataCount }`.
- `GET /api/import/[id]` → import with `rows`.
- `PATCH /api/import/[id]` → update columnMapping/status.
- `PATCH /api/import/[id]/rows` → edit one row.
- `DELETE /api/import/[id]/rows` → `{ rowIds: string[] }` → `{ deleted }`.
- `POST /api/import/[id]/save` → `{ createListName? }` →
  `{ savedCount, skippedCount, listId? }`.
- `POST /api/import/[id]/cancel` → `{ ok: true }`.

### Route path conventions

- All backend routes live under `/api/...` exclusively. There is **no**
  `/dashboard/api/...` prefix — that path serves the Next.js dashboard pages,
  not JSON APIs.
- Dynamic segments use `[id]` / `[emailId]` syntax in the filesystem; the
  actual request path substitutes the value
  (e.g. `/api/campaigns/camp-1/send`).
- The catch-all auth route `app/api/auth/[...nextauth]/route.ts` serves every
  NextAuth subpath (`/api/auth/csrf`, `/api/auth/session`,
  `/api/auth/callback/credentials`, `/api/auth/signout`, ...). Never send a
  request to the literal string `/api/auth/[...nextauth]`.

---

## Local contract-test evidence

The contracts above are locked down by executable Vitest suites. Run before
trusting any generated test:

```bash
npm run test -- auth api/contacts api/lists api/campaigns api/import api/reports api/settings
npm run typecheck
```

All suites pass as of this revision. See
`testsprite_tests/testsprite-mcp-test-report.md` for the full evidence table.
