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

- [ ] **Status:** Pending
- **Priority:** Medium
- **Depends on:** None
- **Files to touch:** `app/api/settings/smtp/test/route.ts`
- **Problem:** El campo `testEmail` del body acepta cualquier string sin validar formato de email (línea 31). Un usuario autenticado puede pasar valores malformados que el servidor intenta enviar por SMTP.
- **Expected outcome:** `testEmail` se valida con `z.email()` antes de usarse. Si el formato es inválido, se retorna 400 antes de abrir conexión SMTP.
- **Done when:** El endpoint rechaza `testEmail: "no-es-un-email"` con status 400, y acepta `testEmail: "test@example.com"` normalmente.
- **Verification:**
  ```bash
  npx tsc --noEmit
  npx jest app/api/settings
  ```
- **Risk / notes:** Cambio de 4-5 líneas. No afecta el happy path. El campo es opcional — si no se pasa `testEmail`, el endpoint sigue haciendo solo `verify()`.

---

### SEC-002. Rate limit en `/api/settings/smtp/test` por usuario

- [ ] **Status:** Pending
- **Priority:** Medium
- **Depends on:** SEC-001
- **Files to touch:** `app/api/settings/smtp/test/route.ts`
- **Problem:** Sin límite de peticiones, un usuario autenticado puede spamear este endpoint y enviar cientos de emails reales usando su SMTP configurado, agotando cuotas o abusando del servidor de correo.
- **Expected outcome:** Máximo 5 llamadas por minuto por usuario. Si se supera, retorna 429 con mensaje claro. Usa `lib/rate-limit.ts` existente con key `smtp-test:{userId}`.
- **Done when:** El 6.º request en menos de 60 segundos con el mismo userId recibe 429. Los primeros 5 pasan normalmente.
- **Verification:**
  ```bash
  npx tsc --noEmit
  npx jest app/api/settings
  ```
- **Risk / notes:** `lib/rate-limit.ts` usa `MAX_FAILURES = 5` y `BLOCK_MS = 15 min` originalmente para login. Considera ajustar los parámetros o crear una función auxiliar con ventana de 1 min para este caso de uso. El store es in-memory (ver SEC-006).

---

### SEC-003. Rate limit en `/api/settings/ai/test` por usuario

- [ ] **Status:** Pending
- **Priority:** Medium
- **Depends on:** None
- **Files to touch:** `app/api/settings/ai/test/route.ts`
- **Problem:** Cada llamada genera una petición real al proveedor de AI (OpenAI, Anthropic, etc.) con la API key del usuario. Sin límite, un bug en el frontend o un atacante autenticado puede agotar tokens/créditos del usuario.
- **Expected outcome:** Máximo 5 llamadas por minuto por usuario. Si se supera, retorna 429. Usa `lib/rate-limit.ts` con key `ai-test:{userId}`.
- **Done when:** El 6.º request en menos de un minuto con el mismo userId recibe 429. Los primeros 5 llaman al proveedor normalmente.
- **Verification:**
  ```bash
  npx tsc --noEmit
  npx jest app/api/settings
  ```
- **Risk / notes:** Cambio de ~5 líneas al inicio del handler POST. El rate limit aquí protege la API key del propio usuario, no solo el servidor.

---

### SEC-004. Rate limit en `/api/campaigns/[id]/generate` por usuario

- [ ] **Status:** Pending
- **Priority:** Medium
- **Depends on:** None
- **Files to touch:** `app/api/campaigns/[id]/generate/route.ts`
- **Problem:** Encola un job de generación de emails con AI para toda la campaña. Sin límite, un usuario puede disparar múltiples generaciones en paralelo del mismo o distintos campaigns, saturando la cola y agotando la API key de AI.
- **Expected outcome:** Máximo 3 llamadas por minuto por usuario. Si se supera, retorna 429. Usa `lib/rate-limit.ts` con key `campaign-generate:{userId}`.
- **Done when:** El 4.º request de generación en menos de un minuto recibe 429. Los primeros 3 encolan jobs normalmente.
- **Verification:**
  ```bash
  npx tsc --noEmit
  npx jest app/api/campaigns
  ```
- **Risk / notes:** El límite de 3 es más permisivo que los anteriores porque el usuario puede tener campaigns distintas legítimas. Ajustar si se ve demasiado restrictivo en uso real.

---

### SEC-005. Rate limit en `/api/track/[emailId]` por IP

- [ ] **Status:** Pending
- **Priority:** Medium
- **Depends on:** None
- **Files to touch:** `app/api/track/[emailId]/route.ts`
- **Problem:** Endpoint público sin autenticación ni rate limit. Un atacante puede inflar métricas de apertura con requests masivos a IDs válidos o hacer scraping de IDs para detectar cuáles existen.
- **Expected outcome:** Máximo 60 requests por minuto por IP. Si se supera, el pixel sigue retornándose (no romper el tracking) pero el evento `opened` no se registra. Usa `lib/rate-limit.ts` con key `track:{ip}`.
- **Done when:** Más de 60 requests desde la misma IP en un minuto no generan eventos `opened` adicionales. El GIF de 1x1 siempre se retorna (no 429, para no romper clientes de email).
- **Verification:**
  ```bash
  npx tsc --noEmit
  npx jest app/api
  ```
- **Risk / notes:** Importante: este endpoint DEBE seguir devolviendo el pixel GIF incluso cuando el rate limit se activa — algunos clientes de email esperan la imagen y un 429 puede romper el render del email. Solo silenciar el registro del evento, no la respuesta.

---

### SEC-006. Añadir cabeceras de seguridad HTTP en `next.config.ts`

- [ ] **Status:** Pending
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
  # Luego en otra terminal:
  curl -I http://localhost:3000 | grep -E "X-Frame|X-Content|Referrer|Permissions"
  ```
- **Risk / notes:** No añadir `Content-Security-Policy` todavía — requiere inventariar todos los dominios externos (AI providers, SMTP, OpenAI auth) para no romper funcionalidad. Crear tarea SEC-007 si se quiere abordar CSP después.

---

### SEC-007. (Follow-up) Evaluar Content-Security-Policy

- [ ] **Status:** Pending
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
- **Risk / notes:** Riesgo medio: una CSP mal configurada puede romper el editor de emails, las peticiones a AI providers, o el flujo OAuth de Codex. Probar exhaustivamente antes de enforced.

---

## Completion rule

Una tarea puede marcarse `- [x]` solo cuando:

- La implementación está completa.
- El comando de verificación listado ejecutó exitosamente.
- Cualquier fallo está documentado con una tarea de follow-up.
- El cambio está commiteado si modifica archivos del repositorio.
