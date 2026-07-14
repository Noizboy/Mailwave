# Email Open Tracking Improvements — Loop Engineering Tasks

Use this checklist as a loop-engineering queue. Each loop should:

1. Pick exactly one unchecked task.
2. Define the expected outcome before editing.
3. Make the smallest safe change.
4. Run the listed verification commands.
5. Mark the task as completed only after verification passes or the remaining risk is documented.

---

## Tasks

### TRACK-001. Guardar IP y UA en metadata de DeliveryEvent (opened)

- [x] **Status:** Completed
- **Priority:** High
- **Depends on:** None
- **Files to touch:** `app/api/track/[emailId]/route.ts`
- **Problem:** Los eventos `opened` no guardan ningún contexto (IP ni User-Agent). Esto hace imposible el filtrado retrospectivo cuando se añaden nuevas reglas de proxies.
- **Expected outcome:** Cada `DeliveryEvent` de tipo `opened` persiste `{ ip, ua }` en el campo `metadata Json?` que ya existe en el schema.
- **Done when:** Tests pasan y el campo `metadata` se escribe en el create de `deliveryEvent`.
- **Verification:**
  ```bash
  npx vitest run app/api/track
  npm run typecheck
  ```
- **Risk / notes:** El campo `metadata` ya existe en el schema — no requiere migración. El IP puede ser `"unknown"` en dev local sin proxy.

---

### TRACK-002. Bloquear Apple Mail Privacy Protection (17.0.0.0/8)

- [x] **Status:** Completed
- **Priority:** High
- **Depends on:** TRACK-001
- **Files to touch:** `app/api/track/[emailId]/route.ts`, `app/api/track/[emailId]/route.test.ts`
- **Problem:** Desde iOS 15 / macOS 12, Apple prefetchea todos los píxeles de tracking a través de sus servidores relay (rango `17.0.0.0/8`) antes de que el usuario abra el email. El UA es Safari genérico e indistinguible de un humano, y el tiempo de disparo puede ser mayor a 15s, por lo que el umbral actual no lo filtra. Esto infla artificialmente la tasa de apertura de todos los destinatarios con Apple Mail.
- **Expected outcome:** Las peticiones cuya IP pertenece a `17.0.0.0/8` son descartadas antes de escribir en la DB (pixel siempre se devuelve). Se añade un test específico para este bloqueo.
- **Done when:** Test de Apple MPP pasa; `prisma.deliveryEvent.create` no se llama para IPs `17.x.x.x`.
- **Verification:**
  ```bash
  npx vitest run app/api/track
  npm run typecheck
  ```
- **Risk / notes:** Apple es el propietario exclusivo del rango `17.0.0.0/8` (IANA). El bloqueo no afecta a usuarios reales que abran el email desde un navegador o cliente distinto.

---

### TRACK-003. Ampliar lista de User-Agents de proxies/scanners conocidos

- [x] **Status:** Completed
- **Priority:** Medium
- **Depends on:** None
- **Files to touch:** `app/api/track/[emailId]/route.ts`, `app/api/track/[emailId]/route.test.ts`
- **Problem:** La lista actual cubre Gmail, Yahoo, MS Office, msfetch, Proofpoint, Barracuda, Mimecast y ProtonMail. Faltan scanners corporativos comunes: Cisco IronPort, Sophos, Forcepoint, Abnormal Security, AppRiver y Cloudflare Email Security.
- **Expected outcome:** Los nuevos UAs se añaden a `EMAIL_PROXY_UA` y cada uno tiene al menos un test en el describe de UAs de proxy.
- **Done when:** Tests de proxy UAs ampliadosolean pasan; ninguno de los nuevos UAs escribe en la DB.
- **Verification:**
  ```bash
  npx vitest run app/api/track
  npm run typecheck
  ```
- **Risk / notes:** Usar solo prefijos suficientemente específicos para evitar falsos positivos (ej. `IronPort` no colisiona con UAs legítimos).

---

### TRACK-004. Dedup por (emailId, IP) en ventana de 60 s

- [x] **Status:** Completed
- **Priority:** Medium
- **Depends on:** TRACK-001
- **Files to touch:** `app/api/track/[emailId]/route.ts`, `app/api/track/[emailId]/route.test.ts`, `lib/rate-limit.ts`
- **Problem:** Un proveedor de seguridad que use múltiples IPs relay para el mismo escaneo (ej. Proofpoint Enterprise multi-nodo, Mimecast con varios egress nodes) puede registrar múltiples eventos `opened` para el mismo email desde IPs distintas. El rate-limit actual es solo por IP globalmente, no por `(emailId, IP)`.
- **Expected outcome:** Se añade un rate-limit `track:email:{emailId}:{ip}` con ventana de 60 s y límite 1. Solo el primer hit de cada IP para un email dado registra el evento; los posteriores devuelven pixel sin escribir en DB.
- **Done when:** Test con la misma IP abriendo el mismo email dos veces en < 60s solo registra 1 evento. Test con IP diferente sí registra.
- **Verification:**
  ```bash
  npx vitest run app/api/track
  npm run typecheck
  ```
- **Risk / notes:** Este rate-limit es adicional al global de IP (SEC-005). No reemplaza la dedup por emailId a nivel de query time en la API de emails.

---

## Completion rule

Un task puede cambiar de `- [ ]` a `- [x]` solo cuando:

- La implementación está completa.
- El comando de verificación listado ha corrido exitosamente.
- Cualquier fallo está documentado con un follow-up task.
- El cambio está commiteado si modifica archivos del repositorio.
