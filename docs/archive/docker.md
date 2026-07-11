# Running Mailwave in Docker

This guide covers local Docker usage. Easypanel Compose installs should use
[`docker-compose.yml`](/C:/Users/lexpc/Documents/Repositories/Mailwave/docker-compose.yml).
Local Docker development now uses
[`docker-compose.local.yml`](/C:/Users/lexpc/Documents/Repositories/Mailwave/docker-compose.local.yml).

## First boot

```bash
copy .env.docker.example .env
docker compose -f docker-compose.local.yml up -d --build
```

The stack starts:

- `postgres`
- `redis`
- `migrate`
- `app`
- `worker`

## Useful commands

```bash
docker compose -f docker-compose.local.yml ps
docker compose -f docker-compose.local.yml logs -f app
docker compose -f docker-compose.local.yml logs --tail=100 worker
docker compose -f docker-compose.local.yml logs migrate
```

## Seed demo data

The seed script refuses to run in production mode, so override it locally:

```bash
docker compose -f docker-compose.local.yml run --rm -e NODE_ENV=development app npm run seed
```

This creates the demo user:

- `demo@mailwave.app`
- `password123` by default, or `SEED_DEMO_PASSWORD` if set

## Health check

```bash
curl http://localhost:3001/api/health
```

Expected response:

```json
{"status":"ok"}
```

## Production-style image override

If you still want to use the registry image override locally or on another
Docker host:

```bash
docker compose -f docker-compose.local.yml -f docker-compose.prod.yml up -d
```
