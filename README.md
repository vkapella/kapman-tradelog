# KapMan Trading Journal

Containerized Next.js MVP for importing broker statements, normalizing executions, matching FIFO lots, and surfacing setup analytics.

## UI target

Use [design/kapman_dashboard_mock_v6.html](design/kapman_dashboard_mock_v6.html) as the visual hierarchy target for page structure and card/table emphasis.

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

## Local development

1. Install dependencies:

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

1. Authenticate and initialize the app:

```bash
fly auth login
fly launch
```

2. Set runtime database connection (Fly secrets or managed Postgres):

```bash
fly secrets set DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>?sslmode=require
```

3. Deploy:

```bash
fly deploy
```

`fly.toml` is configured for region `iad` with an HTTP health check on `/api/health`.
