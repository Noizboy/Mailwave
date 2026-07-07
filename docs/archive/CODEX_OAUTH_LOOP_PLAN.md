# Codex OAuth Loop Engineering Tasks

Use this checklist as a loop-engineering queue. Each loop should:

1. Pick exactly one unchecked task.
2. Define the expected outcome before editing.
3. Make the smallest safe change.
4. Run the listed verification commands.
5. Mark the task as completed only after verification passes or the remaining risk is documented.

---

## Tasks

### CODEX-001. Add `codex` to AiProvider enum and OAuth fields to AiConfig

- [x] **Status:** Done
- **Priority:** High
- **Depends on:** None
- **Files to touch:** `prisma/schema.prisma`
- **Problem:** The `AiProvider` enum has no `codex` value, and `AiConfig` has no fields for storing OAuth tokens.
- **Expected outcome:** Schema updated with `codex` enum value and four new OAuth fields on `AiConfig`. Migration created and applied.
- **Done when:** `npx prisma migrate dev` exits 0 and `npx prisma generate` regenerates the client without errors.
- **Verification:**
  ```bash
  npx prisma migrate dev --name add_codex_oauth
  npx prisma generate
  npx tsc --noEmit
  ```
- **Risk / notes:**
  - Add to `AiProvider` enum: `codex`
  - Add to `AiConfig` model:
    ```prisma
    oauthAccessToken  String?
    oauthRefreshToken String?
    oauthExpiresAt    DateTime?
    oauthConnected    Boolean   @default(false)
    ```
  - Existing rows get `oauthConnected = false` by default â€” safe migration.

---

### CODEX-002. Add env vars for OpenAI OAuth App

- [x] **Status:** Done
- **Priority:** High
- **Depends on:** None
- **Files to touch:** `.env`, `.env.example`
- **Problem:** No `OPENAI_CLIENT_ID` or `OPENAI_CLIENT_SECRET` exist. The OAuth routes need them.
- **Expected outcome:** Both vars present in `.env` (real values) and `.env.example` (placeholder). `NEXTAUTH_URL` already exists and doubles as the base for the redirect URI.
- **Done when:** Running `node -e "require('dotenv').config(); console.log(process.env.OPENAI_CLIENT_ID)"` prints the client ID.
- **Verification:**
  ```bash
  node -e "require('dotenv').config(); const v = process.env.OPENAI_CLIENT_ID; process.exit(v ? 0 : 1)"
  node -e "require('dotenv').config(); const v = process.env.OPENAI_CLIENT_SECRET; process.exit(v ? 0 : 1)"
  ```
- **Risk / notes:**
  - Register the OAuth App at `https://platform.openai.com/` â†’ OAuth Apps.
  - Set redirect URI to `{NEXTAUTH_URL}/api/settings/ai/codex/callback`.
  - Never commit `.env` â€” `.env.example` only.

---

### CODEX-003. `GET /api/settings/ai/codex/connect` â€” initiate OAuth with PKCE

- [x] **Status:** Done
- **Priority:** High
- **Depends on:** CODEX-002
- **Files to touch:** `app/api/settings/ai/codex/connect/route.ts` *(new)*
- **Problem:** No entry point exists to start the OpenAI OAuth flow.
- **Expected outcome:** A GET handler that generates a PKCE `code_verifier` + `code_challenge`, stores `state` and `code_verifier` in a signed HttpOnly cookie (max-age 10 min), and redirects to the OpenAI authorization URL.
- **Done when:** Visiting `/api/settings/ai/codex/connect` while logged in redirects the browser to `https://auth.openai.com/authorize?...` with correct params.
- **Verification:**
  ```bash
  npx tsc --noEmit
  # Manual: visit http://localhost:3001/api/settings/ai/codex/connect in browser
  # Expect: redirect to OpenAI with client_id, redirect_uri, response_type=code,
  #         code_challenge, code_challenge_method=S256, state params present
  ```
- **Risk / notes:**
  - PKCE: `code_verifier` = `crypto.randomBytes(32).toString('base64url')`, `code_challenge` = `createHash('sha256').update(verifier).digest('base64url')`.
  - `state` = `crypto.randomBytes(16).toString('hex')`.
  - Cookie name: `codex_oauth_state`; value: `${state}:${code_verifier}`; `HttpOnly; Secure; SameSite=Lax; Path=/`.
  - Route must have `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"`.
  - Confirm exact OpenAI authorize URL at implementation time â€” likely `https://auth.openai.com/authorize`.

---

### CODEX-004. `GET /api/settings/ai/codex/callback` â€” exchange code for tokens

- [x] **Status:** Done
- **Priority:** High
- **Depends on:** CODEX-003, CODEX-001
- **Files to touch:** `app/api/settings/ai/codex/callback/route.ts` *(new)*
- **Problem:** No handler exists to receive the OAuth callback, validate state, and store tokens.
- **Expected outcome:** Handler validates `state` against cookie, exchanges `code` for `access_token` + `refresh_token`, encrypts both with `encrypt()`, upserts `AiConfig` with OAuth fields + `provider = "codex"` + `oauthConnected = true`, clears cookie, redirects to `/settings?tab=ai&codex=connected`.
- **Done when:** Full OAuth round-trip succeeds: connecting with a real OpenAI account lands on `/settings` with the toast query param, and `AiConfig` in DB has `oauthConnected = true`.
- **Verification:**
  ```bash
  npx tsc --noEmit
  # Manual: complete full OAuth flow end-to-end
  # DB check:
  # SELECT "oauthConnected", "oauthExpiresAt", provider FROM "AiConfig" WHERE "userId" = '<id>';
  ```
- **Risk / notes:**
  - On state mismatch: redirect to `/settings?tab=ai&codex=error`.
  - Token endpoint: `https://auth.openai.com/oauth/token` (POST, `grant_type=authorization_code`, include `code_verifier`).
  - Store `oauthExpiresAt = new Date(Date.now() + expires_in * 1000)`.
  - Clear `encryptedApiKey` when switching to OAuth â€” or keep both and let `getCodexToken` take precedence.
  - `export const runtime = "nodejs"`.

---

### CODEX-005. `POST /api/settings/ai/codex/disconnect` â€” revoke and clear tokens

- [x] **Status:** Done
- **Priority:** Medium
- **Depends on:** CODEX-004
- **Files to touch:** `app/api/settings/ai/codex/disconnect/route.ts` *(new)*
- **Problem:** No way for users to disconnect the Codex integration.
- **Expected outcome:** POST handler revokes the access token at OpenAI's revocation endpoint (best-effort), then sets `oauthConnected = false`, clears `oauthAccessToken`, `oauthRefreshToken`, `oauthExpiresAt`, and resets `provider` to `"openai"` in `AiConfig`.
- **Done when:** After POST, `AiConfig` in DB has `oauthConnected = false` and null OAuth fields.
- **Verification:**
  ```bash
  npx tsc --noEmit
  # Manual: disconnect from UI, check DB row
  ```
- **Risk / notes:**
  - Revocation endpoint: `https://auth.openai.com/oauth/revoke` (POST) â€” fire-and-forget; don't fail if revocation returns error.
  - `export const runtime = "nodejs"`.

---

### CODEX-006. Update `GET /api/settings/ai` to expose OAuth state

- [x] **Status:** Done
- **Priority:** High
- **Depends on:** CODEX-001
- **Files to touch:** `app/api/settings/ai/route.ts`
- **Problem:** The existing GET endpoint doesn't return `oauthConnected` or `oauthExpiresAt`, so the UI can't show connection state.
- **Expected outcome:** Response includes `oauthConnected` (bool) and `oauthExpiresAt` (ISO string or null). `encryptedApiKey` is still masked to `"â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"` when present.
- **Done when:** `curl -s /api/settings/ai` returns `"oauthConnected": true` for a connected account.
- **Verification:**
  ```bash
  npx tsc --noEmit
  npm test -- --testPathPattern="settings.api.test"
  ```
- **Risk / notes:** Surgical change â€” only add the two fields to the JSON response. Don't alter the PUT handler in this task.

---

### CODEX-007. `lib/ai.ts` â€” add `codex` provider + `getCodexToken` helper

- [x] **Status:** Done
- **Priority:** High
- **Depends on:** CODEX-001, CODEX-004
- **Files to touch:** `lib/ai.ts`
- **Problem:** `generateEmail()` has no branch for `codex`, and no helper exists to retrieve and auto-refresh the OAuth token.
- **Expected outcome:**
  - `codex` added to `AiProviderName` union and `DEFAULT_MODELS` (`"gpt-4o"`).
  - `getCodexToken(userId: string): Promise<string>` reads `AiConfig`, decrypts `oauthAccessToken`. If `oauthExpiresAt` is within 5 minutes, calls OpenAI token endpoint with `refresh_token`, encrypts new tokens, updates DB, returns fresh token.
  - `generateEmail()` when `provider === "codex"`: calls `getCodexToken(userId)` and uses it as `apiKey` with the standard OpenAI client (no `baseURL` needed).
- **Done when:** `npm test -- --testPathPattern="ai.test"` passes with a mocked codex token flow.
- **Verification:**
  ```bash
  npx tsc --noEmit
  npm test -- --testPathPattern="ai.test"
  ```
- **Risk / notes:**
  - `generateEmail` signature needs a new optional `userId?: string` param â€” only required when `provider === "codex"`.
  - Callers: `app/api/settings/ai/test/route.ts` and `lib/jobs/generate-campaign.ts` â€” update both call sites.
  - Token refresh is idempotent: if two requests race, the second write wins (safe for single-tenant).

---

### CODEX-008. Update `generate-campaign.ts` and `ai/test` call sites for `userId`

- [x] **Status:** Done
- **Priority:** High
- **Depends on:** CODEX-007
- **Files to touch:** `lib/jobs/generate-campaign.ts`, `app/api/settings/ai/test/route.ts`
- **Problem:** After CODEX-007 adds `userId` to `generateEmail`, existing call sites need updating.
- **Expected outcome:** Both callers pass `userId` when `provider === "codex"`. TypeScript compiles clean.
- **Done when:** `npx tsc --noEmit` exits 0 and existing tests still pass.
- **Verification:**
  ```bash
  npx tsc --noEmit
  npm test -- --testPathPattern="generate-campaign.test|ai.test"
  ```
- **Risk / notes:** Only add `userId` to the call when the provider is codex; other providers don't need it, so the change is minimal.

---

### CODEX-009. UI â€” provider cards for AI Integration tab

- [x] **Status:** Done
- **Priority:** High
- **Depends on:** CODEX-006, CODEX-005
- **Files to touch:** `components/settings/settings-client.tsx`
- **Problem:** The AI tab shows a single flat form. There's no "Connect with Codex" button or visual provider selection.
- **Expected outcome:** AI tab shows provider cards (like the SMTP tab's Gmail/Outlook/Custom cards):
  - **Codex (OpenAI OAuth)** card: "Connect with Codex" button â†’ `window.location.href = "/api/settings/ai/codex/connect"`.
  - When `oauthConnected === true`: show connected badge, expiry date, "Disconnect" button (calls `POST /api/settings/ai/codex/disconnect` then invalidates query).
  - **Other providers** (OpenAI, Anthropic, Gemini, OpenRouter, Custom): open existing API-key form in a Dialog (same pattern as SMTP provider cards).
- **Done when:** User can click "Connect with Codex", complete OAuth, return to Settings and see connected state â€” all without errors in console.
- **Verification:**
  ```bash
  npx tsc --noEmit
  # Manual: Settings â†’ AI Integration
  #   - Codex card visible
  #   - "Connect with Codex" redirects to OpenAI
  #   - After OAuth: connected badge shown, expiry date shown
  #   - "Disconnect" clears state and returns to card view
  ```
- **Risk / notes:**
  - Read `?codex=connected` from `useSearchParams()` on mount â†’ `toast.success(...)`.
  - Read `?codex=error` â†’ `toast.error(...)`.
  - Use `useRouter().replace('/settings?tab=ai')` after showing toast to clean the URL.

---

### CODEX-010. E2E smoke test â€” Codex OAuth flow

- [x] **Status:** Done
- **Priority:** Low
- **Depends on:** CODEX-009
- **Files to touch:** `app/api/settings/ai/codex/connect/route.test.ts` *(new)*, `app/api/settings/ai/codex/callback/route.test.ts` *(new)*
- **Problem:** No automated coverage for the OAuth routes.
- **Expected outcome:** Unit tests mock the OpenAI token endpoint and verify: (1) connect route sets cookie and builds correct authorization URL; (2) callback route with valid state + code saves encrypted tokens to DB and redirects correctly; (3) callback with invalid state redirects to error URL.
- **Done when:** `npm test -- --testPathPattern="codex"` passes.
- **Verification:**
  ```bash
  npm test -- --testPathPattern="codex"
  npx tsc --noEmit
  ```
- **Risk / notes:** Use `msw` or `jest.mock('node-fetch')` to intercept OpenAI token endpoint. Confirm test setup matches existing `*.api.test.ts` patterns in the repo.

---

## Completion rule

A task can be changed from `- [ ]` to `- [x]` only when:

- The implementation is complete.
- The listed verification command has been run and exited successfully.
- Any failure is documented with a follow-up task.
- The change is committed together with the updated task file.
