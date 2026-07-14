# Maintainability Refactor Loop Engineering Tasks

Use this checklist as a loop engineering queue. Each loop must:

1. Pick exactly one pending task whose dependencies are complete.
2. Define the expected outcome before editing.
3. Make the smallest safe change.
4. Run the listed verification commands.
5. Mark the task complete only after verification passes or the remaining risk is documented.

## Scope

This plan reduces structural complexity without changing product behavior. It does not include visual redesigns, new features, or generic abstractions without a concrete use case.

---

## Tasks

### MT-H6. Add characterization tests for critical surfaces

- [x] **Status:** Complete
- **Priority:** High
- **Depends on:** None
- **Files to touch:** `components/campaigns/campaign-detail-client.test.tsx`, `components/settings/settings-client.test.tsx`, support files under `test/` if needed
- **Problem:** `CampaignDetailClient` and `SettingsClient` contain much of the UI complexity but have no direct tests protecting their behavior during decomposition.
- **Expected outcome:** Characterization tests cover the primary states and actions that will move during refactoring without attempting to cover every visual detail.
- **Done when:** Tests cover at least loading, error, selection or tab switching, and one primary mutation per surface. They fail on an observable regression and pass against the current implementation.
- **Verification:**
  ```bash
  npm run typecheck
  npx vitest run components/campaigns/campaign-detail-client.test.tsx components/settings/settings-client.test.tsx
  ```
- **Risk / notes:** Test public behavior rather than internal structure so the tests survive decomposition. Characterization coverage uses public rendering and request behavior; Radix tab pointer behavior is covered by E2E rather than jsdom click simulation.

---

### MT-H1. Decompose `campaign-detail-client` into focused modules

- [x] **Status:** Complete
- **Priority:** High
- **Depends on:** MT-H6
- **Files to touch:** `components/campaigns/campaign-detail-client.tsx`, new modules under `components/campaigns/`
- **Problem:** `campaign-detail-client.tsx` combines queries, polling, local state, mutations, wizard navigation, and the entire review and sending interface in a single file of approximately 1,800 lines.
- **Expected outcome:** The file becomes a composition component. The interface is separated into focused modules such as campaign details, email review, settings panels, and campaign actions.
- **Done when:** The main file is materially smaller, every module has a clear responsibility, and no pass-through wrapper components are introduced.
- **Verification:**
  ```bash
  npm run typecheck
  npx vitest run components/campaigns/campaign-detail-client.test.tsx components/campaigns/create-campaign-wizard.test.tsx
  npx playwright test e2e/campaign.spec.ts
  ```
- **Risk / notes:** Do not combine this task with a visual redesign. Preserve polling, selection, mobile view, and the wizard transition. Typecheck, focused Vitest, and campaign E2E pass.

---

### MT-H2. Extract campaign detail actions and invalidation

- [x] **Status:** Complete
- **Priority:** High
- **Depends on:** MT-H1
- **Files to touch:** campaign detail modules under `components/campaigns/`, potentially `hooks/`
- **Problem:** Approve, send, pause, retry, cancel, regenerate, and save actions repeat `fetch`, error parsing, notifications, and React Query invalidation.
- **Expected outcome:** Campaign detail actions have a local canonical boundary with typed contracts and consistent error and invalidation policies.
- **Done when:** Components consume actions grouped by responsibility and no longer declare long handlers or duplicate `fetch + toast + invalidateQueries`.
- **Verification:**
  ```bash
  npm run typecheck
  npx vitest run components/campaigns/campaign-detail-client.test.tsx
  npx playwright test e2e/campaign.spec.ts
  ```
- **Risk / notes:** Keep the solution local to the campaigns domain. Do not introduce a generic `apiClient` unless it removes meaningful complexity. Typecheck, characterization tests, and campaign E2E pass.

---

### MT-H3. Split `settings-client` by tab and domain

- [x] **Status:** Complete
- **Priority:** High
- **Depends on:** MT-H6
- **Files to touch:** `components/settings/settings-client.tsx`, new modules under `components/settings/`
- **Problem:** `settings-client.tsx` combines five domains (`account`, `smtp`, `ai`, `limits`, `notifications`) and their query, save, test, and disconnect flows in a single file of approximately 1,200 lines.
- **Expected outcome:** Each tab lives in its own module, and `settings-client.tsx` becomes a composition component. SMTP, AI, limits, and notification forms and effects are isolated.
- **Done when:** The main file no longer contains complete implementations for multiple domains, is materially smaller, and preserves state while switching tabs.
- **Verification:**
  ```bash
  npm run typecheck
  npx vitest run components/settings/settings-client.test.tsx app/api/settings/settings.api.test.ts
  npx playwright test e2e/settings.spec.ts
  ```
- **Risk / notes:** Preserve `forceMount` behavior and do not trigger extra queries or mutations when switching tabs. Typecheck, focused unit/API tests, and Settings E2E pass.

---

### MT-H4. Centralize AI provider resolution and validation

- [x] **Status:** Complete
- **Priority:** High
- **Depends on:** None
- **Files to touch:** `lib/ai.ts`, `lib/jobs/generate-campaign.ts`, `app/api/campaigns/[id]/emails/[emailId]/regenerate/route.ts`, `app/api/settings/ai/test/route.ts`
- **Problem:** Provider, model, base URL, decrypted key, and host validation logic is duplicated across jobs and routes. This allows behavior to drift between consumers.
- **Expected outcome:** A single function or service resolves a ready-to-use AI configuration and validates custom base URLs when required.
- **Done when:** The three primary consumers reuse the same typed boundary and duplicate resolution and validation logic is removed.
- **Verification:**
  ```bash
  npm run typecheck
  npx vitest run lib/ai.test.ts lib/jobs/generate-campaign.test.ts app/api/settings/ai/test/route.test.ts app/api/campaigns/campaign-emails.api.test.ts
  ```
- **Risk / notes:** Keep prompt construction separate if including it makes the credential boundary less clear. Typecheck and the targeted AI/generation tests pass.

---

### MT-H5. Separate `processSend` into atomic stages

- [x] **Status:** Complete
- **Priority:** High
- **Depends on:** None
- **Files to touch:** `lib/jobs/send-campaign.ts`, focused modules under `lib/jobs/` if needed
- **Problem:** `processSend` combines send-run ownership, sending limits, suppression, SMTP, event persistence, campaign reconciliation, and notifications in a flow of approximately 460 lines. Each email result is persisted through multiple independent writes.
- **Expected outcome:** The flow is divided into clear stages for claiming a run, deciding continuations, sending one email, and persisting success or failure. Related writes use transactions where atomicity provides a real guarantee.
- **Done when:** The main flow reads as a short sequence of stages, and an intermediate failure cannot leave counters, email state, and delivery events inconsistent.
- **Verification:**
  ```bash
  npm run typecheck
  npx vitest run lib/jobs/send-campaign.test.ts
  ```
- **Risk / notes:** Do not change the state machine or re-enqueue semantics unless required to preserve atomicity. Typecheck and `lib/jobs/send-campaign.test.ts` pass (26 tests).

---

### MT-M1. Introduce canonical authentication and ownership helpers

- [x] **Status:** Complete
- **Priority:** Medium
- **Depends on:** None
- **Files to touch:** a representative subset of `app/api/**/route.ts`, potentially `lib/auth.ts` or `lib/api/`
- **Problem:** Dozens of handlers repeat session loading, authenticated-user validation, and ad hoc ownership queries for campaigns, lists, contacts, and imports.
- **Expected outcome:** Direct reusable helpers require a user and load resources belonging to that user.
- **Done when:** Selected routes use the new boundary, preserve their current HTTP status codes, and establish a clear code-level pattern for subsequent migrations.
- **Verification:**
  ```bash
  npm run typecheck
  npx vitest run app/api/campaigns/campaigns.api.test.ts app/api/contacts/contacts.api.test.ts app/api/lists/lists.api.test.ts
  ```
- **Risk / notes:** Do not hide HTTP responses inside magical helpers. Start with a small set of routes and avoid a mass migration in one loop. Typecheck and 50 focused campaign/contact/list API tests pass.

---

### MT-M2. Extract use cases from routes with mixed responsibilities

- [x] **Status:** Complete
- **Priority:** Medium
- **Depends on:** MT-M1, MT-H4
- **Files to touch:** `app/api/campaigns/[id]/emails/[emailId]/regenerate/route.ts`, `app/api/settings/ai/test/route.ts`, `app/api/contacts/route.ts`, new domain modules under `lib/`
- **Problem:** Some routes combine authentication, validation, ownership, external configuration, business rules, and response formatting.
- **Expected outcome:** Complex routes become thin HTTP adapters, while reusable logic lives in domain-specific use-case functions.
- **Done when:** Selected routes primarily read the request, invoke a use case, and construct the response.
- **Verification:**
  ```bash
  npm run typecheck
  npx vitest run app/api/settings/ai/test/route.test.ts app/api/campaigns/campaign-emails.api.test.ts app/api/contacts/contacts.api.test.ts
  ```
- **Risk / notes:** Do not create an abstract service layer for the entire system. Extract only logic with a clear responsibility and contract. Typecheck and 33 focused route tests pass.

---

### MT-M3. Decompose `reports-client`

- [x] **Status:** Complete
- **Priority:** Medium
- **Depends on:** None
- **Files to touch:** `components/reports/reports-client.tsx`, new modules under `components/reports/`
- **Problem:** `reports-client.tsx` combines metrics, campaign pagination, email filters, export, and the detail panel in a component of approximately 645 lines.
- **Expected outcome:** The view is divided into summary, campaign table, email table, and detail panel modules with direct props and no empty wrapper components.
- **Done when:** Each module has a clear responsibility, the main component becomes a compositor, and filter and pagination behavior remains unchanged.
- **Verification:**
  ```bash
  npm run typecheck
  npx vitest run app/api/reports/reports.api.test.ts
  npx playwright test e2e/navigation.spec.ts
  ```
- **Risk / notes:** If E2E coverage does not exercise filters and pagination, create a follow-up characterization task first. Typecheck, reports API tests, and navigation E2E pass.

---

### MT-M4. Modularize `prisma/seed.ts`

- [x] **Status:** Complete
- **Priority:** Medium
- **Depends on:** None
- **Files to touch:** `prisma/seed.ts`, new modules under `prisma/seed/`
- **Problem:** The seed combines fixtures, lists, campaigns, emails, and preferences in a long imperative sequence with implicit ordering.
- **Expected outcome:** Data and builders are separated by domain, while `seed.ts` becomes a simple composition entry point.
- **Done when:** Large fixture and persistence blocks live in smaller modules, the seed remains repeatable, and it produces the same demo scenarios.
- **Verification:**
  ```bash
  npm run typecheck
  npm run seed
  ```
- **Risk / notes:** `npm run seed` modifies the database configured in `DATABASE_URL`; run it only against a local or test database. Review existing local changes in `prisma/seed.ts` first and do not overwrite unrelated work. Typecheck passes; two consecutive seed runs against localhost produced identical demo data.

---

### MT-L1. Apply the validated pattern to `contacts-client` and `campaigns-client`

- [x] **Status:** Complete
- **Priority:** Low
- **Depends on:** MT-H1, MT-H2
- **Files to touch:** `components/contacts/contacts-client.tsx`, `components/campaigns/campaigns-client.tsx`, related submodules
- **Problem:** Both components combine tables, filters, bulk actions, dialogs, and mutations, so they are likely to grow like the campaign detail component.
- **Expected outcome:** Reuse structural decisions proven to simplify campaign detail: clear composition, encapsulated actions, and focused subcomponents.
- **Done when:** Both components are materially smaller and less complex without proliferating wrapper components or generic abstractions.
- **Verification:**
  ```bash
  npm run typecheck
  npx playwright test e2e/contacts.spec.ts e2e/campaign.spec.ts
  ```
- **Risk / notes:** Do not start until the pattern has been validated through `MT-H1` and `MT-H2`. Typecheck plus contacts and campaign E2E pass.

---

### MT-M6. Complete adoption of canonical authentication and ownership

- [x] **Status:** Complete
- **Priority:** Medium
- **Depends on:** MT-M1
- **Files to touch:** remaining routes under `app/api/**/route.ts`
- **Problem:** `MT-M1` validates the design in a subset of routes, but leaving two authentication and ownership patterns active would preserve the drift this plan aims to remove.
- **Expected outcome:** Protected routes consistently use the helpers validated in `MT-M1` without changing HTTP contracts or user isolation.
- **Done when:** No avoidable copies of the previous pattern remain, and every resource query retains the appropriate ownership filter.
- **Verification:**
  ```bash
  npm run typecheck
  npx vitest run app/api
  ```
- **Risk / notes:** Migrate one domain at a time within this loop and explicitly verify `401` and `404` responses. A shorter abstraction must not weaken tenant isolation. Typecheck and all 141 API tests pass.

---

### MT-M7. Simplify the campaign generation flow

- [x] **Status:** Complete
- **Priority:** Medium
- **Depends on:** MT-H4
- **Files to touch:** `lib/jobs/generate-campaign.ts`, focused modules under `lib/jobs/` if needed
- **Problem:** Even after AI configuration is centralized, `processGenerate` will still combine campaign state, contact selection, per-contact generation, persistence, cancellation, and notifications.
- **Expected outcome:** The main worker expresses a short sequence of stages and delegates per-contact generation and persistence to functions with clear contracts.
- **Done when:** Duplicate success and failure logic is reduced, cancellation remains safe, and the file no longer contains every workflow detail.
- **Verification:**
  ```bash
  npm run typecheck
  npx vitest run lib/jobs/generate-campaign.test.ts
  ```
- **Risk / notes:** Do not parallelize AI provider calls without an explicit decision about limits, cost, and cancellation. Typecheck and all 16 generation-worker tests pass.

---

### MT-L2. Decompose `import-review-client`

- [x] **Status:** Complete
- **Priority:** Low
- **Depends on:** MT-H1
- **Files to touch:** `components/import/import-review-client.tsx`, new modules under `components/import/`
- **Problem:** The import review combines preview, row editing, filters, bulk actions, list creation or selection, and saving in a component of approximately 600 lines.
- **Expected outcome:** The review table, bulk actions, and destination-list flow are separated into focused modules.
- **Done when:** The main component becomes a compositor, preserves selected-row semantics, and does not duplicate state across subcomponents.
- **Verification:**
  ```bash
  npm run typecheck
  npx vitest run components/import/import-review-client.test.tsx
  npx playwright test e2e/import.spec.ts
  ```
- **Risk / notes:** Preserve the exact handling of invalid and duplicate rows. Typecheck, 5 focused unit tests, and import E2E pass.

---

### MT-L3. Decompose `create-campaign-wizard`

- [x] **Status:** Complete
- **Priority:** Low
- **Depends on:** MT-H1, MT-H2
- **Files to touch:** `components/campaigns/create-campaign-wizard.tsx`, new modules under `components/campaigns/`
- **Problem:** The wizard combines step state, validation, create and edit modes, navigation, and submission in a component of more than 550 lines.
- **Expected outcome:** Form steps and orchestration are separated without duplicating the data model or creating a component for every field.
- **Done when:** The main component expresses the step flow directly, steps are focused modules, and create and edit behavior is preserved.
- **Verification:**
  ```bash
  npm run typecheck
  npx vitest run components/campaigns/create-campaign-wizard.test.tsx
  npx playwright test e2e/campaign.spec.ts
  ```
- **Risk / notes:** Reuse campaign detail contracts only when they represent the same concept. Do not couple both components for convenience. Typecheck, 3 wizard tests, and campaign E2E pass.

---

### MT-M5. Run the full quality gate

- [x] **Status:** Complete
- **Priority:** Medium
- **Depends on:** MT-H1, MT-H2, MT-H3, MT-H4, MT-H5, MT-M1, MT-M2, MT-M3, MT-M4, MT-M6, MT-M7, MT-L1, MT-L2, MT-L3
- **Files to touch:** Files requiring fixes discovered during verification; do not expand the functional scope
- **Problem:** Per-task verification is intentionally narrow and may not detect regressions between modules.
- **Expected outcome:** The complete repository passes static analysis, unit tests, the production build, and E2E tests.
- **Done when:** Every command completes successfully. Any failure unrelated to the refactor is documented in a new task with reproducible evidence.
- **Verification:**
  ```bash
  npm run lint
  npm run typecheck
  npm test
  npm run build
  npm run test:e2e
  ```
- **Risk / notes:** Run this task at the end of the plan, not as a replacement for each loop's focused verification. Lint has 16 non-blocking warnings and no errors; typecheck, 332 unit tests, production build, and all 18 E2E tests pass.

---

### MT-F1. Stabilize campaign worker E2E completion

- [x] **Status:** Complete
- **Priority:** High
- **Depends on:** None
- **Files to touch:** `e2e/campaign.spec.ts`, worker and queue configuration only if the root cause requires it
- **Problem:** `e2e/campaign.spec.ts` creates and enqueues a campaign successfully but it does not reach `pending_review` within its 90-second worker polling window.
- **Expected outcome:** The worker-backed campaign E2E finishes consistently without extending timeouts to mask a queue, provider, or worker lifecycle problem.
- **Done when:** `npx playwright test e2e/campaign.spec.ts` completes successfully from a clean local test run.
- **Verification:**
  ```bash
  npx playwright test e2e/campaign.spec.ts
  ```
- **Risk / notes:** The worker receives an explicit test-only localhost stub allowlist; production ignores it unconditionally. The allowlist matches exact URL origins, and the campaign E2E passes.

---

### MT-F2. Align settings E2E with force-mounted tabs

- [x] **Status:** Complete
- **Priority:** Medium
- **Depends on:** None
- **Files to touch:** `e2e/settings.spec.ts`
- **Problem:** The settings E2E fails to target a visible SMTP form control after tab selection and expects the obsolete `AI Configuration` heading instead of `AI Integration`.
- **Expected outcome:** E2E locators target the active force-mounted tab and current UI labels without weakening behavior assertions.
- **Done when:** `npx playwright test e2e/settings.spec.ts` completes successfully.
- **Verification:**
  ```bash
  npx playwright test e2e/settings.spec.ts
  ```
- **Risk / notes:** Keep the test focused on visible interactive controls, not implementation classes. The four Settings E2E cases pass.

---

### MT-F3. Repair generation notification test fixtures

- [x] **Status:** Complete
- **Priority:** Medium
- **Depends on:** None
- **Files to touch:** `lib/jobs/generate-campaign.test.ts`, notification test support if required
- **Problem:** Two generation failure tests do not observe the expected notification creation, including on the baseline before the AI configuration refactor.
- **Expected outcome:** The fixtures and assertions accurately cover failure notifications without masking a production notification defect.
- **Done when:** `npx vitest run lib/jobs/generate-campaign.test.ts` passes.
- **Verification:**
  ```bash
  npx vitest run lib/jobs/generate-campaign.test.ts
  ```
- **Risk / notes:** The generation suite now passes all 16 tests; no production notification behavior change was required.

---

### MT-F4. Restore contacts E2E contract

- [x] **Status:** Complete
- **Priority:** High
- **Depends on:** None
- **Files to touch:** `e2e/contacts.spec.ts`, E2E setup and AI local-stub configuration if required
- **Problem:** The contacts E2E navigates to nonexistent `/contacts/add`.
- **Expected outcome:** E2E uses the current contacts UI.
- **Done when:** `npx playwright test e2e/contacts.spec.ts` passes.
- **Verification:**
  ```bash
  npx playwright test e2e/contacts.spec.ts
  ```
- **Risk / notes:** The campaign local-stub issue was completed in MT-F1. Contacts E2E passes all three cases without weakening validation.

---

### MT-F5. Align import E2E entry point with current UI

- [x] **Status:** Complete
- **Priority:** Medium
- **Depends on:** None
- **Files to touch:** `e2e/import.spec.ts`, import page setup if required
- **Problem:** Both import E2E flows time out before review because the test cannot find the `Upload CSV` control after authentication.
- **Expected outcome:** The E2E enters the current import UI and exercises the preserved review behavior.
- **Done when:** `npx playwright test e2e/import.spec.ts` passes.
- **Verification:**
  ```bash
  npx playwright test e2e/import.spec.ts
  ```
- **Risk / notes:** Update locators or navigation only; do not weaken import validation as an E2E workaround. Import E2E passes all three cases.

---

### MT-F6. Update remaining E2E UI contracts

- [x] **Status:** Complete
- **Priority:** High
- **Depends on:** None
- **Files to touch:** `e2e/auth.spec.ts`, `e2e/lists.spec.ts`, `e2e/navigation.spec.ts`, affected page components only if a documented product contract regressed
- **Problem:** The full E2E run has stale expectations for callback URLs, the login brand label, profile menu naming, and the list deletion control.
- **Expected outcome:** Tests target the current accessible UI and continue to assert the intended auth, navigation, and list-management behavior.
- **Done when:** These E2E cases pass without weakening product assertions.
- **Verification:**
  ```bash
  npx playwright test e2e/auth.spec.ts e2e/lists.spec.ts e2e/navigation.spec.ts
  ```
- **Risk / notes:** Change production behavior only when the current behavior contradicts a documented product contract; otherwise update resilient user-facing locators. All nine auth, list, and navigation E2E cases pass.

---

## Completion Rule

A task may change from `- [ ]` to `- [x]` only when:

- The implementation is complete.
- Every listed verification command has completed successfully.
- Any failure or remaining risk is documented in a new follow-up task.
- Code changes and this document update are included in the same commit.

Task IDs are stable. Do not rename or reuse them; add new tasks for new findings.
