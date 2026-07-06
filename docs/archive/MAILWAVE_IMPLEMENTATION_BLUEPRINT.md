# MailWave Implementation Blueprint

Generated from `MailWaveMockup.html` and `PRD.md`. Mockup takes priority when they differ.

---

## App Route Map

```
/                         → redirect to /dashboard
/login                    → Auth.js email/password login
/dashboard                → Summary cards, status pills, recent campaigns
/upload                   → CSV drag-and-drop upload
/import/[id]              → CSV review: column map, row table, edit, bulk actions
/contacts                 → Contacts index: table, search, filter, bulk actions
/contacts/add             → Add contact form (dedicated page per mockup)
/contacts/[id]            → Contact profile + AI profile panel
/lists                    → Lists index: table/cards, health metrics
/lists/[id]               → List detail: member table, health summary, actions
/campaigns                → Campaigns index: table, status, counts
/campaigns/create         → 5-step wizard (details → AI instructions → review → sending settings → confirmation)
/campaigns/[id]           → Campaign detail: live counters, progress bar, email drill-down
/reports                  → Reports: filters, summary cards, export
/settings                 → Tabbed settings: Account, SMTP, AI, Sending Limits, Notifications
```

---

## Core Entities

| Entity | Key Fields | Status Lifecycle |
|---|---|---|
| User | id, email, passwordHash, name, createdAt | — |
| SmtpConfig | id, userId, host, port, username, encryptedPassword, fromName, fromEmail, replyTo, encryption, dailyLimit, hourlyLimit, testedAt, status | connected / disconnected / failed |
| AiConfig | id, userId, provider, model, encryptedApiKey, defaultLanguage, defaultTone, defaultLength, enableSubject, enableProfile, enableBody, testedAt, status | connected / disconnected / invalid_key / error |
| Contact | id, userId, email, firstName, lastName, company, jobTitle, aiHint, customFields(json), status, importId, createdAt | ready / pending / suppressed / invalid / unsubscribed |
| Import | id, userId, filename, rowCount, validCount, invalidCount, duplicateCount, status, createdAt | pending / processing / review / saved / cancelled |
| ImportRow | id, importId, rowData(json), status, errorReason | valid / invalid / duplicate / missing_data |
| List | id, userId, name, createdAt | — |
| ListMember | id, listId, contactId, addedAt | — |
| Campaign | id, userId, name, listId, goal, product, cta, tone, language, emailLength, extraInstructions, generateSubject, generateBody, intervalType, minInterval, maxInterval, dailyLimit, hourlyLimit, scheduledAt, status, aiProvider, aiModel, createdAt | draft / generating / pending_review / ready_to_send / sending / paused / completed / failed |
| CampaignEmail | id, campaignId, contactId, subject, body, personalizationNotes, promptUsed, modelUsed, generatedAt, approvalStatus, revisionOf, sentAt, status, errorReason | pending / generated / approved / rejected / skipped / sending / sent / failed |
| DeliveryEvent | id, campaignEmailId, eventType, occurredAt, metadata(json) | sent / failed / bounced / opened / clicked / unsubscribed |
| Notification | id, userId, type, title, body, entityType, entityId, read, createdAt | — |
| NotificationPreference | id, userId, eventType, inApp, email | — |
| SendingAccount | id, userId, maxEmailsPerContact, suppressAfterEmails | — |

---

## Background Jobs

| Job | Queue | Trigger | Idempotency Key |
|---|---|---|---|
| ProcessImport | import | upload complete | importId |
| GenerateCampaignEmails | ai-generation | campaign starts generation | campaignId |
| GenerateSingleEmail | ai-generation | single regenerate action | campaignEmailId + revisionNumber |
| SendCampaignEmail | send | scheduler tick | campaignEmailId |
| TestSmtpConnection | util | user triggers test | userId + timestamp |
| TestAiConnection | util | user triggers test | userId + timestamp |
| NotifyUser | notifications | any event trigger | eventKey |

---

## AI Integration Boundaries

- Provider abstraction: `lib/ai/provider.ts` exports a single `generateEmail(input)` interface
- Supported providers: OpenAI, Anthropic, Google Gemini, OpenRouter, Custom (base URL + key)
- Inputs to generation: contact fields, aiHint, campaign goal, product, cta, tone, language, length, extra instructions
- Outputs: subject (optional), body, personalizationNotes, modelUsed, promptUsed
- Failures: record errorReason on CampaignEmail; never silently swallow
- Retries: up to 3 attempts per email with exponential backoff in the job
- Full spec: `docs/MAILWAVE_AI_PROVIDER_CONTRACT.md` (to be created in MW-016)

---

## Sending Engine Boundaries

- Worker polls approved CampaignEmails for campaigns in `sending` state
- Pacing: respects minInterval/maxInterval (random or fixed), dailyLimit, hourlyLimit, account-level maxEmailsPerContact
- Pre-send eligibility checks: SMTP connected, contact not suppressed/unsubscribed/invalid, email approved, not already sent
- Pause/resume: campaign status transitions gate the worker
- Full spec: `docs/MAILWAVE_SENDING_RULES.md` (to be created in MW-019)

---

## Required Planning Artifacts

| Artifact | Created In |
|---|---|
| `docs/MAILWAVE_IMPLEMENTATION_BLUEPRINT.md` | MW-001 (this file) |
| `docs/MAILWAVE_DATA_MODEL.md` | MW-003 |
| `docs/MAILWAVE_ENVIRONMENT.md` | MW-018 |
| `docs/MAILWAVE_AI_PROVIDER_CONTRACT.md` | MW-016 |
| `docs/MAILWAVE_SENDING_RULES.md` | MW-019 |
| `docs/MAILWAVE_NOTIFICATION_EVENTS.md` | MW-023 |

---

## Directory Structure

```
mailwave/
  app/                    # Next.js App Router pages and layouts
    (auth)/               # Login / signup routes (unauthenticated)
    (dashboard)/          # All authenticated routes
      dashboard/
      upload/
      import/[id]/
      contacts/
      contacts/add/
      contacts/[id]/
      lists/
      lists/[id]/
      campaigns/
      campaigns/create/
      campaigns/[id]/
      reports/
      settings/
  components/
    ui/                   # Primitives: Badge, Button, Card, Modal, Table, etc.
    layout/               # Shell, Sidebar, TopBar, NotificationCenter
    contacts/             # Contact-domain components
    campaigns/            # Campaign-domain components
    import/               # CSV import components
    lists/                # List components
    reports/              # Report components
    settings/             # Settings form components
  lib/
    ai/                   # AI provider abstraction
    smtp/                 # Nodemailer wrapper
    csv/                  # CSV parsing utilities
    auth/                 # Auth.js config
    prisma/               # Prisma client singleton
    notifications/        # Notification event triggers
  jobs/                   # BullMQ job definitions
  server/
    actions/              # Next.js Server Actions
    api/                  # Route handlers (REST endpoints where SA isn't ideal)
  prisma/
    schema.prisma
    seed.ts
  docs/
  public/
```

---

## MVP vs Post-MVP

### MVP (all stages 1-7)

- Email/password auth (Auth.js)
- CSV import with review and correction
- Contact management (CRUD, statuses, AI hint)
- Lists and list assignment
- Campaign wizard (5 steps)
- AI email generation (all supported providers)
- Campaign review and approval workflow
- SMTP sending with pacing and limits
- Campaign detail live view
- Reports with export
- In-app notifications
- Settings: Account, SMTP, AI, Sending Limits, Notifications tabs
- Error/empty/loading states on all screens

### Post-MVP (explicitly excluded)

- OAuth login (Google, GitHub)
- Email notifications (send to user's inbox)
- Real-time webhooks (opens, clicks, bounces)
- Multi-user / teams
- Custom domain tracking
- A/B testing
- Unsubscribe landing pages
- Mobile-first layout (mobile is basic fallback only)
- Billing / subscription management

---

## Key Mockup vs PRD Decisions

| Topic | Decision | Reason |
|---|---|---|
| Settings tabs | Account + SMTP + AI + Sending Limits + Notifications (5 tabs) | Mockup shows 5 tabs; PRD only lists 4 |
| Add Contact | Dedicated `/contacts/add` page | Mockup shows a dedicated page, not modal-only |
| Notifications | First-class in-app feature with preference center | Mockup shows notification center as a real product feature |
| Sending interval | Random range slider with humanized explanation | Mockup shows specific UX; PRD only describes the fields |
| AI Hint | First-class contact field, not optional metadata | Mockup uses it in multiple review flows |
