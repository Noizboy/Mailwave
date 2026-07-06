# MailWave Environment Variables

## Required for local development

Copy `.env` and set these values before running the app.

### Database
| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/mailwave?schema=public` |

### Auth
| Variable | Description | Notes |
|---|---|---|
| `AUTH_SECRET` | Auth.js JWT signing secret | Generate: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Full URL of the app | `http://localhost:3000` |

### Encryption
| Variable | Description | Notes |
|---|---|---|
| `ENCRYPTION_KEY` | AES-256-GCM key for secrets | Must be 32+ characters |

Used to encrypt SMTP passwords and AI API keys at rest in the database.

### Background Jobs
| Variable | Description | Example |
|---|---|---|
| `REDIS_URL` | Redis connection string for BullMQ | `redis://localhost:6379` |

## Optional overrides

These are set by users in-app via the Settings UI, not in `.env`. Do not hard-code them.

- SMTP host/port/credentials — stored encrypted in `SmtpConfig`
- AI API keys — stored encrypted in `AiConfig`

## Secrets handling rules

1. Passwords and API keys are **never stored in plaintext**. They are encrypted with AES-256-GCM using `ENCRYPTION_KEY` before being written to the database.
2. The `ENCRYPTION_KEY` must be at least 32 characters. A short key causes `lib/crypto.ts` to throw at startup.
3. API responses mask stored secrets (show `••••••••` instead of the real value).
4. Logs must never print decrypted secrets.

## Local setup

```bash
# 1. Install dependencies
cd mailwave && npm install

# 2. Start PostgreSQL (Docker)
docker run -d --name mailwave-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres

# 3. Start Redis (Docker)
docker run -d --name mailwave-redis -p 6379:6379 redis

# 4. Create the database
psql -U postgres -c "CREATE DATABASE mailwave;"

# 5. Run migrations and seed
npx prisma migrate dev
npx ts-node --project tsconfig.json prisma/seed.ts

# 6. Start the dev server
npm run dev

# 7. (Optional) Start the background workers
# Workers are not auto-started in dev; they run separately in production.
# For local testing, trigger generation via the API and observe DB changes.
```

## Production deployment checklist

- [ ] `AUTH_SECRET` is a cryptographically random 32-byte base64 string
- [ ] `ENCRYPTION_KEY` is a cryptographically random 32+ character string
- [ ] `DATABASE_URL` points to a production Postgres instance with SSL
- [ ] `REDIS_URL` points to a production Redis instance
- [ ] `NEXTAUTH_URL` is set to the production domain
- [ ] Background workers (`startGenerateWorker`, `startSendWorker`) are running as separate processes
- [ ] Prisma migrations have been run against the production database
