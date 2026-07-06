# Notifications Settings Loop Engineering Tasks

Use this checklist as a loop-engineering queue. Each loop should:

1. Pick exactly one unchecked task.
2. Define the expected outcome before editing.
3. Make the smallest safe change.
4. Run the listed verification commands.
5. Mark the task as completed only after verification passes or the remaining risk is documented.

---

## Context

The `NotificationsSettings` tab (`components/settings/settings-client.tsx`) renders 8 toggles across
4 groups (Campaigns, AI, Delivery, System). Currently all state is local-only and the "Save
Preferences" button is a no-op. The `NotificationPreference` model already exists in the DB schema
with fields `userId`, `eventType`, `inApp`, `email`, and a unique constraint on `[userId, eventType]`.

### Event-type mapping

| UI key               | DB `eventType`              | Notification type created today                    |
|----------------------|-----------------------------|----------------------------------------------------|
| `campaign_complete`  | `campaign_complete`         | `campaign.sending_complete` (send-campaign.ts)     |
| `campaign_error`     | `campaign_error`            | none yet                                           |
| `ai_email_ready`     | `ai_email_ready`            | `campaign.generation_complete` (generate-campaign) |
| `ai_email_error`     | `ai_email_error`            | `campaign.generation_failed` (generate-campaign)   |
| `email_bounced`      | `email_bounced`             | none yet                                           |
| `daily_digest`       | `daily_digest`              | none yet (requires scheduled job)                  |
| `system_alerts`      | `system_alerts`             | none yet (out of scope for now)                    |
| `low_credits`        | `low_credits`               | none yet (out of scope for now)                    |

### Default values (applied when no DB row exists for the user)

`campaign_complete: true`, `campaign_error: true`, `ai_email_ready: false`,
`ai_email_error: true`, `email_bounced: true`, `daily_digest: false`,
`system_alerts: true`, `low_credits: true`

---

## Tasks

### NOTIF-001. Create the notification-preferences API (GET + PATCH)

- [x] **Status:** Complete
- **Priority:** High
- **Depends on:** None
- **Files to touch:**
  - `app/api/settings/notification-preferences/route.ts` (new file)
- **Problem:** No API exists to read or persist notification preferences. The UI has no way to
  load saved preferences on mount or auto-save a toggle change.
- **Expected outcome:** Two endpoints:
  - `GET /api/settings/notification-preferences` — returns an object keyed by `eventType`
    with the user's saved `inApp` value, falling back to the documented defaults for any
    missing row.
  - `PATCH /api/settings/notification-preferences` — body `{ eventType: string, inApp: boolean }`,
    upserts a single `NotificationPreference` row.
- **Done when:** Both routes respond correctly for an authenticated session; unknown
  `eventType` values are rejected with 400.
- **Verification:**
  ```bash
  npx vitest run app/api/settings/settings.api.test.ts
  npx tsc --noEmit
  ```
- **Risk / notes:** The `email` column exists in the model but the UI only exposes `inApp`
  toggles. Leave `email` hardcoded to `false` for now; a future task can add email-notification
  delivery.

---

### NOTIF-002. Wire UI: load preferences on mount + auto-save on toggle

- [x] **Status:** Complete
- **Priority:** High
- **Depends on:** NOTIF-001
- **Files to touch:**
  - `components/settings/settings-client.tsx` — `NotificationsSettings` function
- **Problem:** The component uses local state only. Preferences are never loaded from the DB
  and the "Save Preferences" button does nothing.
- **Expected outcome:**
  - On mount, `useQuery` fetches `GET /api/settings/notification-preferences` and initialises
    the toggles from the response (defaults applied server-side).
  - `toggle(key)` calls `PATCH /api/settings/notification-preferences` with `{ eventType: key,
    inApp: newValue }` immediately — no explicit save button.
  - The "Save Preferences" button is removed.
  - A loading skeleton is shown while the query is pending.
- **Done when:** Toggling a switch persists to DB and survives a page reload.
- **Verification:**
  ```bash
  npx tsc --noEmit
  npx next build
  ```
- **Risk / notes:** Optimistic update pattern recommended: flip the toggle immediately in local
  state, then invalidate/refetch on success. On error, revert and show a toast.

---

### NOTIF-003. Respect `campaign_complete` preference in send-campaign job

- [x] **Status:** Complete
- **Priority:** Medium
- **Depends on:** NOTIF-001
- **Files to touch:**
  - `lib/jobs/send-campaign.ts`
- **Problem:** `prisma.notification.create` for `campaign.sending_complete` is always called
  regardless of the user's preference.
- **Expected outcome:** Before creating the notification, look up the user's `campaign_complete`
  preference. If `inApp` is `false` (or no row exists and the default is `false`), skip the
  `prisma.notification.create` call.
- **Done when:** Unit test demonstrates the notification is skipped when the preference is off.
- **Verification:**
  ```bash
  npx vitest run lib/jobs/send-campaign.test.ts
  npx tsc --noEmit
  ```
- **Risk / notes:** Default for `campaign_complete` is `true`, so existing behaviour is
  preserved for users who have never changed the setting.

---

### NOTIF-004. Respect `ai_email_ready` / `ai_email_error` preferences in generate-campaign job

- [x] **Status:** Complete
- **Priority:** Medium
- **Depends on:** NOTIF-001
- **Files to touch:**
  - `lib/jobs/generate-campaign.ts`
- **Problem:** `prisma.notification.create` for `campaign.generation_complete` and
  `campaign.generation_failed` are always called, ignoring user preferences.
- **Expected outcome:** Before each `prisma.notification.create`, look up the matching
  preference (`ai_email_ready` / `ai_email_error`) and skip if `inApp` is `false`.
- **Done when:** Unit test covers the skipped-notification path for each event.
- **Verification:**
  ```bash
  npx vitest run lib/jobs/generate-campaign.test.ts
  npx tsc --noEmit
  ```
- **Risk / notes:** Fetch both preferences in a single `prisma.notificationPreference.findMany`
  call at the top of `processGenerate` to avoid N+1 queries.

---

### NOTIF-005. Implement `campaign_error` notification

- [x] **Status:** Complete
- **Priority:** Medium
- **Depends on:** NOTIF-003 (preference-check pattern already established)
- **Files to touch:**
  - `lib/jobs/send-campaign.ts`
- **Problem:** There is no notification when a campaign transitions to `failed` status. The
  `campaign_error` toggle exists in the UI but never fires.
- **Expected outcome:** When `processSend` sets campaign status to `"failed"` (SMTP not
  configured path, line 32), it creates a `campaign.sending_failed` notification if the
  user's `campaign_error` preference has `inApp: true`.
- **Done when:** A test mocks an SMTP misconfiguration and asserts the notification is created
  (when pref is on) and skipped (when pref is off).
- **Verification:**
  ```bash
  npx vitest run lib/jobs/send-campaign.test.ts
  npx tsc --noEmit
  ```

---

### NOTIF-006. Implement `email_bounced` notification

- [x] **Status:** Complete
- **Priority:** Low
- **Depends on:** NOTIF-003 (preference-check pattern)
- **Files to touch:**
  - `lib/jobs/send-campaign.ts`
- **Problem:** When `transporter.sendMail` throws, the email is marked `failed` but no
  in-app notification is created for the bounce. The `email_bounced` toggle has no effect.
- **Expected outcome:** In the `catch` block of the send loop, after updating
  `campaignEmail.status` to `"failed"`, check the user's `email_bounced` preference and
  create a `delivery.email_bounced` notification if `inApp: true`. Aggregate by campaign
  (one notification per campaign, not per email) to avoid notification spam — debounce by
  only creating the notification if none exists with the same `campaignId` in the last hour.
- **Done when:** Test asserts notification is created on first bounce and suppressed on
  subsequent bounces within the debounce window.
- **Verification:**
  ```bash
  npx vitest run lib/jobs/send-campaign.test.ts
  npx tsc --noEmit
  ```
- **Risk / notes:** The debounce check adds a DB read per failed email. Consider tracking a
  `lastBounceNotifiedAt` field on Campaign if this becomes a performance concern.

---

### NOTIF-007. Implement `daily_digest` notification (scheduled job)

- [x] **Status:** Complete
- **Priority:** Low
- **Depends on:** NOTIF-001
- **Files to touch:**
  - `lib/jobs/daily-digest.ts` (new file)
  - `lib/jobs/queue.ts` — add `daily_digest` queue name
  - Worker startup entry point (wherever `startSendWorker` / `startGenerateWorker` are
    registered)
- **Problem:** The `daily_digest` toggle exists in the UI but no job exists to produce the
  notification.
- **Expected outcome:** A BullMQ worker processes a daily repeatable job (cron `0 8 * * *`).
  For each user with `daily_digest` `inApp: true`, it queries the previous 24 hours of
  `DeliveryEvent` rows and creates one `digest.daily` notification summarising sent / failed
  counts across all campaigns.
- **Done when:** Manual queue trigger creates the correct notification for a seeded user.
- **Verification:**
  ```bash
  npx vitest run lib/jobs/daily-digest.test.ts
  npx tsc --noEmit
  ```
- **Risk / notes:** `system_alerts` and `low_credits` are out of scope until an external
  alerting source (email provider quota API, etc.) is integrated. Leave their toggles wired
  to persist preferences (NOTIF-002) but document them as "reserved" in the UI with a
  tooltip.

---

## Completion rule

A task can be changed from `- [ ]` to `- [x]` only when:

- The implementation is complete.
- The listed verification command has been run and exits successfully.
- Any failure is documented with a follow-up task.
- The change is committed if it modifies repository files.
