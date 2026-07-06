# MailWave Sending Rules

## Campaign-level gating (checked before send starts)

A campaign may only enter `sending` state if ALL of the following are true:

1. Campaign `status` is `ready_to_send` or `paused`
2. User has a `SmtpConfig` with `status = connected`
3. At least one `CampaignEmail` has `approvalStatus = approved` and `status IN (generated, approved)`

Violation → API returns 422 with an actionable error message.

## Per-email eligibility (checked inside the send worker)

A `CampaignEmail` is eligible to send if:
- `approvalStatus = approved`
- `status IN (generated, approved)` (not yet sent, not failed, not skipped)
- The associated `Contact.status` is `ready` (evaluated at send time)

## Rate limiting (enforced inside the send worker)

Before sending each email, the worker counts `DeliveryEvent` records with `eventType = sent` in the last hour and last 24 hours (scoped to the user, not just the campaign).

| Limit | Source |
|---|---|
| Hourly limit | `SmtpConfig.hourlyLimit` (default 50) |
| Daily limit | `SmtpConfig.dailyLimit` (default 500) |

If either limit is reached, the worker stops for that job iteration. The campaign remains in `sending` status and the next job run (re-triggered via API or scheduler) will continue where it left off.

## Interval pacing

Between each email send, the worker waits:

- **Random interval**: `Math.random() * (maxInterval - minInterval) + minInterval` minutes
- **Fixed interval**: `minInterval` minutes

Intervals are set per campaign in `Campaign.minInterval` / `Campaign.maxInterval` (in minutes).

## Contact suppression rules

The following contacts are skipped at send time regardless of list membership:
- `Contact.status = unsubscribed` (terminal — cannot be re-enabled)
- `Contact.status = suppressed`
- `Contact.status = invalid`

Contacts in `pending` status are also skipped — only `ready` contacts send.

## Pause and resume

A campaign can be paused:
- By user action via `POST /api/campaigns/[id]/pause`
- Automatically if the rate limit is hit (worker breaks out of the send loop)

Resuming calls `POST /api/campaigns/[id]/send` which re-queues the send job. The job picks up from where it left off (only unsent approved emails are processed).

## Campaign completion

A campaign transitions to `completed` when:
- All approved emails have been sent (or failed)
- The worker finds zero remaining eligible emails

The `Campaign.completedAt` timestamp is set when this happens.

## Retries

Individual email failures do NOT block the rest of the campaign. Failed emails:
- Have `CampaignEmail.status = failed` and `errorReason` recorded
- Have `retryCount` incremented
- Are NOT retried automatically in the current version (manual regeneration/resend is needed)

The campaign itself only fails (`Campaign.status = failed`) if the SMTP connection cannot be established at job start.
