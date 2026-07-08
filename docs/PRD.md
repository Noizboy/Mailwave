# Mailwave — Product Requirements Document (PRD)

> Estado del documento: PRD retrospectivo generado a partir del sistema actual implementado (snapshot del codebase en `main`). Describe los features existentes "tal cual están" (`as-built`), no la visión futura. Para planes de evolución, crear un PRD incremental separado.

---

## 1. Resumen ejecutivo

**Mailwave** es una aplicación SaaS self-hosted de **automatización de cold email** orientada a usuarios individuales (cuentas single-user, sin equipos ni multi-tenancy). Combina:

- **Generación de emails personalizados con IA** (multi-proveedor: OpenAI, Anthropic, Google Gemini, OpenRouter, custom OpenAI-compatible, y Codex vía OAuth).
- **Workflow de revisión humana** (approve / reject / regenerate) antes del envío.
- **Envío throttled por SMTP genérico** con rate limits diarios/horarios, intervalos entre envíos, y tracking de aperturas por pixel 1x1.
- **Gestión de contactos y listas** con importación CSV (detección automática de columnas, validación y deduplicación).
- **Reportes y analítica** con KPIs, breakdown por campaña, log de emails y exportación CSV.
- **Stack de background jobs** sobre BullMQ + Redis (generación, envío, supresión, digest).
- **Notificaciones in-app** con preferencias por evento.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 + PostgreSQL · NextAuth v5 (JWT, Credentials) · BullMQ + Redis · nodemailer · shadcn/ui + Tailwind v4 · Vitest + Playwright.

**Usuario objetivo:** profesionales / Growth / SDRs que ejecutan outreach frío a pequeñas/médianas listas y necesitan control fino sobre el contenido generado por IA antes de enviar.

---

## 2. Objetivos y no-objetivos

### Objetivos (cubiertos por el sistema actual)
1. Permitir a un usuario importar contactos desde CSV y organizarlos en listas.
2. Generar emails de cold outreach personalizados por contacto usando IA, con control de tono, objetivo, CTA, longitud e idioma.
3. Permitir revisión humana por email (aprobar, rechazar, editar, regenerar) antes de enviar.
4. Enviar por SMTP propio con throttling configurable, sin exceder límites diarios/horarios ni un máximo de envíos por contacto.
5. Medir aperturas mediante pixel de tracking y reportar tasa de entrega, de apertura y estado de cada email.
6. Mantener notificaciones in-app sobre eventos relevantes (generación completada/fallida, envío completado/fallido, bounce).
7. Mantener configuración segura de credenciales (SMTP, API keys, tokens OAuth) cifradas en reposo.

### No-objetivos (explícitamente fuera de alcance actual)
- Registro/autoregistro de usuarios (los usuarios se crean vía seed o por migración).
- Multi-tenancy, equipos, roles, permisos o invitaciones.
- Tracking de clicks, links de desuscripción inyectados, ni webhooks de bounce/complaint de proveedores.
- Plantillas reutilizables como entidad propia (los "parámetros de campaña" actúan como inputs de plantilla).
- Billing, suscripciones, planes con límites, ni créditos.
- A/B testing ni variantes de subject line.
- Programación por recipiente individual (solo `scheduledAt` por campaña + intervalos entre envíos).

---

## 3. Usuarios y personas

| Persona | Descripción | Necesidades cubiertas |
|---|---|---|
| **Operador de outreach (cuenta única)** | Profesional que gestiona sus propias listas y campañas. Es admin total de su cuenta. | Importar contactos, generar con IA, revisar, enviar con throttling, medir. |

No hay otros roles. Toda la autorización se reduce a **owner-scoping por `userId`**: cada query filtra por el usuario autenticado; no existen permisos granulares.

---

## 4. Arquitectura de alto nivel

```
┌───────────────────────┐      ┌────────────────────────┐      ┌──────────────┐
│  Browser (Next.js UI) │◄────►│  Next.js App Router    │◄────►│ PostgreSQL   │
│  React 19 + RQ/Table  │  HX  │  (Server Components,   │      │ (Prisma 7)   │
│  shadcn/ui + Tailwind │      │   API routes, Proxy)   │      └──────────────┘
└───────────────────────┘      └──────────┬─────────────┘
                                          │ encola/desencola
                                          ▼
                                 ┌────────────────────────┐      ┌──────────────┐
                                 │  BullMQ workers (tsx)  │◄────►│   Redis      │
                                 │  generate / send /     │      └──────────────┘
                                 │  suppress / digest     │
                                 └──────────┬─────────────┘
                                            │ llama / envía
                                  ┌─────────┴─────────┐
                                  ▼                   ▼
                          ┌──────────────┐    ┌──────────────┐
                          │  Proveedores │    │  SMTP server │
                          │  de IA       │    │  (nodemailer)│
                          └──────────────┘    └──────────────┘
```

- **Autenticación:** NextAuth v5, sesión JWT, provider Credentials, middleware en `proxy.ts`.
- **Cifrado en reposo:** AES-256-GCM (`lib/crypto.ts`) para password SMTP, API keys IA y tokens OAuth Codex (usa `ENCRYPTION_KEY`).
- **Background jobs:** 4 workers BullMQ; serial para envío (concurrency 1), concurrencia 2 para generación y supresión.
- **Tracking:** pixel GET `/api/track/{emailId}` devuelve GIF 1x1 y registra evento `opened`.

---

## 5. Requisitos funcionales

Cada feature se etiqueta con **[EXISTE]** para indicar que ya está implementado en el snapshot actual.

### 5.1 Autenticación y sesión

| ID | Requisito | Detalle |
|---|---|---|
| AUTH-01 | **Login con credenciales** [EXISTE] | Formulario email/contraseña en `/login`; usa `signIn("credentials")` de NextAuth; contraseña ≥ 8 chars validada con zod; comparación bcrypt. |
| AUTH-02 | **Sesión JWT** [EXISTE] | `session.strategy = "jwt"`; el callback `jwt` inyecta `user.id`; `session` expone `session.user.id`. |
| AUTH-03 | **Protección de rutas** [EXISTE] | Middleware `proxy.ts`: rutas públicas `/login` y `/api/auth`; no autenticado → redirect `/login?callbackUrl=...` (páginas) o 401 JSON (API); autenticado en `/login` → redirect `/dashboard`. |
| AUTH-04 | **Owner-scoping** [EXISTE] | Toda query Prisma filtra por `userId: session.user.id`; updates/deletes usan `updateMany`/`deleteMany` con filtro `userId`; relaciones anidadas filtran por `campaign.userId` o equivalente. |
| AUTH-05 | **Cambio de contraseña** [EXISTE] | `POST /api/settings/account/password`: verifica bcrypt actual, hashea nuevo con cost 12. |
| AUTH-06 | **Sin registro público** [EXISTE] | No existe UI de signup; usuarios creados vía seed (`demo@mailwave.app` / `password123`) o por migración. |

### 5.2 Contactos

| ID | Requisito | Detalle |
|---|---|---|
| CON-01 | **CRUD de contactos** [EXISTE] | List (paginado, filtros), create, get, patch, delete. Email único por usuario (`@@unique([userId, email])`), almacenado en minúsculas. |
| CON-02 | **Búsqueda y filtros** [EXISTE] | Filtros: búsqueda (email/nombre/empresa), `status`, `listId`, rango de fechas. Paginación máx 100/página. |
| CON-03 | **Estados de contacto** [EXISTE] | `ContactStatus`: `subscribed`, `unsubscribed`, `suppressed`, `invalid`. Los `unsubscribed` son inmutables (no se editan). |
| CON-04 | **Custom fields** [EXISTE] | Columna JSON `customFields`; poblada desde mapeo CSV de columnas desconocidas. |
| CON-05 | **Auto-supresión por umbral** [EXISTE] | `emailsSentCount` se incrementa por envío; al alcanzar `suppressAfterEmails` el estado pasa a `suppressed` (en send worker y en job `apply-suppress-threshold`). |
| CON-06 | **Operaciones bulk** [EXISTE] | Asignación masiva a lista (`bulk-assign-list-dialog`), cambio masivo de estado (`bulk-change-status-dialog`). |
| CON-07 | **Edición individual** [EXISTE] | Dialog de edición por contacto (`contact-edit-dialog`). |

### 5.3 Listas

| ID | Requisito | Detalle |
|---|---|---|
| LST-01 | **CRUD de listas** [EXISTE] | Create, rename, delete, list-with-stats, detail-with-members. |
| LST-02 | **Stats por lista** [EXISTE] | total, subscribed, invalid, suppressed, unsubscribed. |
| LST-03 | **Gestión de miembros** [EXISTE] | Add/remove `contactIds` bulk (verificando ownership). Unique constraint `[listId, contactId]`. |
| LST-04 | **Targeting de campañas** [EXISTE] | Las campañas apuntan a una `listId`; el send worker extrae miembros `subscribed` de la lista de la campaña. |

### 5.4 Importación CSV

| ID | Requisito | Detalle |
|---|---|---|
| IMP-01 | **Upload multipart** [EXISTE] | Form en `/upload` → `POST /api/import` (multipart). |
| IMP-02 | **Parser CSV propio** [EXISTE] | `lib/csv.ts`: parser quote-aware, detección de headers duplicados, detección automática de columna de email (alias EN+ES: email/e-mail/correo/mail/…), validación regex de email. |
| IMP-03 | **Mapeo de columnas** [EXISTE] | `KNOWN_COLUMN_MAP` mapea variaciones comunes (incl. español: nombre, apellido, empresa, cargo) a firstName/lastName/company/jobTitle/aiHint/email/linkedin. Columnas desconocidas → custom fields. Mapeo editable en UI. |
| IMP-04 | **Validación por fila** [EXISTE] | `ImportRowStatus`: `valid`, `invalid`, `duplicate`, `missing_data`, con `errorReason`. Duplicados detectados contra contactos existentes del usuario y dentro del archivo. |
| IMP-05 | **Revisión y edición** [EXISTE] | `/import/[id]`: editar fila (re-valida), borrar fila(s), ajustar mapeo, elegir lista destino (existente o crear nueva). |
| IMP-06 | **Persistencia (save)** [EXISTE] | `POST /api/import/[id]/save`: upsert de contactos válidos (email en minúsculas), agrega a lista, marca import `saved`. |
| IMP-07 | **Cancelación** [EXISTE] | `POST /api/import/[id]/cancel`: marca `cancelled`, borra filas. |
| IMP-08 | **State machine** [EXISTE] | `pending → processing → review → saved | cancelled`. |

### 5.5 Campañas

| ID | Requisito | Detalle |
|---|---|---|
| CMP-01 | **Listado de campañas** [EXISTE] | `/campaigns` con estados y métricas derivadas. |
| CMP-02 | **Wizard de creación** [EXISTE] | `/campaigns/create`: nombre, lista, goal, product, cta, tone, language (default `en`), emailLength (`very-short`/`short`/`medium`/`long`), systemPrompt custom, intervalType (`fixed`/`random`), min/max interval (min, default 3/8), daily/hourly limits, AI provider/model override, `scheduledAt` opcional. |
| CMP-03 | **Ciclo de vida** [EXISTE] | `pending → generating → pending_review → ready_to_send → sending → (paused | completed | failed)`. |
| CMP-04 | **Detalle y revisión** [EXISTE] | `/campaigns/[id]`: generar (full o retry-failed), approve-all, approve/reject/edit por email, regenerate (subject o body) por email, send, pause, cancel, retry-failed, delete. |
| CMP-05 | **Programación** [EXISTE] | `POST /api/campaigns` encola job BullMQ retrasado si `scheduledAt` está en el futuro. |
| CMP-06 | **Control de concurrencia** [EXISTE] | `activeSendRunId`: solo un send run "posee" la campaña a la vez; runs stale se detectan y se ignoran. |
| CMP-07 | **Métricas derivadas** [EXISTE] | `lib/campaign-metrics.ts` calcula sentCount, failedCount, skippedCount, pendingCount, approvalPendingCount. |
| CMP-08 | **Cancelación limpia** [EXISTE] | Cancel elimina el job retrasado programado, resetea `failed → approved`, mueve a `ready_to_send`. |
| CMP-09 | **Dedup por nombre** [EXISTE] | La creación evita duplicados de nombre por usuario. |

### 5.6 Emails de campaña (contenido generado)

| ID | Requisito | Detalle |
|---|---|---|
| EML-01 | **Entidad CampaignEmail** [EXISTE] | `@@unique([campaignId, contactId])`. Campos: subject, body, personalizationNotes, promptUsed, modelUsed, generatedAt, approvalStatus, status, sentAt, errorReason, retryCount, revisionOf. |
| EML-02 | **Estados de aprobación** [EXISTE] | `ApprovalStatus`: `pending`, `approved`, `rejected`, `skipped`. |
| EML-03 | **Estados de envío** [EXISTE] | `CampaignEmailStatus`: `pending`, `generated`, `approved`, `rejected`, `skipped`, `sending`, `sent`, `failed`. |
| EML-04 | **Edición** [EXISTE] | `PATCH /api/campaigns/[id]/emails/[emailId]`: edita subject/body/approvalStatus; rechaza si el contacto está `suppressed`. |
| EML-05 | **Listado paginado** [EXISTE] | `GET /api/campaigns/[id]/emails` con filtros `approvalStatus` y `status`, flag `opened`. |
| EML-06 | **Regeneración individual** [EXISTE] | `POST .../regenerate` con `target: subject | body`. |

### 5.7 Generación con IA

| ID | Requisito | Detalle |
|---|---|---|
| AI-01 | **Multi-proveedor** [EXISTE] | `lib/ai.ts`: `openai`, `anthropic`, `google_gemini` (vía endpoint OpenAI-compatible), `openrouter` (OpenAI-compatible + headers `HTTP-Referer`/`X-Title`), `custom` (OpenAI-compatible), `codex` (OAuth con OpenAI). |
| AI-02 | **Modelos por defecto** [EXISTE] | gpt-4o-mini, claude-haiku-4-5-20251001, gemini-1.5-flash, openai/gpt-4o-mini, gpt-4o-mini, gpt-4o (codex). |
| AI-03 | **Construcción de prompt** [EXISTE] | `buildSystemPrompt` (goal/product/cta/tone/language/guía de longitud/anti-placeholder) + `buildUserPrompt` (campos del contacto + customFields). |
| AI-04 | **Salida estructurada** [EXISTE] | JSON `{subject, body, personalizationNotes}`; se remueven fences markdown; fallback a texto crudo si falla el parse. |
| AI-05 | **Guard anti-placeholder** [EXISTE] | Instrucción explícita de no usar `[Your Name]` u otros placeholders. |
| AI-06 | **Generación bulk** [EXISTE] | Worker `generate-campaign` (concurrency 2, 3 intentos, backoff exponencial 5s). Marca campaña `generating → pending_review`. Salta emails ya generados. |
| AI-07 | **Detección de errores de servicio** [EXISTE] | Timeouts, 401, 5xx, red → aborta temprano con `failed` + notificación. |
| AI-08 | **Regeneración individual** [EXISTE] | Por email, con target subject/body. |
| AI-09 | **Test de conexión IA** [EXISTE] | Genera un email de prueba; mapeo de errores a mensajes humanos. |
| AI-10 | **Codex OAuth (PKCE)** [EXISTE] | `/api/settings/ai/codex/connect` (state+verifier cookie) → authorize OpenAI → `/codex/callback` intercambia código, cifra tokens. Refresh si quedan <5 min. Disconnect revoca en `auth.openai.com/oauth/revoke`. |
| AI-11 | **Override por campaña** [EXISTE] | Cada campaña puede indicar `aiProvider`/`aiModel` distinto al default de la cuenta. |

### 5.8 Envío de emails (SMTP)

| ID | Requisito | Detalle |
|---|---|---|
| SND-01 | **Envío serial throttled** [EXISTE] | Worker `send-campaign` (concurrency 1). Reclama campaña con `sendRunId`; bucle por emails aprobados. |
| SND-02 | **Rate limits diarios/horarios** [EXISTE] | Cuenta eventos `sent` en última hora/día; si excede, calcula tiempo de resumen y re-encola job retrasado. |
| SND-03 | **Umbral por contacto** [EXISTE] | Si `emailsSentCount >= suppressAfterEmails` → skip + marca `skipped`. |
| SND-04 | **Intervalos entre envíos** [EXISTE] | `fixed` o `random` entre `minInterval`/`maxInterval` (minutos). Actualiza `nextSendAt`. |
| SND-05 | **Pausa-aware** [EXISTE] | Re-checkea estado de campaña en cada iteración; respeta `paused`. |
| SND-06 | **Tracking pixel** [EXISTE] | Inyecta `<img src="{NEXTAUTH_URL}/api/track/{emailId}">` en el HTML. |
| SND-07 | **Registro de eventos** [EXISTE] | `sent` y `failed` como `DeliveryEvent`. |
| SND-08 | **Auto-supresión en envío** [EXISTE] | Incrementa `emailsSentCount`; si llega al umbral, cambia estado del contacto a `suppressed`. |
| SND-09 | **Notificación de bounce** [EXISTE] | En fallo, crea notificación `delivery.email_bounced` rate-limited a 1/hora/campaña. |
| SND-10 | **Finalización** [EXISTE] | Sin emails restantes → `completed` (set `completedAt`); si no → `paused`. Notificación `campaign.sending_complete` si la pref está activa. |
| SND-11 | **Retry de fallidos** [EXISTE] | `POST /api/campaigns/[id]/retry-failed`: reset `failed → approved` y re-encola send job. |
| SND-12 | **Pause / cancel** [EXISTE] | `pause` detiene el bucle; `cancel` remueve job programado, resetea fallidos a aprobados, vuelve a `ready_to_send`. |

### 5.9 Tracking de aperturas

| ID | Requisito | Detalle |
|---|---|---|
| TRK-01 | **Pixel de apertura** [EXISTE] | `GET /api/track/[emailId]`: devuelve GIF 1x1 transparente (base64), `Cache-Control: no-store`. Registra `opened` DeliveryEvent solo si el email está `sent`. Errores silenciados (pixel siempre se devuelve). |
| TRK-02 | **Deduplicación de apertura** [EXISTE] | En reportes, aperturas se agrupan por `campaignEmailId` y se cuentan una vez por email. |
| TRK-03 | **Sin tracking de clicks** [EXISTE] | No implementado (gap conocido). |
| TRK-04 | **Sin webhooks de bounce** [EXISTE] | Los bounces se infieren solo de errores de `nodemailer.send`. |

### 5.10 Dashboard y reportes

| ID | Requisito | Detalle |
|---|---|---|
| RPT-01 | **Dashboard** [EXISTE] | `/dashboard` + `GET /api/dashboard`: totalContacts, totalLists, activeCampaigns, emailsSent, failedEmails, pendingReviews, estado SMTP/IA, 5 campañas recientes con métricas. Quick actions: Upload CSV, Create Campaign. |
| RPT-02 | **Reportes agregados** [EXISTE] | `GET /api/reports`: totalContacts, activeContacts, totalCampaigns, completedCampaigns, totalEmailsSent, totalFailed, deliveryRate (%), totalOpened (dedup), openRate (%), top-20 campañas activas/completadas con métricas por campaña + openedCount. |
| RPT-03 | **Log de emails** [EXISTE] | `GET /api/reports/emails`: paginado, filtros (campaignId, status, q, from, to), per-page 10–100, stats groupBy status (sent/failed/generated/skipped/pending). |
| RPT-04 | **Exportación CSV** [EXISTE] | `GET /api/reports/export`: descarga `mailwave-export.csv` con columnas Campaign, First/Last Name, Email, Company, Subject, Approval, Status, Sent At. Filtro opcional por `campaignId`. |

### 5.11 Notificaciones

| ID | Requisito | Detalle |
|---|---|---|
| NOT-01 | **Feed in-app** [EXISTE] | `/notifications`; badge de no leídos en TopBar; mark read / mark all read. |
| NOT-02 | **Tipos de evento** [EXISTE] | `campaign.generation_complete`, `campaign.generation_failed`, `campaign.sending_complete`, `campaign.sending_failed`, `delivery.email_bounced`, `digest.daily`. |
| NOT-03 | **Preferencias** [EXISTE] | `NotificationPreference`: 8 tipos de evento con flags `inApp`/`email`. Defaults: campaign_complete=true, campaign_error=true, ai_email_ready=false, ai_email_error=true, email_bounced=true, daily_digest=false, system_alerts=true, low_credits=true. |
| NOT-04 | **Rate-limit de bounces** [EXISTE] | Máx 1 notificación de bounce/hora/campaña. |
| NOT-05 | **Daily digest** [EXISTE] | Worker crea notificaciones `digest.daily` para usuarios opt-in con conteos sent/failed de últimas 24h. (No hay scheduler visible en repo; debe encolarse externamente.) |

### 5.12 Configuración / Settings

| ID | Requisito | Detalle |
|---|---|---|
| SET-01 | **Account** [EXISTE] | Get/update nombre; cambio de contraseña (bcrypt cost 12). |
| SET-02 | **Mail Server (SMTP)** [EXISTE] | host/port/username/password/fromName/fromEmail/replyTo/encryption (tls/ssl/none). Password enmascarado al leer; cifrado AES-256-GCM en reposo. "Test connection" (verify o envío de test, errores humanizados). Estado connected/disconnected/failed con `testedAt`. |
| SET-03 | **AI Integration** [EXISTE] | Provider select (6 opciones), model, API key (enmascarada), baseUrl opcional. "Test connection" genera email de prueba. Botones Codex OAuth connect/disconnect. |
| SET-04 | **Sending Limits** [EXISTE] | dailyLimit (1–100000), hourlyLimit (1–10000), suppressAfterEmails (1–1000). Cambiar el umbral encola job de supresión. |
| SET-05 | **Notifications** [EXISTE] | Toggle `inApp` por tipo de evento. |

### 5.13 Background jobs

| ID | Requisito | Detalle |
|---|---|---|
| JOB-01 | **Worker unificado** [EXISTE] | `jobs/worker.ts` arranca 4 workers; shutdown graceful en SIGINT/SIGTERM. Run vía `npm run worker`. |
| JOB-02 | **generate-campaign** [EXISTE] | Concurrency 2, 3 intentos, backoff 5s exponencial. |
| JOB-03 | **send-campaign** [EXISTE] | Concurrency 1 (serial), self-requeue con delays para rate limits. |
| JOB-04 | **suppress-contacts** [EXISTE] | Concurrency 2, batched 500/batch, rate-limited 10 jobs/min. Triggered al cambiar sending-limits. |
| JOB-05 | **daily-digest** [EXISTE] | Concurrency 1; crea `digest.daily` para opt-ins. |

---

## 6. Requisitos no funcionales

| Categoría | Requisito | Implementación actual |
|---|---|---|
| **Seguridad — Auth** | Sesión JWT firmada con `AUTH_SECRET`; provider Credentials con bcrypt cost 12. | NextAuth v5 en `lib/auth.ts`; middleware `proxy.ts`. |
| **Seguridad — Cifrado en reposo** | Credenciales SMTP, API keys IA y tokens OAuth Codex cifrados con AES-256-GCM (IV + auth tag, base64). | `lib/crypto.ts` usando `ENCRYPTION_KEY` (≥32 chars). |
| **Seguridad — Owner-scoping** | Toda lectura/escritura filtra por `userId`; no hay data cross-user posible por diseño de query. | Aplicado en cada API route. |
| **Seguridad — Validación** | Toda entrada de API validada con zod (campaign, contact, SMTP, AI, sending-limits, notif prefs, password, import rows). | Schemas en cada route. |
| **Privacidad** | No hay tracking de clicks ni PII enviada a terceros más allá del proveedor de IA elegido por el usuario. | Pixel solo registra apertura, sin cookies ni fingerprinting. |
| **Performance** | Paginación en todas las listas (máx 100/página); índices en `[userId, status]`, `[campaignId, status]`, `[campaignId, approvalStatus]`, `[userId, read]`, `[importId, status]`. | `prisma/schema.prisma`. |
| **Concurrencia de envío** | Serial por worker; `activeSendRunId` previene races entre runs. | `send-campaign.ts`. |
| **Resiliencia de jobs** | Reintentos BullMQ con backoff exponencial; detección de errores de servicio IA aborta temprano. | `generate-campaign.ts`. |
| **Observabilidad** | Notificaciones in-app para fallos de generación/envío/bounces; logs a `worker.log`/`worker_err.log`. | Sistema de notificaciones + archivos de log. |
| **Mantenibilidad** | TypeScript estricto, ESLint, tests co-located, design system tokenizado (HSL vars). | `tsconfig.json`, `eslint.config.mjs`, `app/globals.css`. |
| **Compatibilidad** | Next.js 16, React 19, Node.js runtime "nodejs" en todas las API routes. | `package.json`, `runtime = "nodejs"`. |

---

## 7. Modelo de datos (resumen)

Entidades principales (ver `prisma/schema.prisma` para el detalle completo):

- **User** (1:1 SmtpConfig, AiConfig, SendingAccount; 1:N Campaign, Contact, Import, List, Notification, NotificationPreference)
- **SmtpConfig**, **AiConfig** (con campos OAuth Codex), **SendingAccount** (`suppressAfterEmails`)
- **Contact** (customFields JSON, `@@unique([userId, email])`, `emailsSentCount`)
- **Import** + **ImportRow** (state machine, `columnMapping` JSON)
- **List** + **ListMember** (join)
- **Campaign** (parámetros de IA, intervalos, límites, `activeSendRunId`, contadores)
- **CampaignEmail** (`@@unique([campaignId, contactId])`, `approvalStatus`, `status`, `revisionOf`)
- **DeliveryEvent** (`sent`/`opened`/`failed`, metadata JSON)
- **Notification**, **NotificationPreference**

Enums: `ContactStatus`, `ImportStatus`, `ImportRowStatus`, `CampaignStatus`, `CampaignEmailStatus`, `ApprovalStatus`, `SmtpConnectionStatus`, `AiConnectionStatus`, `IntervalType`, `AiProvider`.

---

## 8. API surface (resumen)

Grupos de endpoints (todos bajo `/api`, todos owner-scoped):

- `auth/[...nextauth]`
- `dashboard`, `reports`, `reports/emails`, `reports/export`
- `campaigns`, `campaigns/[id]`, `campaigns/[id]/{generate,send,pause,cancel,retry-failed,approve-all,emails,emails/[emailId],emails/[emailId]/regenerate}`
- `contacts`, `contacts/[id]`
- `lists`, `lists/[id]`, `lists/[id]/members`
- `import`, `import/[id]`, `import/[id]/rows`, `import/[id]/{save,cancel}`
- `track/[emailId]`
- `notifications`, `notifications/[id]`
- `settings/{account,account/password,smtp,smtp/test,ai,ai/test,ai/codex/{connect,callback,disconnect},sending-limits,notification-preferences}`

---

## 9. UI / UX

- **Layout**: Sidebar (desktop + MobileSidebar vía Sheet) + TopBar; context de sidebar en `lib/sidebar-context.tsx`.
- **Design system**: shadcn/ui + Radix, Tailwind v4, tokens HSL en `app/globals.css`; `StatusBadge` mapea estados a variantes CVA (`lib/status-colors.ts`).
- **Componentes shared**: `PageHeader`, `MetricCard`, `FilterBar`, `DataPagination`, `StatusBadge`.
- **Formularios**: react-hook-form + zod + `@hookform/resolvers`.
- **Tablas**: TanStack Table; data fetching con TanStack Query.
- **Páginas principales**: Dashboard, Campaigns (list/create/detail), Contacts, Lists (list/detail), Import review, Upload, Reports, Notifications, Settings (5 tabs).

---

## 10. Testing

| Nivel | Herramienta | Cobertura |
|---|---|---|
| Unit / Component | Vitest (jsdom) | `lib/*.test.ts` (ai, campaign-metrics, crypto, csv, utils) + tests co-located junto a rutas y componentes. |
| API routes | Vitest con `// @vitest-environment node` | Harness en `test/api-helpers.ts`; mocks en `lib/__mocks__/`. |
| E2E | Playwright | `e2e/` (seed global, login one-time con storage state, AI stub OpenAI-compatible, worker BullMQ real → Redis required) + `testsprite_tests/`. |

Comandos: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:e2e`, `npm run prisma:push`, `npm run seed`.

Servicios requeridos localmente: **PostgreSQL** y **Redis**.

---

## 11. Configuración / Environment

Variables (ver `.env.example`):

| Variable | Propósito |
|---|---|
| `DATABASE_URL` | URL de PostgreSQL para Prisma. |
| `AUTH_SECRET` | Secreto de firma JWT de NextAuth. |
| `NEXTAUTH_URL` | URL base pública (usada en pixel de tracking). |
| `ENCRYPTION_KEY` | Clave AES-256-GCM (≥32 chars) para cifrar credenciales. |
| `REDIS_URL` | URL de Redis para BullMQ. |

---

## 12. Gaps conocidos y fuera de alcance (para planificación futura)

Estos NO son features actuales; se listan para que un PRD incremental los pueda recoger:

1. Registro/autoregistro de usuarios (hoy: seed-only).
2. Multi-tenancy, equipos, roles, permisos, invitaciones.
3. Tracking de clicks y links de desuscripción inyectados.
4. Webhooks de bounce/complaint de proveedores SMTP (SendGrid/SES/Postmark).
5. Plantillas reutilizables como entidad.
6. Billing, suscripciones, planes con límites, créditos.
7. A/B testing y variantes de subject line.
8. Programación por recipiente individual.
9. Scheduler/cron visible para `daily-digest` (hoy requiere encolado externo).
10. `support.js` es un artefacto vendoreado de otro proyecto ("dc-runtime"); no forma parte del producto.

---

## 13. Criterios de aceptación globales (sistema actual)

El sistema "tal cual está" cumple si:

- ✅ Un usuario puede loguearse y todas sus rutas/páginas están protegidas.
- ✅ Puede importar contactos desde CSV, mapear columnas, validar y persistir en una lista.
- ✅ Puede crear una campaña apuntando a una lista, con parámetros de IA y throttling.
- ✅ Puede generar emails con IA (bulk o individual), revisarlos, editarlos, aprobarlos/rechazarlos.
- ✅ Puede enviar por SMTP propio respetando límites diarios/horarios, intervalos y umbral por contacto.
- ✅ Las aperturas se registran vía pixel y se reportan (dedup) en dashboard/reportes.
- ✅ Las credenciales (SMTP, API keys, tokens OAuth) están cifradas en reposo y enmascaradas al leer.
- ✅ Las notificaciones in-app se generan en los eventos clave y se respetan las preferencias.
- ✅ Los background jobs son resilientes (reintentos, backoff) y el shutdown es graceful.
- ✅ Toda query está owner-scoped por `userId` (no hay fuga cross-user).
