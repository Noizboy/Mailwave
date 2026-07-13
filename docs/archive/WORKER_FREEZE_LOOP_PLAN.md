# Campaign Worker Freeze — Loop Engineering Tasks

Use this checklist as a loop-engineering queue. Each loop should:

1. Pick exactly one unchecked task.
2. Define the expected outcome before editing.
3. Make the smallest safe change.
4. Run the listed verification commands.
5. Mark the task as completed only after verification passes or the remaining risk is documented.

---

## Context

The BullMQ `send-campaign` and `generate-campaign` workers had several freeze vectors:

- Both `setTimeout` calls inside the send loop blocked the BullMQ worker thread for the full duration of the send interval (up to hours). The worker appeared "active" indefinitely; the UI showed `sending` with no progress.
- The generate worker had no `lockDuration` configured, risking stalled-job false positives and duplicate processing on large contact lists.
- `isServiceError` in generate-campaign doesn't fully cover all network-level errors thrown by the OpenAI SDK, causing single-contact failures to be swallowed instead of aborting the job early.

Tasks **SEND-001**, **SEND-002**, and **GEN-001** were applied in the initial fix pass and need verification.

---

## Tasks

### SEND-001. Replace pacing sleep with re-enqueue in send loop

- [x] **Status:** Applied (needs verification)
- **Priority:** Critical
- **Depends on:** None
- **Files to touch:** `lib/jobs/send-campaign.ts`
- **Problem:** `await new Promise(resolve => setTimeout(resolve, nextSendTargetMs - Date.now()))` at line ~119 blocked the BullMQ worker thread for the entire wait duration when `nextSendAt` was in the future.
- **Expected outcome:** When `waitMs > 500`, the job enqueues a new send job with `delay: waitMs` and returns (via `break` → finalization sets status `paused`). The worker thread is freed immediately.
- **Done when:** Worker logs show jobs completing in <1s per invocation; campaign status cycles `sending → paused → sending` between emails instead of staying `sending` for hours.
- **Verification:**
  ```bash
  npm run typecheck
  npm run test -- --reporter=verbose lib/jobs/send-campaign
  ```
- **Risk / notes:** The new job uses a fresh `sendRunId`. The finalization block sets `activeSendRunId: null` (via `updateMany` where clause), allowing the new job to claim the campaign on arrival. This mirrors the existing rate-limit re-enqueue pattern exactly.

---

### SEND-002. Replace interval sleep with re-enqueue after each sent email

- [x] **Status:** Applied (needs verification)
- **Priority:** Critical
- **Depends on:** SEND-001
- **Files to touch:** `lib/jobs/send-campaign.ts`
- **Problem:** After sending each email, `await new Promise(resolve => setTimeout(resolve, interval * 60 * 1000))` kept the job alive for `interval` minutes per email. With 100 contacts at 5-minute intervals, the job held the worker for 8+ hours.
- **Expected outcome:** After sending an email and updating `nextSendAt`, if `hasMorePendingEmails && intervalMs > 500`, the job enqueues a successor with `delay: intervalMs` and breaks. Each job invocation sends at most one email.
- **Done when:** `npm run typecheck` passes; unit tests covering the re-enqueue branch pass.
- **Verification:**
  ```bash
  npm run typecheck
  npm run test -- --reporter=verbose lib/jobs/send-campaign
  ```
- **Risk / notes:** `interval = 0` (or very small) means no re-enqueue → the loop continues to the next email immediately, which is the intended burst mode. The `500ms` threshold prevents creating BullMQ jobs for negligible delays.

---

### GEN-001. Set lockDuration on generate worker to prevent stalled-job false positives

- [x] **Status:** Applied (needs verification)
- **Priority:** High
- **Depends on:** None
- **Files to touch:** `lib/jobs/generate-campaign.ts`
- **Problem:** Default BullMQ `lockDuration` is 30 seconds. A generate job processing 500+ contacts (each with a 30s AI timeout) could exceed the lock window, causing BullMQ to mark the job as stalled and re-queue it — leading to duplicate email generation.
- **Expected outcome:** `startGenerateWorker` passes `lockDuration: 300_000, lockRenewTime: 120_000`. BullMQ auto-renews every 2 minutes, keeping the lock live for arbitrarily long generate runs.
- **Done when:** Worker starts without errors; `npm run typecheck` passes.
- **Verification:**
  ```bash
  npm run typecheck
  npm run worker &
  # Worker should log "MailWave worker started" with no errors
  kill %1
  ```
- **Risk / notes:** `lockRenewTime` must be < `lockDuration / 2` to guarantee renewal before expiry. 120_000 < 300_000 / 2 = 150_000 ✓.

---

### GEN-002. Harden isServiceError to cover all OpenAI SDK network error classes

- [x] **Status:** Completed
- **Priority:** High
- **Depends on:** None
- **Files to touch:** `lib/jobs/generate-campaign.ts`
- **Problem:** The OpenAI SDK throws typed error classes (`APIConnectionError`, `APIConnectionTimeoutError`, `RateLimitError`, `AuthenticationError`) with specific `status` codes and `.name` values. The current `isServiceError` check covers most by string-matching `err.message`, but `APIConnectionError` sets `err.name = "APIConnectionError"` with no `.status`, and `AuthenticationError` sets `err.status = 401`. If any of these slip past the check, the per-contact `catch` swallows them and the loop continues — generating hundreds of failed `CampaignEmail` rows instead of aborting early.
- **Expected outcome:** `isServiceError` also checks `err.name` against the full set of OpenAI SDK error class names, and treats `status 429` (rate limit) as a service error so generation aborts and the user gets a clear failure notification.
- **Done when:** Unit test covers all error class names; `isServiceError` returns `true` for a mocked `APIConnectionError` with no `.status`.
- **Verification:**
  ```bash
  npm run test -- lib/jobs/generate-campaign
  npm run typecheck
  ```
- **Risk / notes:** Error class names to add: `"apiconnectionerror"`, `"apiconnectiontimeouterror"`, `"autherror"`, `"authenticationerror"`, `"permissiondeniederror"`. Also consider `status === 429` (rate limit) as a service-level abort signal.

---

### SEND-003. Write unit tests for the re-enqueue branches in processSend

- [x] **Status:** Completed
- **Priority:** Medium
- **Depends on:** SEND-001, SEND-002
- **Files to touch:** `lib/jobs/send-campaign.test.ts` (create if absent)
- **Problem:** SEND-001 and SEND-002 introduce new code paths (re-enqueue + break) with no test coverage. A regression could silently revert to blocking sleeps or skip emails.
- **Expected outcome:** Tests assert that:
  1. When `nextSendAt` is 60s in the future, `getSendQueue().add` is called with `delay ≈ 60000` and the job returns without sleeping.
  2. After sending an email with `interval = 5`, `getSendQueue().add` is called with `delay = 300000` and `pendingEmails[1]` is NOT processed in the same invocation.
  3. When `interval = 0`, all emails are processed in a single job invocation (no re-enqueue).
- **Done when:** `npm run test -- lib/jobs/send-campaign` passes with all three cases covered.
- **Verification:**
  ```bash
  npm run test -- lib/jobs/send-campaign --reporter=verbose
  ```
- **Risk / notes:** Mock `getSendQueue` (already has a `lib/__mocks__` pattern). Mock `prisma` via `vi.mock("@/lib/prisma")`. Use `vi.useFakeTimers()` only if needed for Date assertions.

---

### SEND-004. Add BullMQ job timeout to send worker to cap maximum job duration

- [x] **Status:** Completed
- **Priority:** Medium
- **Depends on:** SEND-001, SEND-002
- **Files to touch:** `lib/jobs/send-campaign.ts`
- **Problem:** After SEND-001/002, each send job should complete in <1s (one email + enqueue). But with `interval = 0` (burst mode), a job could still send thousands of emails without a timeout. If SMTP hangs mid-batch, the worker is stuck indefinitely.
- **Expected outcome:** `startSendWorker` passes a reasonable `lockDuration` (e.g., `60_000`) and the SMTP `transporter` gets a `connectionTimeout` / `socketTimeout` option to bound each send attempt.
- **Done when:** `npm run typecheck` passes; SMTP timeout test shows `sendMail` throws after configured threshold.
- **Verification:**
  ```bash
  npm run typecheck
  npm run test -- lib/jobs/send-campaign
  ```
- **Risk / notes:** Nodemailer `socketTimeout` defaults to no timeout. Add `socketTimeout: 30_000, connectionTimeout: 10_000` to `createTransport`. The `lockDuration` only affects BullMQ stall detection, not SMTP itself.

---

## Completion rule

A task can be changed from `- [ ]` to `- [x]` only when:

- The implementation is complete.
- The listed verification command has been run and passed.
- Any failure is documented with a follow-up task.
- The change is committed if it modifies repository files.
