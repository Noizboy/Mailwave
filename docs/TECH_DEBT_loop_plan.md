# Technical Debt — Loop Engineering Tasks

Use this checklist as a loop-engineering queue. Each loop should:

1. Pick exactly one unchecked task.
2. Define the expected outcome before editing.
3. Make the smallest safe change.
4. Run the listed verification commands.
5. Mark the task as completed only after verification passes or the remaining risk is documented.

---

## Tasks

### TD-H1. N+1 en el send loop — mover counts de hourly/daily fuera del for

- [ ] **Status:** Pending
- **Priority:** High
- **Depends on:** None
- **Files to touch:** `lib/jobs/send-campaign.ts`
- **Problem:** `prisma.deliveryEvent.count` (hourly) y `prisma.deliveryEvent.count` (daily) se ejecutan dentro del `for` loop por cada email. 1000 destinatarios = 2000 queries de count adicionales por run.
- **Expected outcome:** Ambos counts se sacan antes del loop; se mantiene un contador local que se incrementa tras cada send exitoso.
- **Done when:** `typecheck` pasa; el loop solo hace los 2 counts una vez al inicio del run (y una vez más si se re-enqueue).
- **Verification:**
  ```bash
  npm run typecheck
  npx vitest run
  ```

---

### TD-H2. Unbounded findMany en export CSV

- [ ] **Status:** Pending
- **Priority:** High
- **Depends on:** None
- **Files to touch:** `app/api/reports/export/route.ts`
- **Problem:** `findMany` sin `take` — una cuenta con 100k emails carga todo en memoria.
- **Expected outcome:** Hard cap de 10 000 filas; si hay más, se incluye un header `X-Truncated: true` y la última fila del CSV indica el truncamiento.
- **Done when:** `typecheck` pasa; el query tiene `take: 10_000`.
- **Verification:**
  ```bash
  npm run typecheck
  ```

---

### TD-H3. Unbounded deliveryEvent.findMany en reports

- [ ] **Status:** Pending
- **Priority:** High
- **Depends on:** None
- **Files to touch:** `app/api/reports/route.ts`
- **Problem:** `deliveryEvent.findMany` sin límite carga todos los eventos de aperturas globalmente para calcular el open rate.
- **Expected outcome:** Reemplazar el fetch de eventos por un query a nivel de `CampaignEmail` que traiga solo los que tienen al menos un evento `opened` válido (con `deliveryEvents: { some: ... }`), más el primer evento por email para el filtro de 15s. Esto elimina el unbounded fetch.
- **Done when:** `typecheck` pasa; no hay `deliveryEvent.findMany` en el reports route.
- **Verification:**
  ```bash
  npm run typecheck
  ```

---

### TD-H4. N+1 en import/save — reemplazar upsert-por-fila con batch

- [ ] **Status:** Pending
- **Priority:** High
- **Depends on:** None
- **Files to touch:** `app/api/import/[id]/save/route.ts`
- **Problem:** `contact.upsert` + `listMember.upsert` por fila en un `for` loop. 10k contactos → 20k queries.
- **Expected outcome:** 4 queries totales: (1) findMany contacts existentes por email, (2) createMany contacts nuevos, (3) findMany contacts para obtener IDs, (4) createMany listMembers. Misma semántica de skip en duplicados/inválidos.
- **Done when:** `typecheck` pasa; no hay upserts dentro de un loop.
- **Verification:**
  ```bash
  npm run typecheck
  ```
- **Risk:** `createMany` usa `skipDuplicates: true`; el upsert actual hace `update: {}` (no-op), que es equivalente.

---

### TD-H5. Status gate mismatch — send route acepta pending_review pero worker lo rechaza

- [ ] **Status:** Pending
- **Priority:** High
- **Depends on:** None
- **Files to touch:** `app/api/campaigns/[id]/send/route.ts`
- **Problem:** El route permite `pending_review`, pero el worker solo acepta `ready_to_send | paused | sending` y devuelve `{ skipped: true }` silenciosamente. El usuario obtiene un 200 con `status: "queued"` pero el email nunca se envía.
- **Expected outcome:** Eliminar `pending_review` de los statuses permitidos en el route. El route devuelve 409 claro para ese estado.
- **Done when:** `typecheck` pasa; la lista de statuses aceptados coincide exactamente con los del worker.
- **Verification:**
  ```bash
  npm run typecheck
  ```

---

### TD-M1. Unsafe enum casts en query params de emails route

- [ ] **Status:** Pending
- **Priority:** Medium
- **Depends on:** None
- **Files to touch:** `app/api/campaigns/[id]/emails/route.ts`
- **Problem:** `approvalStatus` y `status` se castean con `as "pending" | ...` sin validación. Un valor inválido produce un error de runtime de Prisma en vez de un 400 limpio.
- **Expected outcome:** Validar ambos params con zod antes de pasarlos al query; devolver 400 si el valor no es válido.
- **Done when:** `typecheck` pasa.
- **Verification:**
  ```bash
  npm run typecheck
  ```

---

### TD-M2. perPage sin clamp en emails route

- [ ] **Status:** Pending
- **Priority:** Medium
- **Depends on:** None
- **Files to touch:** `app/api/campaigns/[id]/emails/route.ts`
- **Problem:** `perPage` no tiene clamping. Un cliente puede pedir `perPage=1000000`.
- **Expected outcome:** `perPage = Math.min(Math.max(1, perPage), 100)`.
- **Done when:** `typecheck` pasa.
- **Verification:**
  ```bash
  npm run typecheck
  ```

---

### TD-M3. PATCH campaign expone statuses peligrosos

- [ ] **Status:** Pending
- **Priority:** Medium
- **Depends on:** None
- **Files to touch:** `app/api/campaigns/[id]/route.ts`
- **Problem:** `patchSchema` incluye `sending` y `completed` en el enum de `status`, permitiendo que un cliente corrompa la máquina de estados sin pasar por la lógica del worker.
- **Expected outcome:** Restringir `status` en el PATCH a solo los estados que un usuario puede establecer manualmente: `pending`, `pending_review`, `ready_to_send`, `paused`.
- **Done when:** `typecheck` pasa.
- **Verification:**
  ```bash
  npm run typecheck
  ```

---

### TD-M4. Import/save — body sin validación zod

- [ ] **Status:** Pending
- **Priority:** Medium
- **Depends on:** None
- **Files to touch:** `app/api/import/[id]/save/route.ts`
- **Problem:** `req.json().catch(() => ({}))` swallow JSON malformado silenciosamente. `listId` y `createListName` se usan sin schema.
- **Expected outcome:** Schema zod con `listId: z.string().optional()` y `createListName: z.string().min(1).optional()`. Si el body es inválido, 400.
- **Done when:** `typecheck` pasa.
- **Verification:**
  ```bash
  npm run typecheck
  ```

---

### TD-M5. Índices faltantes en List, Campaign e Import

- [ ] **Status:** Pending
- **Priority:** Medium
- **Depends on:** None
- **Files to touch:** `prisma/schema.prisma`
- **Problem:** `List`, `Campaign`, e `Import` no tienen `@@index([userId])`. Cada query user-scoped hace full table scan.
- **Expected outcome:** `@@index([userId])` añadido a los tres modelos. Migración aplicada.
- **Done when:** `prisma:push` o migración aplicada exitosamente.
- **Verification:**
  ```bash
  npm run prisma:push
  npm run typecheck
  ```

---

### TD-M6. N+1 en generate loop — pre-fetch CampaignEmails existentes

- [ ] **Status:** Pending
- **Priority:** Medium
- **Depends on:** None
- **Files to touch:** `lib/jobs/generate-campaign.ts`
- **Problem:** `campaignEmail.findUnique` por miembro de lista dentro del loop para ver si ya fue generado.
- **Expected outcome:** Un `findMany` antes del loop trae todos los emails existentes para la campaña; el check dentro del loop usa un `Set` en memoria.
- **Done when:** `typecheck` pasa; no hay `findUnique` dentro del loop.
- **Verification:**
  ```bash
  npm run typecheck
  npx vitest run
  ```

---

### TD-L1. Dead export markBlockPermanent en rate-limit.ts

- [ ] **Status:** Pending
- **Priority:** Low
- **Depends on:** None
- **Files to touch:** `lib/rate-limit.ts`
- **Problem:** `markBlockPermanent` está exportada pero no se usa en ningún lugar del codebase. El JSDoc dice "used by the tracking pixel" — incorrecto.
- **Expected outcome:** La función se elimina (export + implementación + función en memoria + rama Redis).
- **Done when:** `typecheck` pasa; grep de `markBlockPermanent` da 0 resultados.
- **Verification:**
  ```bash
  npm run typecheck
  npx vitest run
  ```

---

### TD-L2. sidebar-context.tsx en lib/ — mover a components/

- [ ] **Status:** Pending
- **Priority:** Low
- **Depends on:** None
- **Files to touch:** `lib/sidebar-context.tsx` → `components/layout/sidebar-context.tsx`
- **Problem:** Un contexto React client-side vive en `lib/` (directorio de utilidades server-side).
- **Expected outcome:** Archivo movido; todos los imports actualizados.
- **Done when:** `typecheck` pasa; no hay referencias a `lib/sidebar-context`.
- **Verification:**
  ```bash
  npm run typecheck
  ```

---

### TD-L3. getDailyDigestQueue faltante en queue.ts

- [ ] **Status:** Pending
- **Priority:** Low
- **Depends on:** None
- **Files to touch:** `lib/jobs/queue.ts`
- **Problem:** `QUEUE_NAMES.dailyDigest` definido pero sin getter `getDailyDigestQueue`, a diferencia de los otros tres queues.
- **Expected outcome:** Getter añadido con el mismo patrón singleton de los otros.
- **Done when:** `typecheck` pasa.
- **Verification:**
  ```bash
  npm run typecheck
  ```

---

## Completion rule

Un task puede cambiar de `- [ ]` a `- [x]` solo cuando:

- La implementación está completa.
- El comando de verificación listado ha corrido exitosamente.
- Cualquier fallo está documentado con un follow-up task.
- El cambio está commiteado si modifica archivos del repositorio.
