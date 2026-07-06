# MailWave Data Model

Defined in `prisma/schema.prisma`. This document explains entity purposes, status lifecycles, and key relationships.

---

## Entities

### User
Single-tenant account. All other entities are scoped by `userId`.
- Has one optional `SmtpConfig`, `AiConfig`, `SendingAccount`
- Has many `Contact`, `Import`, `List`, `Campaign`, `Notification`

### SmtpConfig
Stores SMTP credentials (password encrypted via AES-256-GCM).
Status: `connected | disconnected | failed`
- `status` is refreshed each time a connection test runs
- `dailyLimit` / `hourlyLimit` are user-level defaults; campaign-level limits override them

### AiConfig
Stores AI provider credentials (API key encrypted).
Status: `connected | disconnected | invalid_key | error`
- `enableSubject`, `enableProfile`, `enableBody` control which generation features are active

### SendingAccount
Account-level sending guardrails.
- `maxEmailsPerContact` — contacts are auto-suppressed after this many sent emails
- `suppressAfterEmails` — redundant alias kept for display clarity

### Contact
The core addressable entity.
Status lifecycle: `pending → ready | invalid | suppressed | unsubscribed`
- Created from import or add-contact flow; defaults to `pending`
- `ready` = email valid + all required data present + not suppressed
- `invalid` = email format failed or bounced
- `suppressed` = manually suppressed or hit send limit
- `unsubscribed` = terminal; cannot be re-enabled
- `emailsSentCount` increments on each successful send; triggers auto-suppress when it reaches `SendingAccount.maxEmailsPerContact`
- `aiHint` is a free-text field used as additional context for AI generation
- `customFields` is a JSON object for arbitrary extra columns from CSV imports

### Import
Tracks a CSV upload session.
Status: `pending → processing → review → saved | cancelled`
- `rows` hold raw parsed data until the user confirms save
- Contacts are only created in the `Contact` table after `saved`
- `columnMapping` is a JSON map from CSV column header → entity field

### ImportRow
One row of a pending import.
Status: `valid | invalid | duplicate | missing_data`
- User can edit `rowData` inline in the review table
- Rows are deleted when the import is saved or cancelled

### List
Named group of contacts for campaign segmentation.
- Deleting a list does NOT delete contacts
- Contacts can belong to multiple lists

### ListMember
Join table connecting contacts to lists.

### Campaign
Tracks a complete personalized email campaign.
Status lifecycle:
```
draft → generating → pending_review → ready_to_send → sending → paused ⇄ sending → completed
                                                              → failed
```
- `listId` is set at creation; changing it after generation is not supported
- `totalEmails`, `sentCount`, `failedCount`, `pendingCount`, `skippedCount` are denormalized counters updated on status transitions
- `intervalType = random` uses `minInterval..maxInterval` seconds; `fixed` uses `minInterval` only

### CampaignEmail
One generated (or to-be-generated) email per contact per campaign.
Status: `pending → generated → sending → sent | failed`
ApprovalStatus: `pending → approved | rejected | skipped`
- `revisionOf` links a regenerated email to the ID it replaced (audit trail)
- `promptUsed` and `modelUsed` are stored for auditability
- `retryCount` caps at 3 before marking `failed`
- Sending is only allowed when `status = generated` AND `approvalStatus = approved`

### DeliveryEvent
Immutable event log per sent email.
- `eventType`: `sent | failed | bounced | opened | clicked | unsubscribed`
- Used for reporting; never mutated

### Notification
In-app notification.
- `type`: e.g., `campaign_complete`, `ai_error`, `smtp_error`, `import_done`
- `entityType` + `entityId`: optional link to the source entity

### NotificationPreference
Per-event channel preferences for a user.
- `inApp` — show in notification center
- `email` — send email notification (post-MVP)

---

## Key Constraints

- `Contact.email` is unique per user (`@@unique([userId, email])`)
- `CampaignEmail` is unique per campaign+contact (`@@unique([campaignId, contactId])`)
- `ListMember` is unique per list+contact (`@@unique([listId, contactId])`)
- `NotificationPreference` is unique per user+eventType
- All child entities cascade delete when their parent User is deleted

---

## Status Enums Summary

| Entity | Statuses |
|---|---|
| Contact | ready, pending, suppressed, invalid, unsubscribed |
| Import | pending, processing, review, saved, cancelled |
| ImportRow | valid, invalid, duplicate, missing_data |
| Campaign | draft, generating, pending_review, ready_to_send, sending, paused, completed, failed |
| CampaignEmail (status) | pending, generated, approved, rejected, skipped, sending, sent, failed |
| CampaignEmail (approvalStatus) | pending, approved, rejected, skipped |
| SmtpConfig | connected, disconnected, failed |
| AiConfig | connected, disconnected, invalid_key, error |
