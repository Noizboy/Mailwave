# Changelog

## [Unreleased]

## [2026-08-17]

### Added

- **Public Logs API** (`GET /api/public/logs`) — endpoint público para consultar logs del sistema, protegido por API key via header `X-Api-Key`.
- **SystemLog table** — nueva tabla en BD que almacena eventos estructurados con `level` (info/warn/error), `category`, `message`, `metadata` JSON, `userId` y `createdAt`.
- **ApiKey table** — gestión de API keys por usuario con hash SHA-256, `lastUsedAt` y revocación suave (`revokedAt`).
- **`lib/logger.ts`** — utilidad de logging fire-and-forget que nunca bloquea el caller.
- **`lib/api-key.ts`** — generación, hasheo y validación de API keys; soporta clave estática via `PUBLIC_LOGS_API_KEY`.
- **API key management routes** — `POST /api/api-keys`, `GET /api/api-keys`, `DELETE /api/api-keys/:id` (requieren sesión).
- **Debug endpoint** (`GET /api/public/logs/debug`) — verifica que `PUBLIC_LOGS_API_KEY` esté cargada en el contenedor.
- **`PUBLIC_LOGS_API_KEY`** env var — clave estática para el endpoint público; declarada en `.env.example` y `docker-compose.yml`.

### Instrumentation

Eventos registrados automáticamente en `SystemLog`:

| Category   | Eventos |
|------------|---------|
| `auth`     | Login exitoso, fallido (email desconocido / contraseña incorrecta), rate-limit bloqueado |
| `campaign` | Generación iniciada, completada, sin contactos elegibles |
| `ai`       | Error de configuración AI, fallo por contacto, error de servicio AI |
| `smtp`     | Email enviado, email fallido |

### Filters supported

`level`, `category`, `userId`, `from`, `to`, `page`, `pageSize` (max 200)

### Docs

- [`docs/public-logs-api.md`](docs/public-logs-api.md) — referencia completa del endpoint
- [`docs/archive/easypanel-installation.md`](docs/archive/easypanel-installation.md) — actualizado con `PUBLIC_LOGS_API_KEY`
