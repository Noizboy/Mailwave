# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Mailwave is an AI-assisted cold-email platform: import contacts, build campaigns, generate personalized emails with an LLM, review/approve them, and send at scale over SMTP. It's a Next.js 16 (App Router) + React 19 app backed by PostgreSQL (Prisma) and Redis (BullMQ), with a **separate background worker process** that does all AI generation and email sending.

## Commands

```bash
npm run dev              # start Next.js dev server (http://localhost:3001)
npm run worker           # start the BullMQ worker — REQUIRED for generation/sending to run
npm run build            # production build
npm run lint             # eslint
npm run typecheck        # tsc --noEmit — run this after non-trivial TS changes
npm run test             # vitest run (unit + component)
npm run test:watch       # vitest watch mode
npm run test:e2e         # playwright e2e (needs the app running)

# Run a single test file / filter by name:
npx vitest run lib/crypto.test.ts
npx vitest run -t "returns 401 when unauthenticated"

# Database (Prisma):
npm run prisma:generate  # regenerate client — MUST run after editing schema.prisma
npm run prisma:push      # push schema to DB (no migration files)
npm run prisma:migrate   # create + apply a dev migration
npm run prisma:studio
npm run seed             # idempotent seed → demo@mailwave.app / password123

npm run rotate-key       # re-encrypt secrets after changing ENCRYPTION_KEY (set OLD_ENCRYPTION_KEY)
```

Local dev needs Postgres + Redis running. Required env vars: `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY` (32+ chars), `NEXTAUTH_URL`. See `.env.example`. For a full Docker install use `docker compose up -d --build` with `docker-compose.yml`.

## Architecture

**Two-process model.** The Next.js app never generates or sends email directly — it enqueues BullMQ jobs and the standalone worker (`jobs/worker.ts`, run via `npm run worker`) consumes them. If generation or sending "does nothing," the worker probably isn't running. Queues live in `lib/jobs/queue.ts` (`campaign-generate`, `campaign-send`, `suppress-contacts`, `daily-digest`); job processors are in `lib/jobs/*`.

**Campaign lifecycle** (status enum in `prisma/schema.prisma`):
`pending → generating → pending_review → ready_to_send → sending → paused/completed/failed`.
1. **Generate** (`lib/jobs/generate-campaign.ts`): pulls subscribed contacts from the campaign's list, builds prompts, calls the AI provider per contact, writes `CampaignEmail` rows, moves campaign to `pending_review`.
2. **Review**: user approves/edits/regenerates/skips emails via the API; `CampaignEmail.approvalStatus` gates what gets sent.
3. **Send** (`lib/jobs/send-campaign.ts`): sends approved emails over SMTP (nodemailer) with per-user hourly/daily limits, configurable send intervals, per-contact suppression, and an open-tracking pixel.

**Send worker concurrency/idempotency is subtle** — read `send-campaign.ts` before touching it. Key mechanics: `concurrency: 1` (serial per account); a campaign is claimed via `activeSendRunId` so only one run owns it (stale runs no-op); rate limits are computed by counting `DeliveryEvent` rows in the trailing hour/day; when a limit is hit the job re-enqueues itself with a computed `delay` and stops; `nextSendAt` drives the pacing between sends; contact send counts increment DB-side (`{ increment: 1 }`) and auto-suppress at the threshold to stay correct under concurrency.

**AI abstraction** (`lib/ai.ts`): Anthropic uses the native `@anthropic-ai/sdk`; **all other providers (OpenAI, OpenRouter, Google Gemini, custom) go through the OpenAI-compatible client** with a per-provider `baseUrl`. `buildSystemPrompt`/`buildUserPrompt` assemble the prompt; the model is expected to return strict JSON (`subject`/`body`/`personalizationNotes`), with a fallback if parsing fails. `google_gemini`/`openrouter` base URLs and default models are tables at the top of the file.

**Auth** (`lib/auth.ts`): NextAuth v5 (beta) Credentials provider, JWT sessions, bcrypt hashes. Login is rate-limited by a composite IP + account key (`lib/rate-limit.ts`). There is **no middleware** — API routes enforce auth inline with `const session = await auth(); if (!session?.user?.id) return 401`, and server components use `requireSession()` from `lib/session.ts` (redirects to `/login`).

**Multi-tenancy**: every domain row belongs to a `User`. **Always scope Prisma queries by `userId`** (`where: { userId: session.user.id }` or `findFirst`) — this is the primary authorization boundary; forgetting it leaks another user's data.

**Secrets at rest** (`lib/crypto.ts`): SMTP passwords, AI API keys, and OAuth tokens are AES-256-GCM encrypted before storage (columns are prefixed `encrypted*`). `ENCRYPTION_KEY` must be ≥32 chars and known placeholders are rejected at runtime. Changing the key makes existing ciphertext unrecoverable unless you run `npm run rotate-key`.

**SSRF protection** (`lib/ssrf.ts`): any user-supplied outbound host (SMTP host, AI base URL) must pass `assertSafeHost`, which resolves DNS and rejects private/loopback/link-local/metadata ranges. Use it whenever you add a feature that connects to a user-provided host.

**Data layer**: Prisma client is generated to **`app/generated/prisma`** (not the default `node_modules` location) and imported via `@/lib/prisma`; it uses the `@prisma/adapter-pg` driver adapter. Regenerate (`npm run prisma:generate`) after any `schema.prisma` change or imports/types will be stale.

**Frontend**: App Router with route groups `app/(auth)` and `app/(dashboard)`. Pages are largely thin server components rendering a `*-client.tsx` component that fetches from the API via TanStack Query. UI is shadcn/ui + Radix primitives in `components/ui/*`, with shared patterns in `components/shared/*` and `components/layout/*`; Tailwind v4 tokens live in `app/globals.css`.

## Conventions

- **Path alias**: `@/*` maps to the repo root (both `tsconfig.json` and `vitest.config.ts`).
- **API route tests** run in the Node environment — start the file with `// @vitest-environment node` (jsdom is the default for component tests). Use the helpers in `test/api-helpers.ts` (`mockSession`, `jsonRequest`, `routeParams`) and the manual mocks in `lib/__mocks__` (`vi.mock("@/lib/auth")`, `vi.mock("@/lib/prisma")` — the Prisma mock auto-stubs any `prisma.model.method`). Note route-handler `context.params` is a `Promise` in this Next.js version.
- **Security finding codes** (`CN-###`, `SEC-###`, `NOTIF-###`, `CWE-###`) appear in code comments and test names — they trace back to specific hardening decisions; preserve the behavior and the reference when editing nearby code.
- API routes that touch the DB/queues declare `export const runtime = "nodejs"` and validate input with `zod`.

---

## Working Guidelines

Behavioral guidelines to reduce common LLM coding mistakes.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
