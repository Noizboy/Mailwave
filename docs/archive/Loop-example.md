# WhatsApp Receipt Feedback Loop Engineering Tasks

Use this checklist as a loop-engineering queue. Each loop should:

1. Pick exactly one unchecked task.
2. Define the expected outcome before editing.
3. Make the smallest safe change.
4. Run the listed verification commands.
5. Mark the task as completed only after verification passes or the remaining risk is documented.

---

## Scope

Tighten the WhatsApp user-facing receipt flow so users always know:

- when the image was received,
- whether Wisebill is waiting for a reference image,
- when processing actually starts,
- whether the receipt was saved, saved as needs review, or not saved,
- and what failed when the receipt is not saved.

Constraints from the request:

- Reuse existing message keys where possible.
- In-progress feedback should replace the previous in-progress feedback.
- Final WhatsApp confirmation must be status + invoice ID when saved.
- If not saved, WhatsApp must receive the error.

Current findings from code review:

- `processing.receipt_detected` already exists but is disabled for WhatsApp because `showSingleImageHint: false` in `backend/packages/relay/src/whatsapp-evolution.js`.
- `ImageBufferManager` already emits staged updates (`processing.classifying`, `processing.first`, `processing.multi`) through `MessageState.update(...)`.
- WhatsApp `MessageState.update(...)` currently sends a new text and suppresses exact duplicates; it does not truly edit/replace a prior WhatsApp message.
- WhatsApp lacks Telegram's async timeout recovery path (`job.timeout` + late final result).
- Success messaging is inconsistent: `receipt.saved` and `receipt.bill_saved` are both used.
- `receipt.suspect_amount` currently leaks heuristic `expected ~$X` text to users even when the heuristic is noisy.

---

## Tasks

### WAFB-001. Define the exact WhatsApp feedback contract per receipt lifecycle state

- [x] **Status:** Completed
- **Priority:** High
- **Depends on:** None
- **Files to touch:** `docs/active/WHATSAPP_RECEIPT_FEEDBACK_LOOP_PLAN.md`, maybe `backend/packages/shared/messages.js`
- **Problem:** The current flow has multiple message keys but no single contract for what users should see at each state.
- **Expected outcome:** A short authoritative state map exists for single-image, two-image/reference, timeout, save-success, needs-review, and error outcomes.
- **Done when:** The chosen state map is documented in this file and each state maps to an existing message key or one explicit follow-up task.
- **Verification:**
  ```bash
  # Docs-only in this loop; no runtime command required.
  ```
- **Risk / notes:** Keep the contract minimal. Do not invent new prose when an existing message key already fits.

#### WhatsApp feedback contract

| Lifecycle state | WhatsApp message key | Notes |
| --- | --- | --- |
| First accepted image, waiting for optional reference | `processing.receipt_detected` | Reuse as the immediate “received + 30s wait” confirmation for the single-image path. |
| Second image accepted and treated as receipt + reference | `processing.receipt_with_ref` | Use for the 2-image receipt/reference path. |
| Multiple accepted images treated as a receipt batch | `processing.n_receipts` | Use when the batch is clearly 2+ receipts, not receipt + reference. |
| Classification has started | `processing.classifying` | Transitional in-progress state before OCR/save work. |
| Processing has started after classification | `processing.first`, `processing.second`, or `processing.multi` | Pick the existing count-based key that matches the accepted batch. |
| Single-image wait window expired with no reference image | Follow-up needed under WAFB-004 | No existing key cleanly says “no reference arrived; processing the single receipt now.” |
| Worker exceeded sync wait but may still finish later | `job.timeout` | Must remain in-progress, not a false terminal failure. |
| Receipt saved as processed | `receipt.bill_saved` | Final WhatsApp success contract should converge on the compact saved + invoice ID form. |
| Receipt saved as needs review | Follow-up needed under WAFB-006 | Existing keys only append review hints; they do not expose `needs_review` as a first-class final status. |
| Receipt rejected because amount is missing | `receipt.rejected_no_amount` / `receipt.rejected_both_no_amount` | Explicit terminal rejection; not saved. |
| Receipt rejected because image is not a receipt | `receipt.not_a_receipt` / `receipt.both_not_receipts` | Explicit terminal rejection; not saved. |
| Generic processing failure | `job.error` | Terminal “not saved” path; include the mapped reason. |
| Sender or group not linked | `unlinked.personal` / `unlinked.group` | Terminal rejection before queueing. |
| Quota exceeded / temporarily blocked | `batch.limit_exceeded` / `batch.blocked_until` | Terminal rejection before processing. |

Contract summary:

- In-progress states stay in the `processing.*` / `job.timeout` family.
- Saved states end as compact status + invoice ID only.
- Not-saved states end as the explicit rejection/error message that already exists.
- The only message gaps still needing implementation are: single-image window expiry text and a first-class `needs_review` final status.

### WAFB-002. Enable immediate first-image feedback in WhatsApp using existing messages

- [x] **Status:** Completed
- **Priority:** High
- **Depends on:** WAFB-001
- **Files to touch:** `backend/packages/relay/src/whatsapp-evolution.js`
- **Problem:** Users currently get no immediate confirmation that Wisebill received the first image or that it will wait 30s for a reference image.
- **Expected outcome:** The first accepted WhatsApp image immediately triggers the existing `processing.receipt_detected` feedback.
- **Done when:** `showSingleImageHint` is enabled for WhatsApp and a first image causes the user to receive the existing “image received / send reference within 30s” message.
- **Verification:**
  ```bash
  npm run test:unit -- unit_test/evolution-webhook-behavior.test.js
  cd backend && npm run lint
  ```
- **Risk / notes:** Reuse the existing message key; do not add a new copy variant unless the current text is proven wrong.

### WAFB-003. Make in-progress feedback behave like a single evolving status thread in WhatsApp

- [x] **Status:** Completed
- **Priority:** High
- **Depends on:** WAFB-001, WAFB-002
- **Files to touch:** `backend/packages/relay/src/whatsapp-evolution.js`, maybe `backend/packages/shared/messages.js`
- **Problem:** The product requirement says each in-progress feedback should replace the prior one, but WhatsApp `MessageState.update(...)` currently sends a fresh message instead of editing/replacing the prior status.
- **Expected outcome:** A concrete implementation decision exists for WhatsApp “replace” semantics: either true edit/reaction support if Evolution can do it, or a documented fallback that guarantees only one visible in-progress status message at a time.
- **Done when:** The implementation either reuses an Evolution edit API or documents and ships the closest safe fallback with explicit operator notes.
- **Verification:**
  ```bash
  npm run test:unit -- unit_test/evolution-*.test.js
  cd backend && npm run lint
  ```
- **Risk / notes:** Do not assume Evolution supports editing sent messages. Verify before building custom state around it.

Implementation note:

- Verified against Evolution docs that `POST /chat/updateMessage/{instance}` exists and accepts the outbound message `key` (`id`, `remoteJid`, `fromMe`) to update a sent WhatsApp text in place.
- `EvolutionProvider.createMessageState()` now sends the first status with `sendText`, stores the returned message key, and uses `updateMessage` for later in-progress transitions.
- Safe fallback remains: if `updateMessage` fails for a specific chat/provider response, Wisebill logs `send_text.update_failed_fallback` and sends a fresh message so the user still receives the latest status.

Remaining risk after WAFB-003:

- Some Evolution deployments may not return a usable outbound `key` from `sendText`, or may reject `updateMessage` for certain instance modes. In that degraded path, WhatsApp falls back to sending a new status message, so the “single visible thread” guarantee becomes best-effort rather than absolute.

### WAFB-004. Reuse existing status messages for second-image/reference and window-expiry transitions

- [x] **Status:** Completed
- **Priority:** High
- **Depends on:** WAFB-001, WAFB-003
- **Files to touch:** `backend/packages/shared/image-buffer.js`, maybe `backend/packages/shared/messages.js`
- **Problem:** The current flow does not clearly tell the user when a second image was accepted as the reference or when the 30s window expired and Wisebill moved on to processing the single receipt.
- **Expected outcome:** Existing in-progress messages are wired so the user sees a clean state progression across: first image received → second image/reference received or window expired → classifying → processing.
- **Done when:** The two-image path and the single-image expiry path each emit one user-visible status transition using existing message keys wherever possible.
- **Verification:**
  ```bash
  npm run test:unit -- unit_test/evolution-webhook-behavior.test.js
  cd backend && npm run lint
  ```
- **Risk / notes:** If no existing key cleanly fits “window expired, processing single receipt now,” add one tiny message key instead of overloading a misleading one.

Implementation note:

- Added one compact message key, `processing.expired_single`, for the single-image window-expiry transition.
- The 2-image path now upgrades the progress message to `processing.receipt_with_ref` after classification when exactly one image is a receipt and the other is not.
- If both classified images are receipts, the flow keeps the existing `processing.n_receipts` message.

### WAFB-005. Unify final WhatsApp success messages to explicit status + invoice ID only

- [x] **Status:** Completed
- **Priority:** High
- **Depends on:** WAFB-001
- **Files to touch:** `backend/packages/cipher/src/process-receipt.js`, `backend/packages/shared/messages.js`, tests
- **Problem:** WhatsApp currently uses multiple save-success messages (`receipt.saved`, `receipt.bill_saved`) and appends suspect-amount warnings inline.
- **Expected outcome:** Final WhatsApp success responses are normalized to exactly one of:
  - saved/processed + invoice ID
  - needs review + invoice ID
- **Done when:** A successfully saved receipt returns only the final status plus invoice number, with no heuristic `expected ~$X` text appended in WhatsApp.
- **Verification:**
  ```bash
  npm run test:unit -- unit_test/ai-unified-extraction.test.js unit_test/evolution-webhook-behavior.test.js
  cd backend && npm run lint
  ```
- **Risk / notes:** Preserve invoice ID in every saved path, including single receipt, paired receipt, and multi-receipt results where feasible.

Implementation note:

- `process-receipt.js` now uses the same compact `receipt.bill_saved` final message for both single-receipt and receipt-plus-reference saved paths.
- `receipt.saved` was reduced to the same compact shape so any fallback still lands on the canonical `✅ Receipt saved · INV-...` format.
- The inline `receipt.suspect_amount` suffix is no longer appended to saved WhatsApp confirmations.

### WAFB-006. Send explicit final `needs_review` status instead of burying review hints in a success message

- [x] **Status:** Completed
- **Priority:** High
- **Depends on:** WAFB-005
- **Files to touch:** `backend/packages/cipher/src/process-receipt.js`, `backend/packages/shared/messages.js`, tests
- **Problem:** `needs_review` is currently internal state plus a warning suffix, not a first-class user-visible final status.
- **Expected outcome:** When a receipt saves as `needs_review`, the user sees a distinct final confirmation that still includes the invoice ID.
- **Done when:** The saved-as-review path no longer looks identical to fully processed success, and the wording stays short.
- **Verification:**
  ```bash
  npm run test:unit -- unit_test/ai-unified-extraction.test.js
  cd backend && npm run lint
  ```
- **Risk / notes:** Keep the message compact; do not reintroduce the noisy arithmetic “expected” text.

Implementation note:

- Added a dedicated compact final key, `receipt.needs_review`.
- `process-receipt.js` now picks the final saved WhatsApp message from the persisted status:
  - `processed` → `receipt.bill_saved`
  - `needs_review` → `receipt.needs_review`
- This now applies to both single-receipt and receipt-plus-reference saves.

### WAFB-007. Preserve real async completion behavior for WhatsApp on job timeout

- [x] **Status:** Completed
- **Priority:** High
- **Depends on:** WAFB-001
- **Files to touch:** `backend/packages/relay/src/whatsapp-evolution.js`, maybe `backend/packages/shared/bot-notifications.js`, tests
- **Problem:** Telegram already sends `job.timeout` and later delivers the real final result. WhatsApp currently treats timeout as immediate error, which can tell the user “not saved” even if the receipt saves later.
- **Expected outcome:** WhatsApp matches Telegram’s async timeout behavior: send an in-progress timeout notice, then send the real final result when the worker finishes.
- **Done when:** A WhatsApp job that exceeds `BOT_JOB_WAIT_TIMEOUT_MS` no longer ends with a false error if the worker later succeeds.
- **Verification:**
  ```bash
  npm run test:unit -- unit_test/evolution-webhook-behavior.test.js
  cd backend && npm run lint
  ```
- **Risk / notes:** Reuse the existing durable notification flow instead of inventing a second async channel.

### WAFB-008. Pass and honor durable notification IDs for WhatsApp final results

- [x] **Status:** Completed
- **Priority:** Medium
- **Depends on:** WAFB-007
- **Files to touch:** `backend/packages/relay/src/whatsapp-evolution.js`, `backend/packages/cipher/src/cipher.js`, tests
- **Problem:** The worker can create durable bot notifications, but the direct WhatsApp enqueue path does not pass `notificationId`, so the late-result path is weaker than Telegram’s.
- **Expected outcome:** WhatsApp enqueued jobs include `notificationId`, allowing the durable worker to send the final message if the synchronous wait path times out.
- **Done when:** The WhatsApp enqueue payload mirrors Telegram’s notification handoff for late result delivery.
- **Verification:**
  ```bash
  npm run test:unit -- unit_test/evolution-webhook-behavior.test.js
  cd backend && npm run lint
  ```
- **Risk / notes:** Keep notification IDs deterministic per batch where possible to avoid duplicate late sends.

### WAFB-009. Audit every internal rejection path for missing user-facing feedback

- [x] **Status:** Completed
- **Priority:** Medium
- **Depends on:** WAFB-001
- **Files to touch:** `backend/packages/shared/image-buffer.js`, `backend/packages/cipher/src/process-receipt.js`, tests, maybe docs
- **Problem:** Some internal states log transitions (`sender.not_linked`, `batch.dispatch_failed`, classification/degrade paths) but not all of them clearly produce user-facing WhatsApp feedback.
- **Expected outcome:** Every terminal path that drops or rejects the receipt either already notifies the user or is captured in a follow-up task with the exact missing branch.
- **Done when:** A short table in this file lists terminal branches and whether the user sees a message today.
- **Verification:**
  ```bash
  npm run test:unit -- unit_test/evolution-*.test.js
  cd backend && npm run lint
  ```
- **Risk / notes:** Keep this as a bounded audit. Do not rewrite the whole pipeline just to normalize logs.

Implementation note:

- Audited the three terminal layers involved in the WhatsApp path:
  - `backend/packages/relay/src/whatsapp-evolution.js`
  - `backend/packages/shared/image-buffer.js`
  - `backend/packages/cipher/src/process-receipt.js`
- Most terminal branches already emit user-facing copy before returning.
- One exact gap remains and is now tracked as a follow-up task instead of being hidden in logs.

### WAFB-013. Add explicit WhatsApp fallback feedback when image-buffer dispatch fails before any terminal message is sent

- [x] **Status:** Completed
- **Priority:** Medium
- **Depends on:** WAFB-009
- **Files to touch:** `backend/packages/shared/image-buffer.js`, `backend/packages/relay/src/whatsapp-evolution.js`, tests
- **Problem:** If `_dispatch()` falls into the outer `batch.dispatch_failed` catch, or if `imageBuffer.handleImage(...)` throws up to the webhook-level `message.image.failed` catch before any terminal status is sent, Wisebill currently logs the failure but may leave the user with no final WhatsApp feedback.
- **Expected outcome:** These pre-terminal failures emit one compact user-facing error instead of being logs-only failures.
- **Done when:** A thrown dispatch/enqueue failure in the WhatsApp image path results in a user-visible final error message, with regression coverage.
- **Verification:**
  ```bash
  npm run test:unit -- unit_test/evolution-webhook-behavior.test.js
  cd backend && npm run lint
  ```
- **Risk / notes:** Keep it narrow. Do not duplicate errors that were already sent deeper in the pipeline.

Implementation note:

- `ImageBufferManager._dispatch()` now emits `error.service` in its outer `batch.dispatch_failed` catch before dropping the buffer.
- The WhatsApp webhook catch around `imageBuffer.handleImage(...)` now sends the same compact fallback if the image path throws before a terminal reply is sent.
- Regression coverage now locks both fallback layers.

### WAFB-010. Harden WhatsApp in-progress replacement fallback when Evolution omits outbound message keys

- [x] **Status:** Completed
- **Priority:** Medium
- **Depends on:** WAFB-003
- **Files to touch:** `backend/packages/relay/src/whatsapp-evolution.js`, tests, maybe docs
- **Problem:** The in-progress replacement path depends on Evolution returning a usable outbound message `key` from `sendText` and accepting `updateMessage`. Some deployments may omit that key or reject updates, degrading the single-thread UX.
- **Expected outcome:** The degraded path is explicitly handled and operator-visible, with tests covering missing-key and update-rejected fallbacks.
- **Done when:** WhatsApp replacement fallback behavior is locked by tests and the operator-facing limitation is documented where needed.
- **Verification:**
  ```bash
  npm run test:unit -- unit_test/evolution-webhook-behavior.test.js
  cd backend && npm run lint
  ```
- **Risk / notes:** Keep this bounded to fallback clarity; do not invent a second status transport.

Implementation note:

- `EvolutionProvider.createMessageState()` now logs `send_text.missing_key_fallback` when a follow-up status arrives but the previous `sendText` response did not include a usable outbound message key.
- Added regression coverage for both degraded paths:
  - missing outbound key → fallback to a fresh `sendText`
  - `updateMessage` rejected → fallback to a fresh `sendText`

### WAFB-011. Unify final WhatsApp saved-state copy to one canonical status + invoice ID shape

- [x] **Status:** Completed
- **Priority:** High
- **Depends on:** WAFB-005
- **Files to touch:** `backend/packages/shared/messages.js`, `backend/packages/cipher/src/process-receipt.js`, tests
- **Problem:** Saved WhatsApp paths still drift between `receipt.saved` and `receipt.bill_saved`, so the final confirmation contract is not yet fully canonical.
- **Expected outcome:** Every saved WhatsApp path ends with one canonical compact status + invoice ID format.
- **Done when:** Saved single, paired, and batch WhatsApp flows no longer mix multiple success templates.
- **Verification:**
  ```bash
  npm run test:unit -- unit_test/ai-unified-extraction.test.js unit_test/evolution-webhook-behavior.test.js
  cd backend && npm run lint
  ```
- **Risk / notes:** Preserve invoice IDs on every saved path.

Covered by WAFB-005.

### WAFB-012. Remove heuristic `expected ~$X` text from WhatsApp final receipt outcomes

- [x] **Status:** Completed
- **Priority:** High
- **Depends on:** WAFB-005, WAFB-006
- **Files to touch:** `backend/packages/shared/messages.js`, `backend/packages/cipher/src/process-receipt.js`, tests
- **Problem:** WhatsApp still risks exposing noisy arithmetic heuristic copy (`expected ~$X`) in final user-facing receipt outcomes.
- **Expected outcome:** Final WhatsApp confirmations stay short and deterministic, without heuristic amount explanations.
- **Done when:** No saved or needs-review WhatsApp path appends the `receipt.suspect_amount` expected-value text.
- **Verification:**
  ```bash
  npm run test:unit -- unit_test/ai-unified-extraction.test.js
  cd backend && npm run lint
  ```
- **Risk / notes:** Keep operator diagnostics in logs; only remove the noisy user-facing suffix.

Covered by WAFB-005.

---

## Terminal-path audit notes

Known user-visible today:

- first image rejected as non-receipt → `receipt.not_a_receipt`
- both images rejected as non-receipts → `receipt.both_not_receipts`
- amount missing → `receipt.rejected_no_amount`
- generic processing error → `job.error`
- not linked → `unlinked.personal` / `unlinked.group`
- sender/group quota exceeded → `batch.limit_exceeded` / `batch.blocked_until`

Known gaps or mismatches today:

- if Evolution omits outbound message keys or rejects `updateMessage`, in-progress replacement degrades to a fresh message fallback

### Terminal branch audit table

| Layer | Branch | User sees a message today? | Current behavior |
| --- | --- | --- | --- |
| Relay | sender/group not linked | Yes | `unlinked.personal` / `unlinked.group` sent from webhook path when `handleImage()` returns `action: 'unlinked'`. |
| Image buffer | sender/group/image quota blocked | Yes | `batch.limit_exceeded` / `batch.blocked_until` emitted before returning `already_full`. |
| Image buffer | single classified as non-receipt | Yes | `receipt.not_a_receipt`. |
| Image buffer | both classified as non-receipts | Yes | `receipt.both_not_receipts`. |
| Image buffer | download/classification failure inside `_downloadAndClassify()` | Yes | `error.service` before returning `rejected`. |
| Cipher | single receipt missing amount | Yes | `receipt.rejected_no_amount`. |
| Cipher | two-image pair with no amount in either image | Yes | `receipt.rejected_both_no_amount`. |
| Cipher | generic processing exception | Yes | `job.error`. |
| Cipher | saved processed | Yes | `receipt.bill_saved`. |
| Cipher | saved needs review | Yes | `receipt.needs_review`. |
| Relay/Image buffer | `message.image.failed` / outer `batch.dispatch_failed` catch before any terminal send | Yes | Falls back to `error.service` instead of staying logs-only. |

## Remaining implementation risks

- **Evolution edit reliability:** in-progress replacement now uses `POST /chat/updateMessage/{instance}`, but the provider contract is only as strong as the returned outbound message key and instance support for updates.

---

## Completion rule

A task can be changed from `- [ ]` to `- [x]` only when:

- The implementation is complete.
- The listed verification command has been run.
- Any failure is documented with a follow-up task.
- The change is committed if it modifies repository files.
