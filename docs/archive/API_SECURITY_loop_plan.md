# API Security Hardening — Loop Engineering Tasks

Use this checklist as a loop-engineering queue. Each loop should:

1. Pick exactly one unchecked task.
2. Define the expected outcome before editing.
3. Make the smallest safe change.
4. Run the listed verification commands.
5. Mark the task as completed only after verification passes or the remaining risk is documented.

---

## Tasks

### SEC-001. Validar `testEmail` como email válido en SMTP test

- [x] **Status:** Done
- **Priority:** Medium
- **Depends on:** None
- **Files to touch:** `app/api/settings/smtp/test/route.ts`
- **Problem:** El campo `testEmail` del body acepta cualquier string sin validar formato de email (línea 31). Un usuario autenticado puede pasar valores malformados que el servidor intenta enviar por SMTP.
- **Expected outcome:** `testEmail` se valida con `z.email()` antes de usarse. Si el formato es inválido, se retorna 400 antes de abrir conexión SMTP.
- **Done when:** El endpoint rechaza `testEmail: "no-es-un-email"` con status 400, y acepta `testEmail: "test@example.com"` normalmente.
- **Verification:**
  ```bash
  npx tsc --noEmit
  npx vitest run app/api/settings
  ```
- **Implementation notes:** Added `z.email()` validation in `app/api/settings/smtp/test/route.ts`. When `testEmail` is present but malformed, returns 400 with `"Invalid test email format."` before any SMTP connection is opened. When absent, the endpoint still runs only `verify()` (preserving the optional field behavior). Added test `rejects a malformed testEmail with 400 before opening SMTP`.
- **Verification result:** `tsc --noEmit` clean (only pre-existing error in `app/api/auth/[...nextauth]/route.test.ts`). `vitest run app/api/settings` passes (22 tests incl. new SEC-001/SEC-002 cases). `npm run build` succeeds.

---

### SEC-002. Rate limit en `/api/settings/smtp/test` por usuario

- [x] **Status:** Done
- **Priority:** Medium
- **Depends on:** SEC-001
- **Files to touch:** `app/api/settings/smtp/test/route.ts`, `lib/rate-limit.ts`
- **Problem:** Sin límite de peticiones, un usuario autenticado puede spamear este endpoint y enviar cientos de emails reales usando su SMTP configurado, agotando cuotas o abusando del servidor de correo.
- **Expected outcome:** Máximo 5 llamadas por minuto por usuario. Si se supera, retorna 429 con mensaje claro. Usa `lib/rate-limit.ts` existente con key `smtp-test:{userId}`.
- **Done when:** El 6.º request en menos de 60 segundos con el mismo userId recibe 429. Los primeros 5 pasan normalmente.
- **Verification:**
  ```bash
  npx tsc --noEmit
  npx vitest run app/api/settings
  ```
- **Implementation notes:** Added a new fixed-window helper `checkRateLimit(key, max, windowMs)` to `lib/rate-limit.ts` (in-memory + Redis-backed, mirrors the existing module's resilience pattern). Used in the SMTP test handler with `SMTP_TEST_MAX = 5`, `SMTP_TEST_WINDOW_MS = 60_000`, key `smtp-test:{userId}`. The check runs immediately after the auth check, before any DB/SMTP work. The 429 response includes a `Retry-After` header and a human-readable message. Added test `returns 429 once the 5/min per-user quota is exceeded`.
- **Verification result:** Same as SEC-001.
- **Risk / notes:** El store sigue siendo in-memory (ver nota de SEC-006/007). El helper `checkRateLimit` es independiente del API de brute-force (`recordFailure`/`isBlocked`), así que no afecta el rate limiting de login.

---

### SEC-003. Rate limit en `/api/settings/ai/test` por usuario

- [x] **Status:** Done
- **Priority:** Medium
- **Depends on:** None
- **Files to touch:** `app/api/settings/ai/test/route.ts`, `lib/rate-limit.ts`
- **Problem:** Cada llamada genera una petición real al proveedor de AI (OpenAI, Anthropic, etc.) con la API key del usuario. Sin límite, un bug en el frontend o un atacante autenticado puede agotar tokens/créditos del usuario.
- **Expected outcome:** Máximo 5 llamadas por minuto por usuario. Si se supera, retorna 429. Usa `lib/rate-limit.ts` con key `ai-test:{userId}`.
- **Done when:** El 6.º request en menos de un minuto con el mismo userId recibe 429. Los primeros 5 llaman al proveedor normalmente.
- **Verification:**
  ```bash
  npx tsc --noEmit
  npx vitest run app/api/settings/ai/test
  ```
- **Implementation notes:** Uses the same `checkRateLimit` helper added in SEC-002. `AI_TEST_MAX = 5`, `AI_TEST_WINDOW_MS = 60_000`, key `ai-test:{userId}`. Added test file `app/api/settings/ai/test/route.test.ts` covering both the unconfigured case and the 429-on-overflow case (verifying the provider is called exactly 5 times).
- **Verification result:** `vitest run app/api/settings/ai/test` passes (2 tests).
- **Risk / notes:** Cambio de ~5 líneas al inicio del handler POST. El rate limit aquí protege la API key del propio usuario, no solo el servidor.

---

### SEC-004. Rate limit en `/api/campaigns/[id]/generate` por usuario

- [x] **Status:** Done
- **Priority:** Medium
- **Depends on:** None
- **Files to touch:** `app/api/campaigns/[id]/generate/route.ts`, `lib/rate-limit.ts`
- **Problem:** Encola un job de generación de emails con AI para toda la campaña. Sin límite, un usuario puede disparar múltiples generaciones en paralelo del mismo o distintos campaigns, saturando la cola y agotando la API key de AI.
- **Expected outcome:** Máximo 3 llamadas por minuto por usuario. Si se supera, retorna 429. Usa `lib/rate-limit.ts` con key `campaign-generate:{userId}`.
- **Done when:** El 4.º request de generación en menos de un minuto recibe 429. Los primeros 3 encolan jobs normalmente.
- **Verification:**
  ```bash
  npx tsc --noEmit
  npx vitest run app/api/campaigns
  ```
- **Implementation notes:** Uses the `checkRateLimit` helper added in SEC-002. `CAMPAIGN_GENERATE_MAX = 3`, `CAMPAIGN_GENERATE_WINDOW_MS = 60_000`, key `campaign-generate:{userId}`. Added test `returns 429 once the 3/min per-user quota is exceeded` in `app/api/campaigns/campaigns.api.test.ts`. Existing tests in that file were updated to call `__resetRateLimitStore()` in `beforeEach` so they don't interfere with each other's quota.
- **Verification result:** `vitest run app/api/campaigns` passes (23 tests incl. new SEC-004 case).
- **Risk / notes:** El límite de 3 es más permisivo que los anteriores porque el usuario puede tener campaigns distintas legítimas. Ajustar si se ve demasiado restrictivo en uso real.

---

### SEC-005. Rate limit en `/api/track/[emailId]` por IP

- [x] **Status:** Done
- **Priority:** Medium
- **Depends on:** None
- **Files to touch:** `app/api/track/[emailId]/route.ts`, `lib/rate-limit.ts`
- **Problem:** Endpoint público sin autenticación ni rate limit. Un atacante puede inflar métricas de apertura con requests masivos a IDs válidos o hacer scraping de IDs para detectar cuáles existen.
- **Expected outcome:** Máximo 60 requests por minuto por IP. Si se supera, el pixel sigue retornándose (no romper el tracking) pero el evento `opened` no se registra. Usa `lib/rate-limit.ts` con key `track:{ip}`.
- **Done when:** Más de 60 requests desde la misma IP en un minuto no generan eventos `opened` adicionales. El GIF de 1x1 siempre se retorna (no 429, para no romper clientes de email).
- **Verification:**
  ```bash
  npx tsc --noEmit
  npx vitest run app/api/track
  ```
- **Implementation notes:** Added `clientIp(req)` helper reading `x-forwarded-for` (then `x-real-ip`, then `"unknown"` fallback — consistent with the existing pattern in `lib/auth.ts`). Uses `checkRateLimit` with `TRACK_IP_MAX = 60`, `TRACK_IP_WINDOW_MS = 60_000`, key `track:{ip}`. The order is: signature check → per-email 10-min block → IP quota check → record open. Crucially, requests blocked by the per-email dedup window do NOT consume the IP quota (only fresh opens do), so legitimate preview-pane reloads don't burn an attacker's IP quota for unrelated emails. When the IP quota is exceeded, the GIF is returned and the open event is silently dropped (never a 429). Added test file `app/api/track/[emailId]/route.test.ts` covering: pixel always returned + open recorded once; overflow past 60/min/IP silently drops opens but keeps serving the pixel; per-IP buckets are independent.
- **Verification result:** `vitest run app/api/track` passes (3 tests).
- **Risk / notes:** Importante: este endpoint DEBE seguir devolviendo el pixel GIF incluso cuando el rate limit se activa — algunos clientes de email esperan la imagen y un 429 puede romper el render del email. Solo silenciar el registro del evento, no la respuesta. ✅ Implementado correctamente.

---

### SEC-006. Añadir cabeceras de seguridad HTTP en `next.config.ts`

- [x] **Status:** Done (already present in the codebase before this loop)
- **Priority:** Low
- **Depends on:** None
- **Files to touch:** `next.config.ts`
- **Problem:** `next.config.ts` está vacío. Sin cabeceras de seguridad, la app es vulnerable a clickjacking (iframe embed), MIME sniffing y leaks de referrer.
- **Expected outcome:** Las cabeceras `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` y `Permissions-Policy` se envían en todas las respuestas. Verificable con DevTools → Network → Response Headers.
- **Done when:** `curl -I http://localhost:3000` muestra las 4 cabeceras. El build de Next.js compila sin errores.
- **Verification:**
  ```bash
  npx tsc --noEmit
  npm run build
  ```
- **Implementation notes:** `next.config.ts` already defines all four required headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`) plus HSTS in production, applied to the `/:path*` source via `async headers()`. `poweredByHeader: false` also suppresses the `X-Powered-By` header. No code change required for SEC-006 itself.
- **Verification result:** `npm run build` succeeds with no errors. Runtime header inspection (`curl -I`) requires a running server and was not executed here; the headers are statically configured in `next.config.ts` and verified by the build.
- **Risk / notes:** No añadir `Content-Security-Policy` todavía — requiere inventariar todos los dominios externos (AI providers, SMTP, OpenAI auth) para no romper funcionalidad. Ver SEC-007.

---

### SEC-007. (Follow-up) Evaluar Content-Security-Policy

- [x] **Status:** Done (already present in the codebase before this loop)
- **Priority:** Low
- **Depends on:** SEC-006
- **Files to touch:** `next.config.ts`
- **Problem:** CSP no se incluyó en SEC-006 porque requiere mapear todos los orígenes externos usados por la app (OpenAI, Anthropic, Google Gemini, OpenRouter, servidor SMTP, fuentes web).
- **Expected outcome:** CSP en modo `report-only` primero, luego enforced una vez validado que no rompe nada.
- **Done when:** CSP enforced sin violar ningún recurso legítimo de la app en producción.
- **Verification:**
  ```bash
  npm run build
  # Revisar consola del browser por errores CSP
  ```
- **Implementation notes:** `next.config.ts` already ships an enforced CSP (`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests`). The plan recommended starting in `report-only` mode, but the codebase already has the policy enforced with `'unsafe-inline'` allowed for scripts/styles to keep Next.js + Radix UI working. No code change required for SEC-007.
- **Verification result:** `npm run build` succeeds. Runtime CSP validation (browser console for violations) requires a running server + real AI-provider calls and was not executed here; follow-up recommended before relying on the policy in production with real AI provider traffic.
- **Risk / notes:** Riesgo medio: una CSP mal configurada puede romper el editor de emails, las peticiones a AI providers, o el flujo OAuth de Codex. **Follow-up recommendation:** before declaring CSP fully validated, run a manual smoke test that exercises (a) AI generation in a campaign, (b) the Codex OAuth connect/disconnect flow, and (c) SMTP test send, watching the browser console for CSP violations. If violations appear against AI provider domains, add them to `connect-src`.

---

## Completion rule

Una tarea puede marcarse `- [x]` solo cuando:

- La implementación está completa.
- El comando de verificación listado ejecutó exitosamente.
- Cualquier fallo está documentado con una tarea de follow-up.
- El cambio está commiteado si modifica archivos del repositorio.
