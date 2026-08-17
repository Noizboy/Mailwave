# Public Logs API

Mailwave exposes a public endpoint for querying structured system logs. All server-side events — logins, campaign generation, email sending, AI errors — are written to this log automatically.

## Authentication

Every request must include an `X-Api-Key` header. The key is configured via the `PUBLIC_LOGS_API_KEY` environment variable (see [EasyPanel setup](#easypanel-setup)).

```
X-Api-Key: <your-key>
```

Alternatively, keys can be created per-user through the API (see [Key management](#key-management)).

---

## Endpoint

```
GET /api/public/logs
```

### Query parameters

| Parameter  | Type   | Description                                      | Example                        |
|------------|--------|--------------------------------------------------|--------------------------------|
| `level`    | string | Filter by severity: `info`, `warn`, `error`      | `?level=error`                 |
| `category` | string | Filter by source: `auth`, `campaign`, `smtp`, `ai` | `?category=smtp`             |
| `userId`   | string | Filter by user ID                                | `?userId=cm...`                |
| `from`     | string | Start of time range (ISO 8601)                   | `?from=2026-08-17T00:00:00Z`   |
| `to`       | string | End of time range (ISO 8601)                     | `?to=2026-08-17T23:59:59Z`     |
| `page`     | number | Page number, default `1`                         | `?page=2`                      |
| `pageSize` | number | Results per page, default `50`, max `200`        | `?pageSize=100`                |

All parameters are optional and can be combined.

### Response

```json
{
  "data": [
    {
      "id": "cm...",
      "level": "info",
      "category": "auth",
      "message": "Login successful",
      "metadata": { "ip": "1.2.3.4" },
      "userId": "cm...",
      "createdAt": "2026-08-17T10:23:00Z"
    }
  ],
  "pagination": {
    "total": 142,
    "page": 1,
    "pageSize": 50,
    "hasMore": true
  }
}
```

---

## Log categories

| Category   | Events logged |
|------------|---------------|
| `auth`     | Login successful, login failed (wrong password / unknown email), rate-limit blocks |
| `campaign` | Generation started, generation complete, no eligible contacts |
| `ai`       | AI config errors, per-contact generation failures, service-level AI errors |
| `smtp`     | Each email sent, each email failed |

---

## Examples

**All logs (latest first):**
```powershell
Invoke-WebRequest "https://your-domain.com/api/public/logs" `
  -Headers @{"X-Api-Key"="your-key"} -UseBasicParsing
```

**Only errors:**
```powershell
Invoke-WebRequest "https://your-domain.com/api/public/logs?level=error" `
  -Headers @{"X-Api-Key"="your-key"} -UseBasicParsing
```

**Auth logs from a specific hour:**
```powershell
Invoke-WebRequest "https://your-domain.com/api/public/logs?category=auth&from=2026-08-17T14:00:00Z&to=2026-08-17T15:00:00Z" `
  -Headers @{"X-Api-Key"="your-key"} -UseBasicParsing
```

**SMTP errors today, up to 200 results:**
```powershell
Invoke-WebRequest "https://your-domain.com/api/public/logs?category=smtp&level=error&from=2026-08-17T00:00:00Z&pageSize=200" `
  -Headers @{"X-Api-Key"="your-key"} -UseBasicParsing
```

---

## EasyPanel setup

Add the following environment variable to your EasyPanel service before deploying:

| Variable              | Description                                       |
|-----------------------|---------------------------------------------------|
| `PUBLIC_LOGS_API_KEY` | Static API key accepted by the public logs endpoint. Generate with: `openssl rand -hex 32` |

The variable is already declared in `docker-compose.yml`. After adding it in EasyPanel, trigger a new Deploy for it to take effect.

To verify it loaded correctly:
```
GET /api/public/logs/debug
```
Returns `{"set":true,...}` when the variable is present.

---

## Key management

User-scoped API keys can be created and revoked through the authenticated API. These are an alternative to the static env key — both work simultaneously.

**Create a key** (requires session):
```
POST /api/api-keys
Content-Type: application/json

{"name": "my-dashboard"}
```
Returns the key value once — it is never shown again.

**List active keys:**
```
GET /api/api-keys
```

**Revoke a key:**
```
DELETE /api/api-keys/:id
```

---

## Notes

- Logs are written from the moment the feature was deployed. No historical data exists before that point.
- Log writes are fire-and-forget and never block request or job processing.
- The debug endpoint (`/api/public/logs/debug`) is intended for deployment verification and can be removed once the setup is confirmed.
