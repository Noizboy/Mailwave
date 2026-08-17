# Mailwave — Product Requirements Document (PRD)

> Document status: Retrospective PRD generated from the currently implemented system (snapshot of the `main` codebase). It describes the existing features "as they are" (`as-built`), not the future vision. For evolution plans, create a separate incremental PRD.

---

## 1. Executive summary

**Mailwave** is a self-hosted SaaS application for **cold email automation** aimed at individual users (single-user accounts, no teams or multi-tenancy). It combines:

- **AI-generated personalized emails** (multi-provider: OpenAI, Anthropic, Google Gemini, OpenRouter, custom OpenAI-compatible).
- **Human review workflow** (approve / reject / regenerate) before sending.
- **Throttled sending through generic SMTP** with daily/hourly rate limits, inter-send intervals, and open tracking via 1x1 pixel.
- **Contact and list management** with CSV import (automatic column detection, validation and deduplication).
- **Reporting and analytics** with KPIs, per-campaign breakdown, email log and CSV export.
- **Background job stack** on BullMQ + Redis (generation, sending, suppression, digest).
- **In-app notifications** with per-event preferences.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 + PostgreSQL · NextAuth v5 (JWT, Credentials) · BullMQ + Redis · nodemailer · shadcn/ui + Tailwind v4 · Vitest + Playwright.

**Target users:** professionals / Growth / SDRs running cold outreach to small/medium lists who need fine-grained control over AI-generated content before sending.

---

## 2. Goals and non-goals

### Goals (covered by the current system)
1. Let a user import contacts from CSV and organize them into lists.
2. Generate personalized cold outreach emails per contact using AI, with control over tone, goal, CTA, length and language.
3. Enable per-email human review (approve, reject, edit, regenerate) before sending.
4. Send through the user's own SMTP with configurable throttling, without exceeding daily/hourly limits or a per-contact send cap.
5. Measure opens via a tracking pixel and report delivery rate, open rate and the status of each email.
6. Provide in-app notifications for relevant events (generation completed/failed, sending completed/failed, bounce).
7. Store secure credentials (SMTP, AI), API keys encrypted at rest.

### Non-goals (explicitly out of current scope)
- User registration/self-signup (users are created via seed or migration).
- Multi-tenancy, teams, roles, permissions or invitations.
- Click tracking, injected unsubscribe links, or provider bounce/complaint webhooks.
- Reusable templates as a first-class entity (campaign "parameters" act as template inputs).
- Billing, subscriptions, usage-limited plans, or credits.
- A/B testing or subject-line variants.
- Per-recipient scheduling (only per-campaign `scheduledAt` plus inter-send intervals).

---

## 3. Users and personas

| Persona | Description | Needs covered |
|---|---|---|
| **Outreach operator (single account)** | Professional who manages their own lists and campaigns. Full admin of their account. | Import contacts, generate with AI, review, send with throttling, measure. |

There are no other roles. All authorization reduces to **owner-scoping by `userId`**: every query filters by the authenticated user; no granular permissions exist.

---

## 4. High-level architecture

```
┌───────────────────────┐      ┌────────────────────────┐      ┌──────────────┐
│  Browser (Next.js UI) │◄────►│  Next.js App Router    │◄────►│ PostgreSQL   │
│  React 19 + RQ/Table  │  HX  │  (Server Components,   │      │ (Prisma 7)   │
│  shadcn/ui + Tailwind │      │   API routes, Proxy)   │      └──────────────┘
└───────────────────────┘      └──────────┬─────────────┘
                                          │ enqueue/dequeue
                                          ▼
                                 ┌────────────────────────┐      ┌──────────────┐
                                 │  BullMQ workers (tsx)  │◄────►│   Redis      │
                                 │  generate / send /     │      └──────────────┘
                                 │  suppress / digest     │
                                 └──────────┬─────────────┘
                                            │ calls / sends
                                  ┌─────────┴─────────┐
                                  ▼                   ▼
                          ┌──────────────┐    ┌──────────────┐
                          │  AI providers│    │  SMTP server │
                          │              │    │  (nodemailer)│
                          └──────────────┘    └──────────────┘
```

- **Authentication:** NextAuth v5, JWT session, Credentials provider, middleware in `proxy.ts`.
- **Encryption at rest:** AES-256-GCM (`lib/crypto.ts`) for SMTP password and AI API keys (uses `ENCRYPTION_KEY`).
- **Background jobs:** 4 BullMQ workers; serial for sending (concurrency 1), concurrency 2 for generation and suppression.
- **Tracking:** pixel `GET /api/track/{emailId}` returns a 1x1 GIF and records an `opened` event.

---

## 5. Functional requirements

Each feature is tagged with **[EXISTS]** to indicate it is already implemented in the current snapshot.

### 5.1 Authentication and session

| ID | Requirement | Details |
|---|---|---|
| AUTH-01 | **Credentials login** [EXISTS] | Email/password form at `/login`; uses NextAuth `signIn("credentials")`; password ≥ 8 chars validated with zod; bcrypt comparison. |
| AUTH-02 | **JWT session** [EXISTS] | `session.strategy = "jwt"`; the `jwt` callback injects `user.id`; `session` exposes `session.user.id`. |
| AUTH-03 | **Route protection** [EXISTS] | Middleware `proxy.ts`: public routes `/login` and `/api/auth`; unauthenticated → redirect `/login?callbackUrl=...` (pages) or 401 JSON (API); authenticated on `/login` → redirect `/dashboard`. |
| AUTH-04 | **Owner-scoping** [EXISTS] | Every Prisma query filters by `userId: session.user.id`; updates/deletes use `updateMany`/`deleteMany` with a `userId` filter; nested relations filter by `campaign.userId` or equivalent. |
| AUTH-05 | **Password change** [EXISTS] | `POST /api/settings/account/password`: verifies current bcrypt, hashes new one with cost 12. |
| AUTH-06 | **No public signup** [EXISTS] | No signup UI exists; users are created via seed (`demo@mailwave.app` / `password123`) or migration. |

### 5.2 Contacts

| ID | Requirement | Details |
|---|---|---|
| CON-01 | **Contact CRUD** [EXISTS] | List (paginated, filterable), create, get, patch, delete. Unique email per user (`@@unique([userId, email])`), stored lowercase. |
| CON-02 | **Search and filters** [EXISTS] | Filters: search (email/name/company), `status`, `listId`, date range. Pagination max 100/page. |
| CON-03 | **Contact statuses** [EXISTS] | `ContactStatus`: `subscribed`, `unsubscribed`, `suppressed`, `invalid`. `unsubscribed` contacts are immutable (not editable). |
| CON-04 | **Custom fields** [EXISTS] | JSON `customFields` column; populated from CSV mapping of unknown columns. |
| CON-05 | **Threshold auto-suppression** [EXISTS] | `emailsSentCount` is incremented per send; when reaching `suppressAfterEmails`, status becomes `suppressed` (in the send worker and the `apply-suppress-threshold` job). |
| CON-06 | **Bulk operations** [EXISTS] | Mass assignment to a list (`bulk-assign-list-dialog`), mass status change (`bulk-change-status-dialog`). |
| CON-07 | **Individual edit** [EXISTS] | Per-contact edit dialog (`contact-edit-dialog`). |

### 5.3 Lists

| ID | Requirement | Details |
|---|---|---|
| LST-01 | **List CRUD** [EXISTS] | Create, rename, delete, list-with-stats, detail-with-members. |
| LST-02 | **Per-list stats** [EXISTS] | total, subscribed, invalid, suppressed, unsubscribed. |
| LST-03 | **Member management** [EXISTS] | Add/remove `contactIds` in bulk (ownership checked). Unique constraint `[listId, contactId]`. |
| LST-04 | **Campaign targeting** [EXISTS] | Campaigns point to a `listId`; the send worker pulls `subscribed` members from the campaign's list. |

### 5.4 CSV import

| ID | Requirement | Details |
|---|---|---|
| IMP-01 | **Multipart upload** [EXISTS] | Form at `/upload` → `POST /api/import` (multipart). |
| IMP-02 | **Custom CSV parser** [EXISTS] | `lib/csv.ts`: quote-aware parser, duplicate-header detection, automatic email column detection (EN+ES aliases: email/e-mail/correo/mail/…), regex email validation. |
| IMP-03 | **Column mapping** [EXISTS] | `KNOWN_COLUMN_MAP` maps common variations (incl. Spanish: nombre, apellido, empresa, cargo) to firstName/lastName/company/jobTitle/aiHint/email/linkedin. Unknown columns → custom fields. Mapping editable in UI. |
| IMP-04 | **Row validation** [EXISTS] | `ImportRowStatus`: `valid`, `invalid`, `duplicate`, `missing_data`, with `errorReason`. Duplicates detected against the user's existing contacts and within the file. |
| IMP-05 | **Review and edit** [EXISTS] | `/import/[id]`: edit row (re-validated), delete row(s), adjust mapping, choose destination list (existing or create new). |
| IMP-06 | **Persistence (save)** [EXISTS] | `POST /api/import/[id]/save`: upserts valid contacts (lowercase email), adds to list, marks import `saved`. |
| IMP-07 | **Cancellation** [EXISTS] | `POST /api/import/[id]/cancel`: marks `cancelled`, deletes rows. |
| IMP-08 | **State machine** [EXISTS] | `pending → processing → review → saved | cancelled`. |

### 5.5 Campaigns

| ID | Requirement | Details |
|---|---|---|
| CMP-01 | **Campaign listing** [EXISTS] | `/campaigns` with statuses and derived metrics. |
| CMP-02 | **Creation wizard** [EXISTS] | `/campaigns/create`: name, list, goal, product, cta, tone, language (default `en`), emailLength (`very-short`/`short`/`medium`/`long`), custom systemPrompt, intervalType (`fixed`/`random`), min/max interval (min, default 3/8), daily/hourly limits, AI provider/model override, optional `scheduledAt`. |
| CMP-03 | **Lifecycle** [EXISTS] | `pending → generating → pending_review → ready_to_send → sending → (paused | completed | failed)`. |
| CMP-04 | **Detail & review** [EXISTS] | `/campaigns/[id]`: generate (full or retry-failed), approve-all, approve/reject/edit per email, regenerate (subject or body) per email, send, pause, cancel, retry-failed, delete. |
| CMP-05 | **Scheduling** [EXISTS] | `POST /api/campaigns` enqueues a delayed BullMQ job when `scheduledAt` is in the future. |
| CMP-06 | **Concurrency control** [EXISTS] | `activeSendRunId`: only one send run "owns" the campaign at a time; stale runs are detected and ignored. |
| CMP-07 | **Derived metrics** [EXISTS] | `lib/campaign-metrics.ts` computes sentCount, failedCount, skippedCount, pendingCount, approvalPendingCount. |
| CMP-08 | **Clean cancellation** [EXISTS] | Cancel removes the scheduled delayed job, resets `failed → approved`, moves to `ready_to_send`. |
| CMP-09 | **Name dedup** [EXISTS] | Creation avoids duplicate names per user. |

### 5.6 Campaign emails (generated content)

| ID | Requirement | Details |
|---|---|---|
| EML-01 | **CampaignEmail entity** [EXISTS] | `@@unique([campaignId, contactId])`. Fields: subject, body, personalizationNotes, promptUsed, modelUsed, generatedAt, approvalStatus, status, sentAt, errorReason, retryCount, revisionOf. |
| EML-02 | **Approval statuses** [EXISTS] | `ApprovalStatus`: `pending`, `approved`, `rejected`, `skipped`. |
| EML-03 | **Send statuses** [EXISTS] | `CampaignEmailStatus`: `pending`, `generated`, `approved`, `rejected`, `skipped`, `sending`, `sent`, `failed`. |
| EML-04 | **Editing** [EXISTS] | `PATCH /api/campaigns/[id]/emails/[emailId]`: edits subject/body/approvalStatus; rejects if the contact is `suppressed`. |
| EML-05 | **Paginated listing** [EXISTS] | `GET /api/campaigns/[id]/emails` with `approvalStatus` and `status` filters, `opened` flag. |
| EML-06 | **Individual regeneration** [EXISTS] | `POST .../regenerate` with `target: subject | body`. |

### 5.7 AI generation

| ID | Requirement | Details |
|---|---|---|
| AI-01 | **Multi-provider** [EXISTS] | `lib/ai.ts`: `openai`, `anthropic`, `google_gemini` (via OpenAI-compatible endpoint), `openrouter` (OpenAI-compatible + `HTTP-Referer`/`X-Title` headers), `custom` (OpenAI-compatible). |
| AI-02 | **Default models** [EXISTS] | gpt-4o-mini, claude-haiku-4-5-20251001, gemini-1.5-flash, openai/gpt-4o-mini, gpt-4o-mini. |
| AI-03 | **Prompt building** [EXISTS] | `buildSystemPrompt` (goal/product/cta/tone/language/length guidance/anti-placeholder) + `buildUserPrompt` (contact fields + customFields). |
| AI-04 | **Structured output** [EXISTS] | JSON `{subject, body, personalizationNotes}`; markdown fences removed; fallback to raw text if parsing fails. |
| AI-05 | **Anti-placeholder guard** [EXISTS] | Explicit instruction not to use `[Your Name]` or other placeholders. |
| AI-06 | **Bulk generation** [EXISTS] | `generate-campaign` worker (concurrency 2, 3 attempts, exponential 5s backoff). Marks campaign `generating → pending_review`. Skips already-generated emails. |
| AI-07 | **Service error detection** [EXISTS] | Timeouts, 401, 5xx, network errors → aborts early with `failed` + notification. |
| AI-08 | **Individual regeneration** [EXISTS] | Per email, with subject/body target. |
| AI-09 | **AI connection test** [EXISTS] | Generates a test email; maps errors to human-readable messages. |
| AI-10 | **Per-campaign override** [EXISTS] | Each campaign can specify an `aiProvider`/`aiModel` different from the account default. |

### 5.8 Email sending (SMTP)

| ID | Requirement | Details |
|---|---|---|
| SND-01 | **Serial throttled sending** [EXISTS] | `send-campaign` worker (concurrency 1). Claims the campaign with a `sendRunId`; loops over approved emails. |
| SND-02 | **Daily/hourly rate limits** [EXISTS] | Counts `sent` events in the last hour/day; if exceeded, computes a delay and re-enqueues a delayed job. |
| SND-03 | **Per-contact cap** [EXISTS] | If `emailsSentCount >= suppressAfterEmails` → skip + mark `skipped`. |
| SND-04 | **Inter-send intervals** [EXISTS] | `fixed` or `random` between `minInterval`/`maxInterval` (minutes). Updates `nextSendAt`. |
| SND-05 | **Pause-aware** [EXISTS] | Re-checks campaign status on each iteration; respects `paused`. |
| SND-06 | **Tracking pixel** [EXISTS] | Injects `<img src="{AUTH_URL}/api/track/{emailId}">` into the HTML. |
| SND-07 | **Event logging** [EXISTS] | `sent` and `failed` as `DeliveryEvent`. |
| SND-08 | **Auto-suppression on send** [EXISTS] | Increments `emailsSentCount`; reaching the threshold changes the contact status to `suppressed`. |
| SND-09 | **Bounce notification** [EXISTS] | On failure, creates a `delivery.email_bounced` notification rate-limited to 1/hour/campaign. |
| SND-10 | **Completion** [EXISTS] | No emails remaining → `completed` (sets `completedAt`); otherwise → `paused`. `campaign.sending_complete` notification if the preference is enabled. |
| SND-11 | **Retry failures** [EXISTS] | `POST /api/campaigns/[id]/retry-failed`: resets `failed → approved` and re-enqueues the send job. |
| SND-12 | **Pause / cancel** [EXISTS] | `pause` stops the loop; `cancel` removes the scheduled job, resets failures to approved, returns to `ready_to_send`. |

### 5.9 Open tracking

| ID | Requirement | Details |
|---|---|---|
| TRK-01 | **Open pixel** [EXISTS] | `GET /api/track/[emailId]`: returns a transparent 1x1 GIF (base64), `Cache-Control: no-store`. Records `opened` DeliveryEvent only if the email is `sent`. Errors silently swallowed (pixel is always returned). |
| TRK-02 | **Open deduplication** [EXISTS] | In reports, opens are grouped by `campaignEmailId` and counted once per email. |
| TRK-03 | **No click tracking** [EXISTS] | Not implemented (known gap). |
| TRK-04 | **No bounce webhooks** [EXISTS] | Bounces are inferred only from `nodemailer.send` errors. |

### 5.10 Dashboard and reports

| ID | Requirement | Details |
|---|---|---|
| RPT-01 | **Dashboard** [EXISTS] | `/dashboard` + `GET /api/dashboard`: totalContacts, totalLists, activeCampaigns, emailsSent, failedEmails, pendingReviews, SMTP/AI status, 5 recent campaigns with metrics. Quick actions: Upload CSV, Create Campaign. |
| RPT-02 | **Aggregated reports** [EXISTS] | `GET /api/reports`: totalContacts, activeContacts, totalCampaigns, completedCampaigns, totalEmailsSent, totalFailed, deliveryRate (%), totalOpened (dedup), openRate (%), top-20 active/completed campaigns with per-campaign metrics + openedCount. |
| RPT-03 | **Email log** [EXISTS] | `GET /api/reports/emails`: paginated, filters (campaignId, status, q, from, to), per-page 10–100, stats groupBy status (sent/failed/generated/skipped/pending). |
| RPT-04 | **CSV export** [EXISTS] | `GET /api/reports/export`: downloads `mailwave-export.csv` with columns Campaign, First/Last Name, Email, Company, Subject, Approval, Status, Sent At. Optional `campaignId` filter. |

### 5.11 Notifications

| ID | Requirement | Details |
|---|---|---|
| NOT-01 | **In-app feed** [EXISTS] | `/notifications`; unread badge in TopBar; mark read / mark all read. |
| NOT-02 | **Event types** [EXISTS] | `campaign.generation_complete`, `campaign.generation_failed`, `campaign.sending_complete`, `campaign.sending_failed`, `delivery.email_bounced`, `digest.daily`. |
| NOT-03 | **Preferences** [EXISTS] | `NotificationPreference`: 8 event types with `inApp`/`email` flags. Defaults: campaign_complete=true, campaign_error=true, ai_email_ready=false, ai_email_error=true, email_bounced=true, daily_digest=false, system_alerts=true, low_credits=true. |
| NOT-04 | **Bounce rate-limit** [EXISTS] | Max 1 bounce notification/hour/campaign. |
| NOT-05 | **Daily digest** [EXISTS] | Worker creates `digest.daily` notifications for opt-in users with sent/failed counts from the last 24h. (No visible scheduler in the repo; must be enqueued externally.) |

### 5.12 Configuration / Settings

| ID | Requirement | Details |
|---|---|---|
| SET-01 | **Account** [EXISTS] | Get/update name; password change (bcrypt cost 12). |
| SET-02 | **Mail Server (SMTP)** [EXISTS] | host/port/username/password/fromName/fromEmail/replyTo/encryption (tls/ssl/none). Password masked on read; AES-256-GCM encrypted at rest. "Test connection" (verify or test send, humanized errors). connected/disconnected/failed status with `testedAt`. |
| SET-03 | **AI Integration** [EXISTS] | Provider select (5 options), model, masked API key, optional baseUrl. "Test connection" generates a test email. |
| SET-04 | **Sending Limits** [EXISTS] | dailyLimit (1–100000), hourlyLimit (1–10000), suppressAfterEmails (1–1000). Changing the threshold enqueues a suppression job. |
| SET-05 | **Notifications** [EXISTS] | Toggle `inApp` per event type. |

### 5.13 Background jobs

| ID | Requirement | Details |
|---|---|---|
| JOB-01 | **Unified worker** [EXISTS] | `jobs/worker.ts` starts 4 workers; graceful shutdown on SIGINT/SIGTERM. Run via `npm run worker`. |
| JOB-02 | **generate-campaign** [EXISTS] | Concurrency 2, 3 attempts, exponential 5s backoff. |
| JOB-03 | **send-campaign** [EXISTS] | Concurrency 1 (serial), self-requeue with delays for rate limits. |
| JOB-04 | **suppress-contacts** [EXISTS] | Concurrency 2, batched 500/batch, rate-limited 10 jobs/min. Triggered when changing sending-limits. |
| JOB-05 | **daily-digest** [EXISTS] | Concurrency 1; creates `digest.daily` for opt-ins. |

---

## 6. Non-functional requirements

| Category | Requirement | Current implementation |
|---|---|---|
| **Security — Auth** | JWT session signed with `AUTH_SECRET`; Credentials provider with bcrypt cost 12. | NextAuth v5 in `lib/auth.ts`; `proxy.ts` middleware. |
| **Security — Encryption at rest** | SMTP credentials and AI API keys encrypted with AES-256-GCM (IV + auth tag, base64). | `lib/crypto.ts` using `ENCRYPTION_KEY` (≥32 chars). |
| **Security — Owner-scoping** | Every read/write filters by `userId`; no cross-user data access possible by query design. | Applied in every API route. |
| **Security — Validation** | All API input validated with zod (campaign, contact, SMTP, AI, sending-limits, notif prefs, password, import rows). | Schemas in each route. |
| **Privacy** | No click tracking, and no PII sent to third parties beyond the user-selected AI provider. | Pixel records opens only, no cookies or fingerprinting. |
| **Performance** | Pagination on all lists (max 100/page); indexes on `[userId, status]`, `[campaignId, status]`, `[campaignId, approvalStatus]`, `[userId, read]`, `[importId, status]`. | `prisma/schema.prisma`. |
| **Send concurrency** | Serial per worker; `activeSendRunId` prevents races between runs. | `send-campaign.ts`. |
| **Job resilience** | BullMQ retries with exponential backoff; AI service error detection aborts early. | `generate-campaign.ts`. |
| **Observability** | In-app notifications for generation/sending/bounce failures; logs to `worker.log`/`worker_err.log`. | Notification system + log files. |
| **Maintainability** | Strict TypeScript, ESLint, co-located tests, tokenized design system (HSL vars). | `tsconfig.json`, `eslint.config.mjs`, `app/globals.css`. |
| **Compatibility** | Next.js 16, React 19, Node.js "nodejs" runtime on all API routes. | `package.json`, `runtime = "nodejs"`. |

---

## 7. Data model (summary)

Main entities (see `prisma/schema.prisma` for full detail):

- **User** (1:1 SmtpConfig, AiConfig, SendingAccount; 1:N Campaign, Contact, Import, List, Notification, NotificationPreference)
- **SmtpConfig**, **AiConfig**, **SendingAccount** (`suppressAfterEmails`)
- **Contact** (customFields JSON, `@@unique([userId, email])`, `emailsSentCount`)
- **Import** + **ImportRow** (state machine, `columnMapping` JSON)
- **List** + **ListMember** (join)
- **Campaign** (AI params, intervals, limits, `activeSendRunId`, counters)
- **CampaignEmail** (`@@unique([campaignId, contactId])`, `approvalStatus`, `status`, `revisionOf`)
- **DeliveryEvent** (`sent`/`opened`/`failed`, metadata JSON)
- **Notification**, **NotificationPreference**

Enums: `ContactStatus`, `ImportStatus`, `ImportRowStatus`, `CampaignStatus`, `CampaignEmailStatus`, `ApprovalStatus`, `SmtpConnectionStatus`, `AiConnectionStatus`, `IntervalType`, `AiProvider`.

---

## 8. API surface (summary)

Endpoint groups (all under `/api`, all owner-scoped):

- `auth/[...nextauth]`
- `dashboard`, `reports`, `reports/emails`, `reports/export`
- `campaigns`, `campaigns/[id]`, `campaigns/[id]/{generate,send,pause,cancel,retry-failed,approve-all,emails,emails/[emailId],emails/[emailId]/regenerate}`
- `contacts`, `contacts/[id]`
- `lists`, `lists/[id]`, `lists/[id]/members`
- `import`, `import/[id]`, `import/[id]/rows`, `import/[id]/{save,cancel}`
- `track/[emailId]`
- `notifications`, `notifications/[id]`
- `settings/{account,account/password,smtp,smtp/test,ai,ai/test,sending-limits,notification-preferences}`

---

## 9. UI / UX

- **Layout**: Sidebar (desktop + MobileSidebar via Sheet) + TopBar; sidebar context in `lib/sidebar-context.tsx`.
- **Design system**: shadcn/ui + Radix, Tailwind v4, HSL tokens in `app/globals.css`; `StatusBadge` maps statuses to CVA variants (`lib/status-colors.ts`).
- **Shared components**: `PageHeader`, `MetricCard`, `FilterBar`, `DataPagination`, `StatusBadge`.
- **Forms**: react-hook-form + zod + `@hookform/resolvers`.
- **Tables**: TanStack Table; data fetching with TanStack Query.
- **Main pages**: Dashboard, Campaigns (list/create/detail), Contacts, Lists (list/detail), Import review, Upload, Reports, Notifications, Settings (5 tabs).

---

## 10. Testing

| Level | Tool | Coverage |
|---|---|---|
| Unit / Component | Vitest (jsdom) | `lib/*.test.ts` (ai, campaign-metrics, crypto, csv, utils) + co-located tests next to routes and components. |
| API routes | Vitest with `// @vitest-environment node` | Harness in `test/api-helpers.ts`; mocks in `lib/__mocks__/`. |
| E2E | Playwright | `e2e/` (global seed, one-time login with storage state, OpenAI-compatible AI stub, real BullMQ worker → Redis required) + `testsprite_tests/`. |

Commands: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:e2e`, `npm run prisma:push`, `npm run seed`.

Services required locally: **PostgreSQL** and **Redis**.

---

## 11. Configuration / Environment

Variables (see `.env.example`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL URL for Prisma. |
| `AUTH_SECRET` | NextAuth JWT signing secret. |
| `AUTH_URL` | Public base URL (used by Auth.js and the tracking pixel). |
| `ENCRYPTION_KEY` | AES-256-GCM key (≥32 chars) to encrypt credentials. |
| `REDIS_URL` | Redis URL for BullMQ. |

---

## 12. Known gaps and out of scope (for future planning)

These are NOT current features; they are listed so an incremental PRD can pick them up:

1. User registration/self-signup (today: seed-only).
2. Multi-tenancy, teams, roles, permissions, invitations.
3. Click tracking and injected unsubscribe links.
4. Provider bounce/complaint webhooks (SendGrid/SES/Postmark).
5. Reusable templates as a first-class entity.
6. Billing, subscriptions, usage-limited plans, credits.
7. A/B testing and subject-line variants.
8. Per-recipient scheduling.
9. Visible scheduler/cron for `daily-digest` (today requires external enqueueing).
10. `support.js` is a vendored artifact from another project ("dc-runtime"); not part of the product.

---

## 13. Global acceptance criteria (current system)

The system "as it stands" meets expectations if:

- ✅ A user can log in and all their routes/pages are protected.
- ✅ The user can import contacts from CSV, map columns, validate and persist into a list.
- ✅ The user can create a campaign pointing to a list, with AI parameters and throttling.
- ✅ The user can generate emails with AI (bulk or individually), review, edit, approve/reject them.
- ✅ The user can send through their own SMTP respecting daily/hourly limits, intervals and the per-contact cap.
- ✅ Opens are recorded via pixel and reported (deduped) on dashboard/reports.
- ✅ Credentials (SMTP, API keys) are encrypted at rest and masked when read.
- ✅ In-app notifications are generated on key events and preferences are respected.
- ✅ Background jobs are resilient (retries, backoff) and shutdown is graceful.
- ✅ Every query is owner-scoped by `userId` (no cross-user data leakage).