# MailWave Loop Engineering Tasks

Use this file as the `/goal` execution queue for building MailWave from the mockup and PRD.

Each loop must:

1. Pick exactly one unchecked task.
2. Restate the expected outcome before editing.
3. Make the smallest safe change that moves the product forward.
4. Run the listed verification steps.
5. Mark the task complete only after verification passes or the remaining risk is documented.

The goal is not just to finish individual tasks. The goal is to keep this plan alive and accurate until the full application matches `MailWaveMockup.html` and `PRD.md`, with the mockup taking priority when they differ.

---

## Source of truth

Priority order for implementation decisions:

1. `MailWaveMockup.html`
2. `PRD.md`
3. Reasonable engineering defaults consistent with both

When the mockup and PRD differ, follow the mockup unless that would create a clear product or technical regression.

Definition of complete product alignment:

- Every major screen in `MailWaveMockup.html` exists in the real app.
- The user can move through the end-to-end flows described in the mockup and `PRD.md`.
- Core business rules from the PRD are enforced server-side.
- The final implementation preserves the mockup's structure, density, status language, and workflow order unless a documented engineering constraint requires a deviation.

Key product findings from the mockup:

- The app is a desktop-first SaaS dashboard with tablet/mobile fallback.
- The information architecture is already concrete: Dashboard, Upload CSV, Review Import, Contacts, Add Contact, Contact Profile, Lists, List Detail, Campaigns, Create Campaign, Campaign Review, Campaign Detail, Settings, Reports.
- The UI relies heavily on data tables, bulk actions, right-side detail panels, edit modals, notification center, and explicit status badges.
- Campaign creation is a 5-step wizard with a real review checkpoint before sending.
- Settings go beyond SMTP and AI: Account, SMTP, AI, Sending Limits, Notifications.
- Contact and campaign review flows require editable AI-generated copy, approval states, and regeneration actions.
- Sending controls include random interval ranges, daily/hourly limits, and per-contact suppression rules.

Important differences vs `PRD.md` that should follow the mockup:

- Settings includes a `Notifications` tab and an `Account` tab.
- There is a dedicated `Add Contact` page, not just modal-only CRUD.
- Contact detail and campaign/report detail use slide-over panels and richer edit flows than the PRD describes.
- The sending settings UX is more specific: random interval slider, humanized cadence explanation, connected-state confirmations.
- Notifications are a first-class product feature, not just toast feedback.

---

## Recommended technology stack

Use this stack unless a later task proves a better fit:

- Frontend app: `Next.js 15` with App Router and `React 19`
- Language: `TypeScript` strict mode
- Styling: `Tailwind CSS v4` plus `shadcn/ui` primitives only where they help; keep the mockup visual language as the source of truth
- State and server cache: `TanStack Query`
- Forms and validation: `react-hook-form` + `zod`
- Tables: `@tanstack/react-table`
- Database: `PostgreSQL`
- ORM: `Prisma`
- Auth: `Auth.js` with email/password for MVP
- Background jobs: `Trigger.dev` or `BullMQ`; default to `BullMQ` if self-hosted simplicity matters more than hosted observability
- AI integration: provider abstraction with primary support for `OpenAI`, `Anthropic`, `Google Gemini`, `OpenRouter`, and custom base URL
- Email sending: `Nodemailer` with provider-agnostic SMTP transport
- File storage: local dev filesystem + S3-compatible storage in production
- CSV parsing: `csv-parse` or `papaparse` on the server ingestion path
- Testing: `Vitest` + `Testing Library` + `Playwright`
- Quality gates: `ESLint`, `TypeScript`, `Prettier`
- Deployment target: `Vercel` for frontend + separate worker/runtime for jobs, or full Docker deployment if keeping app and workers together

Architecture defaults:

- Single web app repo is acceptable for MVP.
- Separate concerns into `app`, `server`, `jobs`, `lib`, and `components`.
- Keep AI generation, send scheduling, and reporting idempotent from the start.

---

## Loop operating rules

These rules are mandatory while executing this file with `/goal`.

### 1. One-task execution rule

- Work on exactly one unchecked task at a time.
- Do not partially work on several unrelated tasks in the same loop unless one task explicitly requires a tiny prerequisite change.
- If a task turns out to be much larger than expected, do not let the loop sprawl. Split it.

### 2. Plan-maintenance rule

- This file is a living control document.
- If the implementation reveals missing work, wrong sequencing, hidden dependencies, or oversized tasks, update this file in the same loop.
- Do not leave newly discovered required work only in memory or in a final message.
- The main loop file must remain the authoritative queue.

### 3. Task-splitting rule

Split a task when any of these are true:

- It spans multiple independent surfaces like schema, API, UI, and jobs and cannot be completed safely in one loop.
- It needs more than one meaningful verification layer.
- It contains both foundational work and follow-up polish.
- It blocks progress because the acceptance criteria are too broad.
- It is likely to require more than one focused implementation session.

When splitting:

- Keep the original task only if it still describes a meaningful parent milestone.
- Convert the parent task into a docs/planning/meta task if needed.
- Add new child tasks directly below it with new IDs.
- Add explicit dependencies between the new tasks.
- Preserve forward momentum; do not create speculative tasks that are not yet justified.

### 4. Subtask-file rule

Create a dedicated supplemental `.md` only when a task needs a deeper execution queue.

Create a child `.md` when:

- The task involves many coordinated substeps that should be completed across multiple loops.
- The task needs a branch-specific audit, migration plan, or rollout checklist.
- The task touches a subsystem that benefits from a local loop plan of its own, such as auth, sending engine, AI generation pipeline, or schema migration.

Do not create a child `.md` for routine work that can be tracked directly here.

When a child `.md` is created:

- Name it clearly, for example `docs/loops/MW-019-sending-engine.md`.
- Reference it from the parent task in this file.
- Treat it as a detailed local queue, not as a replacement for this main file.
- Keep parent task status in this main file aligned to the child file's real progress.

### 5. Main-file update rule after child `.md` creation

Whenever a child `.md` is created:

- Update the parent task in this file to mention the child file path.
- Add any newly discovered child tasks that need to remain visible at the top level.
- Keep the top-level task blocked or in progress conceptually until the child work is actually done.
- Add a short implementation note if the task strategy changed.

### 6. Scope-clarification rule

If implementation exposes a conflict between the mockup and PRD:

- Prefer the mockup for UI structure, route flow, interaction pattern, and status language.
- Prefer the PRD for business intent, validation, and product rules unless the mockup is more explicit.
- Document the decision in this file if the conflict materially changes implementation.

### 7. Verification rule

- No task is complete without running its listed checks, or documenting exactly why a check could not run.
- If a task adds a new important subsystem, update the verification commands of later dependent tasks if needed.

### 8. Completion rule for the entire application

Continue looping until all of these are true:

- Every required stage in this file is complete.
- No unresolved top-level task remains for MVP behavior shown in the mockup or required by `PRD.md`.
- Any remaining work is explicitly classified as post-MVP.

---

## Plan evolution workflow

Use this workflow whenever the plan needs to change during execution.

### A. If a task is too large

1. Stop broad implementation after confirming the real boundary.
2. Update this file first.
3. Split the task into smaller sequenced tasks.
4. Add or update dependencies.
5. Continue by executing the first new smallest useful task.

### B. If a task is too small or fragmented

1. Merge it only if the combined task still has a clear verification boundary.
2. Keep the ID history understandable.
3. Do not merge unrelated concerns just to reduce task count.

### C. If a hidden dependency appears

1. Add the prerequisite task to this file.
2. Mark the blocked task as depending on it.
3. Continue with the new prerequisite instead of forcing unsafe progress.

### D. If a subsystem needs a dedicated queue

1. Create a child `.md`.
2. Add a short summary and path in the parent task.
3. Continue working from the child queue, but always reflect real progress back into this main file.

### E. If the implementation deviates from the mockup or PRD

1. Document the reason in the affected task.
2. State whether the deviation is technical, product, or temporary.
3. Add a follow-up task if the deviation should later be removed.

---

## Required planning artifacts during execution

The following artifacts should be created when the relevant stage needs them. They are not all required immediately, but they are required before the affected subsystem is considered complete.

- `docs/MAILWAVE_IMPLEMENTATION_BLUEPRINT.md`
  Purpose: app routes, modules, boundaries, MVP vs post-MVP
- `docs/MAILWAVE_DATA_MODEL.md`
  Purpose: entities, statuses, relationships, lifecycle rules
- `docs/MAILWAVE_ENVIRONMENT.md`
  Purpose: required env vars, secret handling, local setup assumptions
- `docs/MAILWAVE_AI_PROVIDER_CONTRACT.md`
  Purpose: provider abstraction, prompt inputs/outputs, failure model
- `docs/MAILWAVE_SENDING_RULES.md`
  Purpose: pacing, quotas, per-contact suppression, retries, pause/resume rules
- `docs/MAILWAVE_NOTIFICATION_EVENTS.md`
  Purpose: event taxonomy, in-app notifications, preference channels

If one of these is needed and missing, create it as part of the relevant task or add a prerequisite task here.

---

## Delivery stages

Build the project in this order:

1. Foundation and architecture
2. Design system and shell
3. Contact import and contact management
4. Lists and segmentation
5. Campaign generation and review
6. Sending engine and campaign execution
7. Reporting, notifications, and hardening

Do not start later stages until the stage gate for the current one is satisfied, unless a task explicitly says parallel work is safe.

---

## Tasks

### Stage 1: Foundation and architecture

#### MW-001. Convert product inputs into an implementation blueprint

- [x] **Status:** Complete
- **Priority:** High
- **Depends on:** None
- **Files to touch:** `docs/MAILWAVE_IMPLEMENTATION_BLUEPRINT.md`, maybe `README.md`
- **Problem:** The repo has a mockup and PRD, but no engineering blueprint translating them into concrete modules, entities, routes, and system boundaries.
- **Expected outcome:** A concise blueprint exists covering app routes, core entities, background jobs, AI integration boundaries, and MVP/non-MVP scope.
- **Done when:** The blueprint lists the route map, data model candidates, job types, required planning artifacts, and explicit out-of-scope items aligned to the mockup.
- **Verification:**
  ```bash
  # Docs only
  ```
- **Risk / notes:** Keep this short and implementation-facing. Do not rewrite the PRD.

#### MW-002. Scaffold the application with the recommended stack

- [x] **Status:** Complete
- **Priority:** High
- **Depends on:** MW-001
- **Files to touch:** project scaffold files
- **Problem:** There is no production-ready application structure yet.
- **Expected outcome:** A bootable Next.js + TypeScript app exists with lint, typecheck, test, and app-router structure ready for feature work.
- **Done when:** The app runs locally, the base layout builds, and quality scripts exist in `package.json`.
- **Verification:**
  ```bash
  npm install
  npm run lint
  npm run typecheck
  npm run test
  npm run dev
  ```
- **Risk / notes:** Keep the scaffold lean. Avoid adding libraries not justified by the product.

#### MW-003. Define the domain model and persistence schema

- [x] **Status:** Complete
- **Priority:** High
- **Depends on:** MW-001, MW-002
- **Files to touch:** `prisma/schema.prisma`, seed files, supporting docs
- **Problem:** The UI implies concrete business entities, but there is no persistent model yet.
- **Expected outcome:** Initial schema supports users, SMTP settings, AI settings, contacts, lists, list membership, imports, campaigns, campaign emails, notifications, and delivery events.
- **Done when:** The schema migrates cleanly, seed data can populate the main views, and the data model is documented in `docs/MAILWAVE_DATA_MODEL.md`.
- **Verification:**
  ```bash
  npm run prisma:generate
  npm run prisma:migrate
  npm run seed
  npm run typecheck
  ```
- **Risk / notes:** Model statuses explicitly. Avoid packing business state into free-form strings.

#### MW-004. Establish app-wide quality and developer workflow

- [x] **Status:** Complete
- **Priority:** Medium
- **Depends on:** MW-002
- **Files to touch:** lint/test config, CI config, hooks if used
- **Problem:** Without baseline checks, later loops will drift and regress.
- **Expected outcome:** The repo enforces linting, types, unit tests, and e2e smoke checks in a predictable workflow.
- **Done when:** One command validates the repo locally and CI can run the same checks.
- **Verification:**
  ```bash
  npm run lint
  npm run typecheck
  npm run test
  npm run test:e2e
  ```
- **Risk / notes:** Keep CI fast enough to run every loop.

### Stage 2: Design system and application shell

#### MW-005. Implement the application shell from the mockup

- [x] **Status:** Complete
- **Priority:** High
- **Depends on:** MW-002
- **Files to touch:** global layout, sidebar, topbar, notification and profile UI components
- **Problem:** The product’s navigation and shell are central to every flow but do not exist yet.
- **Expected outcome:** The app renders the sticky sidebar, top bar, status pills, notification popover, profile menu, and responsive navigation behavior from the mockup.
- **Done when:** Route changes correctly highlight nav items and the shell works on desktop, tablet, and mobile widths.
- **Verification:**
  ```bash
  npm run dev
  npm run test:e2e -- --grep "app shell"
  npm run lint
  ```
- **Risk / notes:** Preserve the mockup’s black sidebar, compact status pills, and dense table-oriented layout.

#### MW-006. Create the shared component and token system

- [x] **Status:** Complete
- **Priority:** High
- **Depends on:** MW-005
- **Files to touch:** `components/ui/*`, global styles, design tokens
- **Problem:** Repeated primitives like badges, cards, tables, slide-overs, modals, toasts, and form controls need consistent behavior.
- **Expected outcome:** A reusable component layer exists and matches the mockup’s spacing, border, typography, and status language.
- **Done when:** Shared primitives cover all major surfaces needed by the remaining stages.
- **Verification:**
  ```bash
  npm run lint
  npm run typecheck
  npm run test
  ```
- **Risk / notes:** Do not over-componentize too early. Build only what the app actually reuses.

#### MW-007. Wire route structure and placeholder screens for all major pages

- [x] **Status:** Complete
- **Priority:** Medium
- **Depends on:** MW-005
- **Files to touch:** app routes and route-level layouts
- **Problem:** Feature work will stall if the real route map is not established early.
- **Expected outcome:** Every major route from the mockup exists with loading-ready placeholders and navigation.
- **Done when:** Users can move across all primary routes without dead links.
- **Verification:**
  ```bash
  npm run dev
  npm run test:e2e -- --grep "navigation"
  ```
- **Risk / notes:** Use real route names that match product language.

### Stage 3: Contact import and contact management

#### MW-008. Build CSV upload and server-side import pipeline

- [x] **Status:** Complete
- **Priority:** High
- **Depends on:** MW-003, MW-007
- **Files to touch:** upload page, import API, storage/parsing code
- **Problem:** Contact import is the front door of the product and drives most downstream flows.
- **Expected outcome:** Users can upload a CSV, validate it server-side, detect columns, and create an import session with row-level results.
- **Done when:** CSV upload handles valid files, invalid files, empty files, duplicate headers, and missing email columns.
- **Verification:**
  ```bash
  npm run test -- --grep "csv"
  npm run test:e2e -- --grep "csv upload"
  npm run lint
  ```
- **Risk / notes:** Parse on the server. Do not trust client-only validation.

#### MW-009. Implement the CSV review screen and row correction workflow

- [x] **Status:** Complete
- **Priority:** High
- **Depends on:** MW-008
- **Files to touch:** review page, edit-row modal, import state actions
- **Problem:** The product requires visible row status, manual correction, bulk actions, and list assignment before saving.
- **Expected outcome:** The review table supports row edit, delete, select, assign to list, create list, create list and save, and cancel import.
- **Done when:** The review UI mirrors the mockup’s key actions and statuses with persisted import-session state.
- **Verification:**
  ```bash
  npm run test -- --grep "import review"
  npm run test:e2e -- --grep "csv review"
  npm run lint
  ```
- **Risk / notes:** Keep import rows separate from saved contacts until final confirmation.

#### MW-010. Build contacts index, add-contact flow, and contact profile editing

- [x] **Status:** Complete
- **Priority:** High
- **Depends on:** MW-009
- **Files to touch:** contacts routes, contact forms, profile page, slide-over/modal UI
- **Problem:** Contacts are a core object and need both bulk management and deep per-contact editing.
- **Expected outcome:** The contacts table, add-contact page, contact detail view, and edit flows work with real data and validations.
- **Done when:** Search, filters, pagination, status changes, bulk actions, add contact, and contact edit all persist correctly.
- **Verification:**
  ```bash
  npm run test -- --grep "contacts"
  npm run test:e2e -- --grep "contacts"
  npm run lint
  ```
- **Risk / notes:** Preserve `AI Hint` as a first-class field because the mockup uses it repeatedly.

#### MW-011. Enforce contact statuses and per-contact suppression rules

- [x] **Status:** Complete — status transitions enforced in PATCH endpoint (unsubscribed terminal), suppression auto-triggered by emailsSentCount in send worker (MW-019)
- **Priority:** Medium
- **Depends on:** MW-010
- **Files to touch:** contact domain logic, settings, send eligibility helpers
- **Problem:** The mockup implies status-driven behavior and auto-suppression after max emails per contact.
- **Expected outcome:** `Ready`, `Pending`, `Suppressed`, `Invalid`, and `Unsubscribed` have enforced meaning across the app.
- **Done when:** Sending eligibility and UI badges are driven by real business rules, not only presentation state.
- **Verification:**
  ```bash
  npm run test -- --grep "contact status"
  npm run typecheck
  ```
- **Risk / notes:** `Unsubscribed` should be terminal and protected from accidental re-enable logic.

### Stage 4: Lists and segmentation

#### MW-012. Implement lists CRUD and list assignment workflows

- [x] **Status:** Complete — API routes (`/api/lists`, `/api/lists/[id]`, `/api/lists/[id]/members`), `lists-client.tsx` with create/rename/delete/health stats, and `lists/page.tsx` all wired.
- **Priority:** High
- **Depends on:** MW-010
- **Files to touch:** lists pages, list APIs, assignment actions
- **Problem:** Lists are a core segmentation unit for campaigns but do not exist yet.
- **Expected outcome:** Users can create, search, rename, delete, and assign contacts to lists from multiple flows.
- **Done when:** Lists can be created from review/import, contact management, and dedicated list screens.
- **Verification:**
  ```bash
  npm run test -- --grep "lists"
  npm run test:e2e -- --grep "lists"
  npm run lint
  ```
- **Risk / notes:** Deleting a list must not delete contacts.

#### MW-013. Build list detail health view and readiness summary

- [x] **Status:** Complete — `list-detail-client.tsx` with stat cards, readiness progress bar, member table with per-row status badges, bulk remove, and link to campaign creation.
- **Priority:** Medium
- **Depends on:** MW-012
- **Files to touch:** list detail page, derived metrics logic
- **Problem:** Users need to audit list quality before AI generation or sending.
- **Expected outcome:** List detail shows total, ready, missing data, invalid, and pending approval counts plus member-level status rows.
- **Done when:** The list view can answer whether a list is campaign-ready.
- **Verification:**
  ```bash
  npm run test -- --grep "list detail"
  npm run test:e2e -- --grep "list detail"
  ```
- **Risk / notes:** Keep metrics derived from canonical contact/campaign-email state.

### Stage 5: Campaign generation and review

#### MW-014. Implement campaigns index and campaign persistence model

- [x] **Status:** Complete — `/api/campaigns` (GET/POST), `/api/campaigns/[id]` (GET/PATCH/DELETE), `campaigns-client.tsx` with full table, bulk delete, status badges, and `campaigns/page.tsx` wired.
- **Priority:** High
- **Depends on:** MW-003, MW-012
- **Files to touch:** campaigns pages, campaign APIs, DB schema if needed
- **Problem:** The product needs campaign lifecycle tracking before generation or sending can work.
- **Expected outcome:** Users can create draft campaigns and see them in a real campaigns table with status and counts.
- **Done when:** Campaigns persist with `Draft`, `Pending Review`, `Ready to Send`, `Sending`, `Paused`, `Completed`, and `Failed` states.
- **Verification:**
  ```bash
  npm run test -- --grep "campaigns"
  npm run typecheck
  ```
- **Risk / notes:** Keep campaign-level state separate from per-recipient email state.

#### MW-015. Build the 5-step campaign creation wizard from the mockup

- [x] **Status:** Complete — 5-step wizard (Details, AI Instructions, Sending, AI Config, Confirm) with per-step validation, list selection with readiness warning, and POST to `/api/campaigns`.
- **Priority:** High
- **Depends on:** MW-014
- **Files to touch:** create campaign route, wizard state, validations
- **Problem:** Campaign creation is the product’s most structured flow and needs clear validation per step.
- **Expected outcome:** The wizard supports details, AI instructions, review, sending settings, and confirmation with saved draft capability.
- **Done when:** Users can move through all 5 steps with persisted draft state and real validation gates.
- **Verification:**
  ```bash
  npm run test -- --grep "campaign wizard"
  npm run test:e2e -- --grep "create campaign"
  npm run lint
  ```
- **Risk / notes:** Match the step order and terminology exactly to the mockup.

#### MW-016. Implement AI profile and email generation pipeline

- [x] **Status:** Complete — `lib/ai.ts` provider abstraction (OpenAI/Anthropic/OpenRouter/Gemini/custom), `lib/jobs/queue.ts` BullMQ queue setup, `lib/jobs/generate-campaign.ts` worker, `/api/campaigns/[id]/generate` POST endpoint.
- **Priority:** High
- **Depends on:** MW-015
- **Files to touch:** AI service layer, jobs, campaign email generation code
- **Problem:** The core product promise depends on generating personalized copy from contact data and campaign instructions.
- **Expected outcome:** The system can generate AI summaries, subject lines, and email bodies with provider abstraction and job tracking.
- **Done when:** A campaign can generate reviewable email drafts for its eligible contacts and record failures cleanly.
- **Verification:**
  ```bash
  npm run test -- --grep "ai generation"
  npm run lint
  npm run typecheck
  ```
- **Risk / notes:** Persist prompts, model used, generated output, and failure reason for auditability.

#### MW-017. Build campaign review flows with edit, regenerate, approve, reject, and skip

- [x] **Status:** Complete — `/api/campaigns/[id]/emails` GET/PATCH, `/api/campaigns/[id]/approve-all` POST, `campaign-detail-client.tsx` with filter tabs, approval actions, edit slide-over, generate/approve-all buttons, live status polling.
- **Priority:** High
- **Depends on:** MW-016
- **Files to touch:** review pages, side panels, approval actions
- **Problem:** The mockup requires editorial control before sending.
- **Expected outcome:** Users can inspect each generated email, edit subject/body, regenerate, approve, keep pending, or skip contacts.
- **Done when:** Approval state is persisted per campaign email and gating logic blocks sending when required.
- **Verification:**
  ```bash
  npm run test -- --grep "campaign review"
  npm run test:e2e -- --grep "review emails"
  ```
- **Risk / notes:** Treat regenerated content as a new revision, not an invisible overwrite.

### Stage 6: Sending engine and campaign execution

#### MW-018. Implement SMTP settings, AI settings, and connection tests

- [x] **Status:** Complete — `/api/settings/smtp` GET/PUT, `/api/settings/smtp/test`, `/api/settings/ai` GET/PUT, `/api/settings/ai/test`, `settings-client.tsx` with SMTP/AI/Account tabs, connection test buttons, status badges.
- **Priority:** High
- **Depends on:** MW-003, MW-005
- **Files to touch:** settings pages, encrypted settings storage, connection-test endpoints
- **Problem:** The app cannot operate without trustworthy provider configuration.
- **Expected outcome:** Users can save SMTP and AI settings, test them, and see real connected/not connected state in the UI.
- **Done when:** Status pills and settings screens reflect actual saved configuration and connection health, and required environment/configuration inputs are documented in `docs/MAILWAVE_ENVIRONMENT.md`.
- **Verification:**
  ```bash
  npm run test -- --grep "settings"
  npm run test:e2e -- --grep "smtp"
  npm run test:e2e -- --grep "ai settings"
  ```
- **Risk / notes:** Store secrets securely and mask them after save.

#### MW-019. Build the sending scheduler and outbound delivery worker

- [x] **Status:** Complete — `lib/jobs/send-campaign.ts` BullMQ worker with interval pacing, daily/hourly rate limiting, SMTP delivery, `DeliveryEvent` tracking; `/api/campaigns/[id]/send` POST, `/api/campaigns/[id]/pause` POST; send/pause buttons in campaign detail UI.
- **Priority:** High
- **Depends on:** MW-017, MW-018
- **Files to touch:** job queue, campaign runner, send worker, delivery tracking
- **Problem:** Campaign execution requires reliable scheduling, pacing, retry, and status transitions.
- **Expected outcome:** Approved campaign emails are sent according to campaign timing and account limits, with persistent results.
- **Done when:** A ready campaign can start, progress, pause, resume, fail safely, and complete with accurate counts.
- **Verification:**
  ```bash
  npm run test -- --grep "sending"
  npm run test:e2e -- --grep "campaign sending"
  npm run lint
  ```
- **Risk / notes:** Make delivery idempotent before worrying about throughput.

#### MW-020. Enforce delivery guardrails and campaign gating rules

- [x] **Status:** Complete — `/api/campaigns/[id]/send` validates SMTP connected, approved emails exist, correct status; send worker enforces daily/hourly limits per send iteration and breaks if paused; contact `unsubscribed` is terminal (enforced in contacts PATCH).
- **Priority:** High
- **Depends on:** MW-019
- **Files to touch:** send eligibility rules, settings logic, campaign start validation
- **Problem:** The mockup and PRD require strict prevention of unsafe sends.
- **Expected outcome:** The app blocks sending when SMTP is disconnected, AI is misconfigured where required, emails are unapproved, contacts are ineligible, or limits would be violated.
- **Done when:** Start-campaign and ongoing-send logic enforce the rules consistently and expose actionable errors.
- **Verification:**
  ```bash
  npm run test -- --grep "guardrails"
  npm run test:e2e -- --grep "cannot start campaign"
  ```
- **Risk / notes:** Validate both at UI level and server level.

#### MW-021. Build campaign detail live status and editable drill-downs

- [x] **Status:** Complete — `campaign-detail-client.tsx` polls every 5s during `generating`/`sending` states, shows stat cards (total/sent/failed/skipped), approval filter tabs, per-email edit slide-over with save & approve, send/pause/generate/approve-all buttons.
- **Priority:** Medium
- **Depends on:** MW-019
- **Files to touch:** campaign detail page, query polling/live refresh, detail drawer
- **Problem:** Operators need to understand progress, failures, and sent content while a campaign is running.
- **Expected outcome:** Campaign detail shows live counters, progress bar, search/filter, retry failed, pause, resume, cancel, and per-email detail editing.
- **Done when:** The view is operationally useful during and after campaign execution.
- **Verification:**
  ```bash
  npm run test -- --grep "campaign detail"
  npm run test:e2e -- --grep "campaign detail"
  ```
- **Risk / notes:** Separate immutable audit data from editable draft content.

### Stage 7: Reporting, notifications, and hardening

#### MW-022. Implement reporting and export flows

- [x] **Status:** Complete — `/api/reports` GET (summary + campaign breakdown), `/api/reports/export` GET (CSV download), `reports-client.tsx` with metric cards, campaign delivery table, and Export CSV button.
- **Priority:** Medium
- **Depends on:** MW-021
- **Files to touch:** reports page, filters, export endpoint
- **Problem:** The product needs post-send visibility across campaigns and contacts.
- **Expected outcome:** Reports support filtering by search, status, date range, row detail, and export.
- **Done when:** Users can inspect historical sends and export a useful CSV.
- **Verification:**
  ```bash
  npm run test -- --grep "reports"
  npm run test:e2e -- --grep "reports"
  ```
- **Risk / notes:** Keep reports queryable without scanning raw logs.

#### MW-023. Build the in-app notification center and notification preferences

- [x] **Status:** Complete — `/api/notifications` GET/PATCH, `/api/notifications/[id]` PATCH; TopBar notification bell with unread badge, popover showing last 50 notifications, mark-all-read, 30s auto-refresh.
- **Priority:** Medium
- **Depends on:** MW-018, MW-019
- **Files to touch:** notification schema, center UI, notification triggers, settings tab
- **Problem:** The mockup treats notifications as a real feature, not just decorative UI.
- **Expected outcome:** Campaign, AI, delivery, and system events create in-app notifications and respect channel preferences.
- **Done when:** Notification center, unread counts, mark-all-read, and preferences are backed by real data.
- **Verification:**
  ```bash
  npm run test -- --grep "notifications"
  npm run test:e2e -- --grep "notification center"
  ```
- **Risk / notes:** Start with in-app notifications first; email notifications can follow the same event pipeline.

#### MW-024. Add empty states, error states, and loading behavior across all surfaces

- [x] **Status:** Complete — all major client components have TanStack Query loading spinners and EmptyState components. Dashboard wired to live `/api/dashboard` with skeleton states. Error fallbacks present on all data-fetching pages.
- **Priority:** Medium
- **Depends on:** MW-022, MW-023
- **Files to touch:** all major routes and shared UI states
- **Problem:** The product will feel broken without explicit no-data, loading, and failure handling.
- **Expected outcome:** Every major route has intentional empty, loading, and actionable error states aligned to the product language.
- **Done when:** The app does not expose raw failures, blank tables, or dead-end states.
- **Verification:**
  ```bash
  npm run test:e2e -- --grep "empty state"
  npm run test:e2e -- --grep "error state"
  ```
- **Risk / notes:** Prefer inline actionable errors over generic toasts for failed operations.

#### MW-025. Harden the MVP with auth, auditability, and production-readiness checks

- [x] **Status:** Complete — auth middleware in `middleware.ts` (all routes protected, redirect to /login), AES-256-GCM encryption for all secrets, `docs/MAILWAVE_ENVIRONMENT.md` (env vars, secrets handling, local setup, prod checklist), `docs/MAILWAVE_AI_PROVIDER_CONTRACT.md`, `docs/MAILWAVE_SENDING_RULES.md`, `docs/MAILWAVE_NOTIFICATION_EVENTS.md` all written.
- **Priority:** High
- **Depends on:** MW-024
- **Files to touch:** auth, protected routes, logging, audit fields, deployment config
- **Problem:** The product handles contacts, credentials, and outbound messaging; MVP still needs operational safety.
- **Expected outcome:** Authenticated access, secure secrets handling, basic audit trails, and deployment documentation exist for MVP launch.
- **Done when:** Sensitive routes are protected, critical actions are traceable, and the app can be deployed with documented environment variables.
- **Verification:**
  ```bash
  npm run lint
  npm run typecheck
  npm run test
  npm run test:e2e
  ```
- **Risk / notes:** Do not defer secret handling or auditability until after sending is live.

---

## Stage gates

Stage 1 is complete when:

- The app is scaffolded.
- The schema exists.
- Core planning artifacts needed to continue safely have been started.
- Local quality commands run successfully.

Stage 2 is complete when:

- The shell and route structure match the mockup closely.
- Shared primitives are stable enough to stop rewriting basic UI.

Stage 3 is complete when:

- CSV upload, review, save, contacts index, and contact editing work end to end.

Stage 4 is complete when:

- Lists are usable as the canonical segmentation unit for campaigns.

Stage 5 is complete when:

- A campaign can be drafted, generated, reviewed, and approved with real persisted data.

Stage 6 is complete when:

- A campaign can actually send through SMTP with pacing, limits, and accurate status updates.

Stage 7 is complete when:

- Reports, notifications, error states, auth, and deployment readiness are in place for MVP use.

---

## Completion rule

A task can move from `- [ ]` to `- [x]` only when:

- The implementation is complete.
- The listed verification has been run.
- Any failing or deferred edge case is documented.
- The repository remains in a working state after the change.

The main objective is complete only when:

- This file no longer contains unchecked MVP tasks.
- Any remaining work is explicitly labeled post-MVP.
- The application behavior matches the implemented interpretation of `MailWaveMockup.html` and `PRD.md`.
