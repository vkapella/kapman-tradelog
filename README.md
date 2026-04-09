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
- `http://localhost:3000`

On startup, the app container runs Prisma generate, migrations, and seed automatically.

## Scripts

- `npm run dev`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run prisma:migrate`
- `npm run db:seed`

## Fly.io scaffold

A baseline `fly.toml` is included for later deployment hardening.
