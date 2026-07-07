# TestSprite Backend Loop Engineering Tasks

Use this checklist as a loop-engineering queue. Each loop should:

1. Pick exactly one unchecked task.
2. Define the expected outcome before editing.
3. Make the smallest safe change.
4. Run the listed verification commands.
5. Mark the task as completed only after verification passes or the remaining risk is documented.

**Context:** The second TestSprite backend run generated 9 cases. Only `TC002` (contacts CRUD) and `TC004` (campaign creation) passed. The other failures are a mix of generated-test mistakes and possible contract drift. Main issues observed: wrong route prefixing (`/dashboard/api/...`), fallback to placeholder auth route (`/api/auth/[...nextauth]`), wrong HTTP methods (`POST` vs `PUT`), and incorrect response-shape assumptions (redirect/HTML vs JSON, wrapper objects vs arrays). Reference artifacts: `testsprite_tests/tmp/test_results.json`, `testsprite_tests/tmp/raw_report.md`, `testsprite_tests/testsprite-mcp-test-report.md`.

**Conventions:**
- All commands run from the repo root.
- One loop = one task only.
- Prefer fixing the contract/documentation used by TestSprite before changing production behavior.
- If a loop changes repository files, update this task file in the same loop.

---

## Tasks

### TSB-001. Build a single source of truth for backend API contracts used by TestSprite

- [ ] **Status:** Pending
- **Priority:** High
- **Depends on:** None
- **Files to touch:** `testsprite_tests/tmp/code_summary.yaml`, `testsprite_tests/testsprite-mcp-test-report.md`, optionally `docs/MAILWAVE_MANUAL_TEST_INSTRUCTIONS.md`
- **Problem:** TestSprite is generating invalid routes, wrong methods, and wrong response assumptions because its contract source is incomplete or imprecise.
- **Expected outcome:** The backend summary clearly documents exact routes, exact HTTP methods, auth requirements, and response shapes for the failing surfaces: auth, lists, campaigns actions, imports, reports export, notifications, settings.
- **Done when:** The contract file explicitly captures at least these truths: real NextAuth flow, `PUT /api/settings/smtp`, `GET /api/reports/export`, and `GET /api/notifications` returns `{ notifications, unreadCount }`.
- **Verification:**
  ```bash
  npm run typecheck
  ```
- **Risk / notes:** This task is documentation-first; do not change runtime behavior unless a route contract is actually wrong in code.

### TSB-002. Document and stabilize the reusable authenticated test flow for NextAuth

- [ ] **Status:** Pending
- **Priority:** High
- **Depends on:** TSB-001
- **Files to touch:** `docs/MAILWAVE_MANUAL_TEST_INSTRUCTIONS.md`, `testsprite_tests/testsprite-mcp-test-report.md`
- **Problem:** Protected backend tests keep failing because login success is being interpreted incorrectly.
- **Expected outcome:** A documented auth flow that all backend tests can follow: fetch CSRF from `/api/auth/csrf`, post credentials to `/api/auth/callback/credentials`, preserve cookies, and confirm success via `GET /api/auth/session` rather than assuming the login response body is JSON.
- **Done when:** The docs describe success criteria for auth and include the real seed credentials `demo@mailwave.app / password123`.
- **Verification:**
  ```bash
  curl "http://localhost:3001/api/auth/csrf"
  ```
- **Risk / notes:** Successful login may be `200`, `302`, or `307` depending on flow/headers; session confirmation is the reliable signal.

### TSB-003. Add or tighten integration coverage for auth contract behavior

- [ ] **Status:** Pending
- **Priority:** High
- **Depends on:** TSB-002
- **Files to touch:** `app/api/auth/[...nextauth]/route.test.ts` or appropriate auth-focused test file, shared test helpers under `test/`
- **Problem:** TestSprite is weak at auth flow interpretation; the repo needs its own executable auth contract checks.
- **Expected outcome:** Local integration tests assert unauthenticated protected route behavior, valid login/session establishment, and invalid credential handling using the real NextAuth route structure or the smallest safe mocked harness.
- **Done when:** A local auth-focused test suite passes and captures the expected login/session contract.
- **Verification:**
  ```bash
  npm run test -- auth
  npm run typecheck
  ```
- **Risk / notes:** Keep scope narrow; do not build a broad E2E harness in this task.

### TSB-004. Validate and lock down list + membership route contracts

- [ ] **Status:** Pending
- **Priority:** High
- **Depends on:** TSB-001, TSB-002
- **Files to touch:** `app/api/lists/lists.api.test.ts`, `app/api/lists/**`, `testsprite_tests/tmp/code_summary.yaml`
- **Problem:** `TC003` failed due to malformed `/dashboard/api/...` usage, leaving uncertainty around the real black-box contract for lists and membership operations.
- **Expected outcome:** Existing list tests cover the exact route paths, response shapes, and error cases that TestSprite should use, and the summary reflects them precisely.
- **Done when:** List contract tests pass and the summary explicitly references `/api/lists`, `/api/lists/{id}`, and `/api/lists/{id}/members` with correct methods and auth.
- **Verification:**
  ```bash
  npm run test -- api/lists
  npm run typecheck
  ```
- **Risk / notes:** If current coverage already proves the contract, this task becomes a documentation sync only.

### TSB-005. Validate campaign operational action contracts beyond creation

- [ ] **Status:** Pending
- **Priority:** High
- **Depends on:** TSB-001, TSB-002
- **Files to touch:** `app/api/campaigns/campaigns.api.test.ts`, `app/api/campaigns/**`, `testsprite_tests/tmp/code_summary.yaml`
- **Problem:** `TC005` failed before meaningfully testing campaign operational endpoints, so send/pause/cancel/retry/generate/approve-all remain untrusted in TestSprite.
- **Expected outcome:** Route-level tests and summary entries clearly describe the valid state transitions, failure statuses, and exact endpoint/method combinations for campaign actions.
- **Done when:** Campaign API tests pass and the contract summary documents the actionable endpoints without placeholders.
- **Verification:**
  ```bash
  npm run test -- api/campaigns
  npm run typecheck
  ```
- **Risk / notes:** Prefer route-handler tests over full worker/integration behavior in this task.

### TSB-006. Validate import flow contract and request/response shapes

- [ ] **Status:** Pending
- **Priority:** High
- **Depends on:** TSB-001, TSB-002
- **Files to touch:** `app/api/import/import.api.test.ts`, `app/api/import/**`, `testsprite_tests/tmp/code_summary.yaml`
- **Problem:** `TC006` failed on bad pathing before proving whether upload/save/cancel behaviors match the documented contract.
- **Expected outcome:** Import route tests confirm exact upload semantics, row/save/cancel endpoints, and response bodies expected by clients.
- **Done when:** Import API tests pass and the contract summary no longer leaves room for `/dashboard/api/...` interpretation.
- **Verification:**
  ```bash
  npm run test -- api/import
  npm run typecheck
  ```
- **Risk / notes:** Include at least one negative case for unauthenticated access and one invalid-upload case.

### TSB-007. Validate reports export and notifications payload contracts

- [ ] **Status:** Pending
- **Priority:** Medium
- **Depends on:** TSB-001, TSB-002
- **Files to touch:** `app/api/reports/reports.api.test.ts`, `app/api/notifications/**`, `testsprite_tests/tmp/code_summary.yaml`
- **Problem:** `TC007` and `TC008` used wrong expectations: CSV was associated with the wrong route and notifications assumed the wrong response shape.
- **Expected outcome:** Tests and summary explicitly distinguish `GET /api/reports` (JSON) from `GET /api/reports/export` (CSV), and document notifications as `{ notifications, unreadCount }` plus mark-read endpoints.
- **Done when:** Reports + notifications API tests pass and the summary entries match the real implementation.
- **Verification:**
  ```bash
  npm run test -- api/reports
  npm run test -- api/notifications
  npm run typecheck
  ```
- **Risk / notes:** If TestSprite still misgenerates after this, the remaining problem is tool quality rather than backend ambiguity.

### TSB-008. Validate settings method contracts and secret-handling surfaces

- [ ] **Status:** Pending
- **Priority:** High
- **Depends on:** TSB-001, TSB-002
- **Files to touch:** `app/api/settings/settings.api.test.ts` or existing settings test files, `app/api/settings/**`, `testsprite_tests/tmp/code_summary.yaml`
- **Problem:** `TC009` treated SMTP update as `POST` when the real implementation is `PUT`, and similar method drift may exist for AI/limits/preferences/account routes.
- **Expected outcome:** Settings tests and summary explicitly define exact methods for SMTP, AI, sending limits, notification preferences, account profile, and password changes.
- **Done when:** Settings API tests pass and the summary captures method-accurate route contracts for all settings surfaces.
- **Verification:**
  ```bash
  npm run test -- api/settings
  npm run typecheck
  ```
- **Risk / notes:** Preserve existing secret-masking/encryption assertions; this is both contract and security-sensitive work.

### TSB-009. Re-run TestSprite in small batches and compare failures against local contract tests

- [ ] **Status:** Pending
- **Priority:** High
- **Depends on:** TSB-003, TSB-004, TSB-005, TSB-006, TSB-007, TSB-008
- **Files to touch:** `testsprite_tests/testsprite_backend_test_plan.json`, `testsprite_tests/tmp/raw_report.md`, `testsprite_tests/tmp/test_results.json`, `testsprite_tests/testsprite-mcp-test-report.md`
- **Problem:** Running all 9 cases together hides whether failures come from one broken generated flow or many separate issues.
- **Expected outcome:** TestSprite is re-run in smaller batches (auth/lists, campaigns/imports, reports/notifications/settings), and each failure is classified as either a real backend mismatch or a generated-test defect using local passing contract tests as evidence.
- **Done when:** The final report clearly separates confirmed backend bugs from TestSprite generation errors.
- **Verification:**
  ```bash
  npm run build
  ```
- **Risk / notes:** Keep the production server running during the batch reruns; do not change more than one contract area between batches.

---

## Completion rule

A task can be changed from `- [ ]` to `- [x]` only when:

- The implementation or documentation update is complete.
- The listed verification command has been run.
- Any failure is documented with a follow-up task.
- The change is committed if it modifies repository files.
