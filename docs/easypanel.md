# Deploying Mailwave on Easypanel

This repo is now set up for Easypanel's **Compose** service type by default.

## What to select in Easypanel

Create one service:

1. Type: `Compose`
2. Source: GitHub repo `Noizboy/Mailwave`
3. Compose file: `docker-compose.yml`

That one compose stack includes:

- `postgres`
- `redis`
- `migrate`
- `app`
- `worker`

## Environment variables

Start from [.env.easypanel.example](/C:/Users/lexpc/Documents/Repositories/Mailwave/.env.easypanel.example).

Required:

- `APP_DOMAIN`
- `AUTH_URL`
- `POSTGRES_PASSWORD`
- `AUTH_SECRET`
- `ENCRYPTION_KEY`

Optional:

- `POSTGRES_USER`
- `POSTGRES_DB`
- `AUTH_TRUST_HOST`
- `REDIS_URL`
- `NEXT_PUBLIC_APP_VERSION`
- `TRAEFIK_NETWORK`
- `TRAEFIK_CERT_RESOLVER`
- `TRAEFIK_HTTP_MIDDLEWARE`

## Routing

`docker-compose.yml` parameterizes public routing through:

- `APP_DOMAIN`
- `TRAEFIK_NETWORK`
- `TRAEFIK_CERT_RESOLVER`
- `TRAEFIK_HTTP_MIDDLEWARE`

This removes the old hardcoded deployment domain from the repo.

## Migrations

The compose stack now expects committed Prisma migrations and runs:

- `prisma migrate deploy`

The initial migration is committed under `prisma/migrations/`.

## Local Docker

Local Docker development moved to:

- [docker-compose.local.yml](/C:/Users/lexpc/Documents/Repositories/Mailwave/docker-compose.local.yml)
