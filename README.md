# KapMan Trading Journal

Containerized Next.js MVP for importing broker statements, normalizing executions, matching FIFO lots, and surfacing setup analytics.

## After a system restart: start the app without losing data

Use these commands after rebooting your Mac. They restart the existing Docker
containers and preserve the Postgres data stored in the `postgres-data` Docker
volume.

1. Start Docker Desktop and wait until it says the Docker engine is running.

2. Open a terminal in this repository:

```bash
cd "/Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog"
```

3. Confirm the environment file exists:

```bash
test -f .env || cp .env.example .env
```

4. Start the database and app:

```bash
docker compose up --build
```

Keep this terminal open while using the app. When startup finishes, Docker maps
the app to `http://localhost:3002`.

5. In another terminal, verify the app is ready:

```bash
curl -sf http://localhost:3002/api/health
curl -sf http://localhost:3002/api/overview/summary | grep netPnl
```

Expected health output:

```json
{"status":"ok","db":"connected"}
```

6. Open the app:

- `http://localhost:3002`

If the browser cannot connect, check the containers and app logs:

```bash
docker compose ps
docker compose logs --tail=120 app
```

Do not run `docker compose down -v` for a normal restart. That deletes the
Postgres Docker volume and removes local database data.

## UI target

Use [design/kapman_dashboard_mock_v7.html](design/kapman_dashboard_mock_v7.html) as the active UX skin target. Historical mockups are archived under `design/archived/`.

## Prerequisites

- Docker + docker-compose
- Node.js 20+
- npm 10+

## Environment

Copy `.env.example` to `.env` and adjust as needed.

Required variables:
- `DATABASE_URL`
- `NODE_ENV`
- `NEXT_TELEMETRY_DISABLED=1`

Live quote variables (optional for non-quote flows):
- `MCP_SERVER_URL` (required only for live quote features)
- `MCP_BEARER_TOKEN` (optional bearer token when the MCP endpoint requires auth)

When MCP variables are not configured or MCP is unreachable, quote endpoints degrade to:
- `GET /api/quotes` -> `{ "error": "unavailable" }`
- `GET /api/option-quote` -> `{ "error": "unavailable" }`

All non-quote application features continue to work without MCP configuration.

## Local development

### Start from a machine reboot

Use the top-level [After a system restart](#after-a-system-restart-start-the-app-without-losing-data) section.
The healthy state should show both `kapman-tradelog-app-1` and `kapman-tradelog-db-1` as `Up`, with the app exposing `0.0.0.0:3002->3000/tcp`.

### Common recovery commands

Restart the app without deleting database data:

```bash
docker compose restart app
```

Stop the stack:

```bash
docker compose down
```

Refresh the app runtime while preserving database data:

```bash
docker compose down
docker volume rm kapman-tradelog_app-node-modules
docker compose up --build
```

Only use a full database reset when you intentionally want to delete local Postgres data:

```bash
docker compose down -v
docker compose up --build
```

### First-time local setup

1. Install dependencies for host-side scripts and validation:

```bash
npm install
```

2. Start app + database containers:

```bash
docker compose up --build
```

3. Open:
- `http://localhost:3002`

On startup, the app container runs Prisma generate, migrations, and seed automatically.
Seed logic parses `Cash Balance` `BAL` rows from fixture account statements and writes them into `daily_account_snapshots` for the Overview equity-curve source.
If connecting to Postgres from the host, use `127.0.0.1:55432`.

## Troubleshooting import failures

If CSV upload fails with a Prisma runtime error such as `Unknown argument skippedDuplicateRows`, the app container is usually running with a stale Prisma client.

1. Quick fix:

```bash
docker compose restart app
```

2. If it still fails, run a clean app-runtime refresh (preserves DB data):

```bash
docker compose down
docker volume rm kapman-tradelog_app-node-modules
docker compose up --build
```

For full operational notes, see [RUNBOOK.md](RUNBOOK.md).

## Scripts

- `npm run dev`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run prisma:migrate`
- `npm run db:seed`

## Fly.io deployment

The app is configured for Fly.io in `fly.toml`:

- app name: `kapman-tradelog`
- region: `iad`
- app port: `3000`
- deploy migration command: `npx prisma migrate deploy`
- health check: `GET /api/health`

The pragmatic first-deploy path uses Fly's unmanaged Postgres. Fly notes that
unmanaged Postgres is operator-managed; use this path only when that tradeoff is
acceptable for the deployment.

### First deploy

1. Authenticate and create the app if it does not already exist:

```bash
fly auth login
fly apps create kapman-tradelog
```

2. Create and attach Postgres:

```bash
fly postgres create
fly postgres attach <pg-app-name> -a kapman-tradelog
```

`fly postgres attach` injects `DATABASE_URL` into `kapman-tradelog`; do not
commit database credentials to the repo.

3. Set the Basic Auth credentials used by `src/middleware.ts`:

```bash
fly secrets set BASIC_AUTH_USER='<user>' BASIC_AUTH_PASSWORD='<strong-pass>' -a kapman-tradelog
```

4. Deploy:

```bash
fly deploy -a kapman-tradelog
```

5. Verify the deployed app:

```bash
curl -sf https://kapman-tradelog.fly.dev/api/health | grep ok
curl -u '<user>:<strong-pass>' -sf https://kapman-tradelog.fly.dev/api/overview/summary | grep netPnl
fly checks list -a kapman-tradelog
```

### Clean redeploy

Use this after changing code or deployment config:

```bash
npm run typecheck
npm run lint
npm test -- --passWithNoTests
fly deploy -a kapman-tradelog
curl -sf https://kapman-tradelog.fly.dev/api/health | grep ok
curl -u '<user>:<strong-pass>' -sf https://kapman-tradelog.fly.dev/api/overview/summary | grep netPnl
```

Use the same Basic Auth username and password already stored in Fly secrets.
Only rerun `fly secrets set ...` when rotating credentials.
