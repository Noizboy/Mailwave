# Easypanel Installation Guide

This repository is prepared to run in Easypanel using the default Compose flow. You only need to connect the GitHub repository, select `docker-compose.yml`, define the environment variables, and deploy.

## What gets deployed

The default stack creates these services:

- `postgres`: application database
- `redis`: queue and cache backend
- `migrate`: runs Prisma migrations before the app starts
- `app`: the Mailwave web application
- `worker`: background job processor

## Before you start

You need:

- an Easypanel project
- access to `https://github.com/Noizboy/Mailwave.git`
- a public domain or subdomain for Mailwave
- the environment values listed below

## 1. Create the service

In Easypanel:

1. Create a new service inside your target project.
2. Select the service type `Compose`.
3. Connect the GitHub repository `Noizboy/Mailwave`.
4. Set the compose file path to `docker-compose.yml`.
5. Save the service.

## 2. Configure environment variables

Use [.env.easypanel.example](../.env.easypanel.example) as the base reference.

Required variables:

- `APP_DOMAIN`
  Example: `mailwave.example.com`
- `AUTH_URL`
  Example: `https://mailwave.example.com`
- `POSTGRES_PASSWORD`
  Use a strong password for PostgreSQL.
- `AUTH_SECRET`
  Use a long random secret.
- `ENCRYPTION_KEY`
  Use a long random encryption key.

Optional variables:

- `POSTGRES_USER`
- `POSTGRES_DB`
- `AUTH_TRUST_HOST`
- `REDIS_URL`
- `NEXT_PUBLIC_APP_VERSION`
- `TRAEFIK_NETWORK`
- `TRAEFIK_CERT_RESOLVER`
- `TRAEFIK_HTTP_MIDDLEWARE`

Notes:

- `APP_DOMAIN` drives the public routing labels.
- `AUTH_URL` must exactly match the final public URL.
- If `POSTGRES_USER` or `POSTGRES_DB` are omitted, the compose defaults are used.
- `REDIS_URL` is already wired internally by default, so it usually does not need to be changed.

## 3. Deploy

After saving the environment variables:

1. Trigger the deployment in Easypanel.
2. Wait until `postgres`, `redis`, `migrate`, `app`, and `worker` are running.
3. Confirm that `migrate` finishes successfully.

The initial Prisma migration is already committed in the repository, so no separate manual migration step should be needed.

## 4. Verify the installation

After deployment:

1. Open `https://<APP_DOMAIN>`.
2. Confirm the main app loads correctly.
3. Open `https://<APP_DOMAIN>/api/health`.

Expected health response:

```json
{"status":"ok"}
```

## 5. Updating later

To deploy future changes:

1. Push changes to the branch connected in Easypanel.
2. Trigger a new deployment.
3. Review `migrate`, `app`, and `worker` logs if the release includes database or queue changes.

## Troubleshooting

### `migrate` fails

Check:

- `POSTGRES_PASSWORD`
- PostgreSQL container startup status
- `migrate` service logs

### The app loads but authentication fails

Check:

- `AUTH_URL` matches the public domain exactly
- `AUTH_SECRET` is present
- `APP_DOMAIN` points to the same host you are opening

### Background jobs are not processed

Check:

- `redis` is running
- `worker` is running
- `worker` logs show no connection or startup errors

## Related files

- Technical Easypanel reference: [easypanel.md](./easypanel.md)
- Example environment file: [.env.easypanel.example](../.env.easypanel.example)
- Default Easypanel compose file: [docker-compose.yml](../docker-compose.yml)
