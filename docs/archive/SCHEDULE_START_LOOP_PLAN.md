# Schedule Start — Loop Engineering Tasks

Use this checklist as a loop-engineering queue. Each loop should:

1. Pick exactly one unchecked task.
2. Define the expected outcome before editing.
3. Make the smallest safe change.
4. Run the listed verification commands.
5. Mark the task as completed only after verification passes or the remaining risk is documented.

---

## Context & Architecture Decision

**Goal:** When a campaign has `scheduledAt` set and its status reaches `ready_to_send`,
the system must automatically start sending at the scheduled time — without any manual user action.

**Approach:** BullMQ delayed job. At campaign creation, if `scheduledAt` is provided, enqueue
a `send` job with `delay = scheduledAt - now`. When the job fires, `processSend` checks that
the campaign is still `ready_to_send` before proceeding. This reuses the existing send worker
with zero new infrastructure.

**Job ID convention:** `scheduled-send-{campaignId}` — deterministic so it can be removed if
the campaign is cancelled before the delay elapses.

**Current bugs to fix first:**
- `z.string().datetime()` in `app/api/campaigns/route.ts` rejects `datetime-local` values
  (format `2026-07-04T10:30`, no timezone). Must be relaxed to accept local datetime strings.
- The cancel route (`app/api/campaigns/[id]/cancel/route.ts`) does not remove delayed jobs from
  Redis, so a cancelled campaign would still auto-send at the scheduled time.

---

## Tasks

### SCHED-001. Fix Zod validation for `scheduledAt` in the POST /api/campaigns route

- [x] **Status:** Done
- **Priority:** High
- **Depends on:** None
- **Files to touch:** `app/api/campaigns/route.ts`
- **Problem:** `z.string().datetime()` requires a full ISO 8601 string with timezone
  (e.g. `2026-07-04T10:30:00Z`). The `datetime-local` HTML input produces
  `2026-07-04T10:30` (no seconds, no timezone), which fails validation and causes
  `scheduledAt` to be silently dropped.
- **Expected outcome:** The API accepts `datetime-local` strings and coerces them to a
  UTC `Date` for storage. Values in the past should be rejected with a 400.
- **Done when:** Posting `{ scheduledAt: "2026-07-04T10:30" }` to `POST /api/campaigns`
  returns 201 and the campaign row has a non-null `scheduledAt` in the DB.
- **Implementation notes:**
  ```ts
  // Replace:
  scheduledAt: z.string().datetime().optional(),

  // With:
  scheduledAt: z.string().optional().refine(
    (v) => !v || !isNaN(Date.parse(v)),
    { message: "Invalid date" }
  ),

  // Then in the handler, after parsing:
  if (scheduledAt) {
    const d = new Date(scheduledAt);
    if (d <= new Date()) {
      return NextResponse.json({ error: "scheduledAt must be in the future" }, { status: 400 });
    }
  }
  ```
- **Verification:**
  ```bash
  npx jest app/api/campaigns/campaigns.api.test.ts --testNamePattern scheduledAt
  npx tsc --noEmit
  ```
- **Risk / notes:** The `datetime-local` value is interpreted as local browser time. The
  server stores it as-is and BullMQ uses it for delay math. Consider documenting that
  the time is relative to the server timezone if the app becomes multi-region.

---

### SCHED-002. Enqueue a delayed BullMQ send job at campaign creation when `scheduledAt` is set

- [x] **Status:** Done
- **Priority:** High
- **Depends on:** SCHED-001
- **Files to touch:** `app/api/campaigns/route.ts`, `lib/jobs/queue.ts`
- **Problem:** After creation, campaigns with `scheduledAt` sit idle — nothing triggers the
  send at the right time.
- **Expected outcome:** When `POST /api/campaigns` receives a future `scheduledAt`, the
  handler enqueues a `send` job on `campaign-send` queue with `delay` = ms until that time
  and `jobId = "scheduled-send-{campaignId}"`. The campaign is created with status `draft`
  (unchanged) so it still needs to go through review/approval before `ready_to_send`.
- **Done when:** After creating a campaign with `scheduledAt` 2 minutes in the future, the
  BullMQ dashboard (or `queue.getDelayed()`) shows one delayed job for that campaign.
- **Implementation notes:**
  ```ts
  // In POST handler, after prisma.campaign.create:
  if (scheduledAt) {
    const delay = new Date(scheduledAt).getTime() - Date.now();
    if (delay > 0) {
      const queue = getSendQueue();
      await queue.add(
        "send",
        { campaignId: campaign.id, userId: session.user.id },
        {
          delay,
          jobId: `scheduled-send-${campaign.id}`,
          attempts: 1,
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        }
      );
    }
  }
  ```
- **Verification:**
  ```bash
  npx tsc --noEmit
  # Manual: create campaign with scheduledAt 5 min ahead, then:
  # node -e "const {getSendQueue} = require('./lib/jobs/queue'); getSendQueue().getDelayed().then(j => console.log(j.map(x=>x.id)))"
  ```
- **Risk / notes:** If the campaign is created but never reaches `ready_to_send` (e.g. user
  never approves emails), the job will fire at the scheduled time and `processSend` will
  find no approved emails — it will complete with `sentCount: 0`. This is safe but may
  confuse users. SCHED-005 adds a guard inside `processSend` for this.

---

### SCHED-003. Guard `processSend` against firing on non-ready campaigns

- [x] **Status:** Done
- **Priority:** High
- **Depends on:** SCHED-002
- **Files to touch:** `lib/jobs/send-campaign.ts`
- **Problem:** The delayed job will fire regardless of whether the campaign ever reached
  `ready_to_send`. If the user hasn't finished reviewing, `processSend` will run and find
  zero approved emails, silently doing nothing.
- **Expected outcome:** `processSend` checks `campaign.status === "ready_to_send"` at the
  start (in addition to the existing paused check). If not ready, it returns early without
  touching the campaign status.
- **Done when:** A test or manual test confirms that a campaign in `draft` or `generating`
  status does not get its status changed to `sending` when the job fires.
- **Implementation notes:**
  ```ts
  // In processSend, after the existing "not found" check and before the status update:
  if (!["ready_to_send", "paused"].includes(campaign.status)) {
    return { skipped: true, reason: `Campaign status is '${campaign.status}', not ready` };
  }
  ```
- **Verification:**
  ```bash
  npx jest lib/jobs/send-campaign.test.ts
  npx tsc --noEmit
  ```

---

### SCHED-004. Remove delayed BullMQ job when a campaign is cancelled

- [x] **Status:** Done
- **Priority:** High
- **Depends on:** SCHED-002
- **Files to touch:** `app/api/campaigns/[id]/cancel/route.ts`
- **Problem:** The cancel route resets the campaign to `ready_to_send` but leaves any
  pending delayed job in Redis. At the original `scheduledAt` time, the job fires and
  starts sending — even though the user cancelled.
- **Expected outcome:** The cancel handler removes the delayed job
  `scheduled-send-{campaignId}` from the queue before resetting campaign status. If
  the job doesn't exist (e.g. no schedule was set), the removal is a no-op.
- **Done when:** After cancelling a campaign that had `scheduledAt` set, `queue.getDelayed()`
  no longer contains a job for that campaign.
- **Implementation notes:**
  ```ts
  import { getSendQueue } from "@/lib/jobs/queue";

  // In the cancel POST handler, before the status updates:
  const queue = getSendQueue();
  const delayedJob = await queue.getJob(`scheduled-send-${id}`);
  if (delayedJob) await delayedJob.remove();
  ```
- **Verification:**
  ```bash
  npx tsc --noEmit
  # Manual: create scheduled campaign → cancel → verify no delayed job in Redis
  ```
- **Risk / notes:** `queue.getJob()` returns `undefined` if the job doesn't exist; calling
  `.remove()` only when non-null avoids a runtime error.

---

### SCHED-005. Show `scheduledAt` in the campaign detail page

- [x] **Status:** Done (was already implemented at lines 476–480 of campaign-detail-client.tsx)
- **Priority:** Medium
- **Depends on:** SCHED-001
- **Files to touch:** `components/campaigns/campaign-detail-client.tsx`
- **Problem:** The `CampaignDetail` interface already has `scheduledAt: string | null`
  (line 99) but it is never displayed. Users have no way to see when a scheduled campaign
  will fire.
- **Expected outcome:** When `campaign.scheduledAt` is non-null and the campaign has not
  yet started sending, the campaign detail page shows a "Scheduled for" line in the
  campaign metadata section, formatted as a human-readable local datetime.
- **Done when:** A campaign with `scheduledAt` set shows e.g.
  `Scheduled for Jul 5, 2026 at 10:30 AM` in the detail view.
- **Implementation notes:**
  ```tsx
  // In the campaign metadata/stats section:
  {campaign.scheduledAt && campaign.status !== "sending" && campaign.status !== "completed" && (
    <div className="text-sm text-muted-foreground">
      Scheduled for{" "}
      <span className="font-medium text-foreground">
        {new Date(campaign.scheduledAt).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </span>
    </div>
  )}
  ```
- **Verification:**
  ```bash
  npx tsc --noEmit
  # Visual: start dev server, open a campaign with scheduledAt — confirm the date shows
  ```

---

### SCHED-006. Show `scheduledAt` in the Review step of the Create Campaign wizard

- [x] **Status:** Done
- **Priority:** Low
- **Depends on:** SCHED-001
- **Files to touch:** `components/campaigns/create-campaign-wizard.tsx`
- **Problem:** Step 5 (Confirm & Create) does not include the scheduled start in the review
  summary, so users have no confirmation that their schedule was captured.
- **Expected outcome:** If `scheduledAt` is set, the review grid shows a "Scheduled start"
  row with the formatted date. If blank, the row is omitted.
- **Done when:** Setting a `scheduledAt` in step 3 and advancing to step 5 shows the value
  in the summary grid.
- **Implementation notes:**
  ```ts
  // In the review grid array (around line 449):
  ...(form.getValues("scheduledAt")
    ? [["Scheduled start", new Date(form.getValues("scheduledAt")!).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })]]
    : [["Start", "Immediately after approval"]]),
  ```
- **Verification:**
  ```bash
  npx tsc --noEmit
  # Visual: fill wizard with a scheduledAt → step 5 shows the date
  ```

---

### SCHED-007. Add/update tests for the scheduled send flow

- [x] **Status:** Done
- **Priority:** Medium
- **Depends on:** SCHED-001, SCHED-002, SCHED-003, SCHED-004
- **Files to touch:** `app/api/campaigns/campaigns.api.test.ts`, `lib/jobs/send-campaign.test.ts`
- **Problem:** No tests cover the scheduling path: creating a campaign with `scheduledAt`,
  the delayed job being enqueued, the guard in `processSend`, or the job removal on cancel.
- **Expected outcome:** New test cases cover:
  1. `POST /api/campaigns` with future `scheduledAt` → 201, job enqueued with correct delay.
  2. `POST /api/campaigns` with past `scheduledAt` → 400.
  3. `processSend` on a `draft` campaign → returns `{ skipped: true }`, status unchanged.
  4. `POST /api/campaigns/:id/cancel` on a scheduled campaign → delayed job removed.
- **Done when:** All new tests pass with `npx jest`.
- **Verification:**
  ```bash
  npx jest app/api/campaigns/campaigns.api.test.ts lib/jobs/send-campaign.test.ts
  ```

---

## Completion rule

A task can be changed from `- [ ]` to `- [x]` only when:

- The implementation is complete.
- The listed verification command has been run and passes.
- Any failure is documented with a follow-up task.
- The change is committed if it modifies repository files.
