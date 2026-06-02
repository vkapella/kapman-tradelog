# KapMan Trading Journal

Containerized Next.js MVP for importing broker statements, normalizing executions, matching FIFO lots, and surfacing setup analytics.

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

## Quickstart

1. `cp .env.example .env`
2. `docker compose up --build`
3. `curl -sf http://localhost:3002/api/health`
4. Open `http://localhost:3002`

For all operational procedures (restart, recovery, data backfills, deployment), see [RUNBOOK.md](RUNBOOK.md).

## UI target

Use [design/kapman_dashboard_mock_v7.html](design/kapman_dashboard_mock_v7.html) as the active UX skin target. Historical mockups are archived under `design/archived/`.
