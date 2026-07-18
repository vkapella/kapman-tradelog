# KapMan Operations Runbook

Single source of truth for running, recovering, backfilling, and deploying the
KapMan Trading Journal. For app architecture and data model see
[docs/architecture.md](docs/architecture.md) and
[docs/data_model.md](docs/data_model.md). For the autonomous git/PR workflow see
[AGENTS.md](AGENTS.md).

**Quick facts**

| Thing | Value |
|---|---|
| App URL (host) | `http://localhost:3002` (container serves `:3000`) |
| Health endpoint | `GET /api/health` → `{"status":"ok","db":"connected"}` |
| DB from host | `127.0.0.1:55432` |
| DB from inside containers | `db:5432` |
| App runtime volume | `kapman-tradelog_app-node-modules` |
| Postgres data volume | `postgres-data` (deleted only by `docker compose down -v`) |

---

## A. Local lifecycle

All commands run from the repo root:

```bash
cd "/Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog"
```

### First-time setup

```bash
test -f .env || cp .env.example .env   # create env file if missing
npm install                            # host-side scripts + validation
docker compose up --build              # app + db; runs prisma generate/migrate/seed, then next dev
```

Open `http://localhost:3002`. On startup the app container runs Prisma generate,
migrations, and seed automatically (seed parses `Cash Balance` `BAL` rows from
fixture statements into `daily_account_snapshots`).

### After a system reboot (preserve data)

1. Start Docker Desktop; wait until the engine is running.
2. `test -f .env || cp .env.example .env`
3. `docker compose up --build`  *(keep this terminal open)*
4. Verify (see Section B).

Do **not** run `docker compose down -v` for a normal restart — that deletes the
Postgres volume.

### Common controls

```bash
docker compose restart app                 # restart app only (keeps DB)
docker compose down                        # stop the stack (keeps volumes)
docker compose ps                          # container status
docker compose logs --tail=120 app         # recent app logs
```

Healthy state: both `kapman-tradelog-app-1` and `kapman-tradelog-db-1` show
`Up`, with the app mapping `0.0.0.0:3002->3000/tcp`.

### Refresh app runtime, keep DB data

Use when the app runs with stale dependencies / generated client:

```bash
docker compose down
docker volume rm kapman-tradelog_app-node-modules
docker compose up --build
```

### Full reset (DESTRUCTIVE — deletes local Postgres data)

Only when you intentionally want an empty database:

```bash
docker compose down -v
docker compose up --build
```

---

## B. Validation & smoke tests

Run before marking any change complete (also the gate in `AGENTS.md`):

```bash
npm run typecheck
npm run lint
npm test -- --passWithNoTests
```

Smoke-test a running stack:

```bash
curl -sf http://localhost:3002/api/health            # -> {"status":"ok","db":"connected"}
curl -sf http://localhost:3002/api/overview/summary | grep netPnl
```

---

## C. Database & Prisma

| Task | Command | Where |
|---|---|---|
| Create + apply a migration | `npx prisma migrate dev --name <snake_case>` | **Local only** |
| Apply committed migrations | `npx prisma migrate deploy` | Prod / container start |
| Regenerate client | `npm run prisma:generate` | Local |
| Run committed migrations (npm alias) | `npm run prisma:migrate` | Local / CI |
| Seed fixtures | `npm run db:seed` | Local |
| Reset local DB + reseed | `npx prisma migrate reset --force` | **Local only** |
| Inspect data | `npx prisma studio` | Local |

**Rules**

- `migrate dev` is local-only — it can rewrite migration history. **Never** run
  it against prod.
- Prod (Fly) only ever runs `migrate deploy`, via the `release_command` in
  `fly.toml` — it runs on every `fly deploy` before the new version goes live.
- `docker compose` runs `prisma migrate deploy` automatically on app start.
- New migration files (`prisma/migrations/`) must be committed and deployed
  **before** any job that writes those tables runs in prod.

---

## D. Data pipeline — historical marks → value snapshots → excursions

These power the Analysis page (account-value curve + MFE/MAE). Production runs
them automatically in the dedicated `market-data-daily` Fly Scheduled Machine.
The individual commands remain available for bounded recovery. Background:
[docs/account-value-curve/README.md](docs/account-value-curve/README.md).

### Prerequisites

Marks ingestion needs the Massive/Polygon S3 credentials in `.env` (see
`.env.example`): `S3_ENDPOINT_URL`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `POLYGON_S3_EQUITY_PREFIX`, `POLYGON_S3_OPTIONS_PREFIX`
(and optionally `POLYGON_API_KEY` for the option REST fallback). The rest of the
app works without them.

The scheduled job also accepts these optional settings:

- `MARKET_DATA_PUBLICATION_LAG_DAYS` — UTC calendar-day delay before a provider
  date is eligible; defaults to `2`, avoiding still-unpublished current-day files.
- `MARKET_DATA_PIPELINE_LEASE_MINUTES` — database lease duration preventing
  overlapping runs; defaults to `60`.

### Mandatory order

```
1. ingest:equity-marks      ─┐
2. ingest:option-marks       ├─ load historical_marks first
3. backfill:value-snapshots  ┘  (re-run after option marks land)
4. backfill:lot-excursions      (only prices lots that already have marks)
```

> **Why order matters:** `backfill:lot-excursions` and
> `backfill:value-snapshots` only compute for instruments that already have rows
> in `historical_marks`. If the Analysis page is empty or lots are flagged
> **unpriced**, you skipped (or under-ranged) the ingest steps — load marks
> first, then re-run the backfills.

### Commands & flags

```bash
# 1) Equity marks
npm run ingest:equity-marks -- --start YYYY-MM-DD --end YYYY-MM-DD [--symbols AAPL,MSFT]

# 2) Option marks   (--source s3|rest; defaults to plan-clamped S3)
npm run ingest:option-marks -- --start YYYY-MM-DD --end YYYY-MM-DD [--contracts <canonicalKey,...>] [--source s3]

# 3) Daily account-value snapshots (idempotent)
npm run backfill:value-snapshots -- [--accountIds D-68011053,...] [--start YYYY-MM-DD] [--end YYYY-MM-DD]

# 4) Per-matched-lot MFE/MAE excursions (idempotent)
npm run backfill:lot-excursions -- [--accountIds D-68011053,...] [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--include-open]
```

With Docker up, run these from the repo root, then **refresh the Analysis page**.

### Automatic production job

The finite orchestration command calculates independent equity and option
catch-up ranges, loads both mark sources, advances account values only through
the latest date covered by both required sources, rebuilds excursions, and exits:

```bash
npm run scheduled:market-data
```

The production Machine has no HTTP service, uses restart policy `never`, and is
started approximately once per day by Fly. A database lease prevents overlap.
Structured stage summaries are written to Fly logs; secrets are never logged.

Create the Machine once, and update it to the current production image after
every deploy:

```bash
npm run deploy:market-data-scheduler -- kapman-tradelog
```

The command is idempotent: it creates the named `market-data-daily` Machine when
absent and otherwise updates its image, command, resource limits, schedule, and
non-secret environment. App-level Fly secrets are inherited by the Machine.

Verify source and derived freshness without changing data:

```bash
fly ssh console -a kapman-tradelog
# inside a web Machine:
npm run verify:market-data
```

For a bounded manual recovery, run the same orchestration command inside Fly:

```bash
npm run scheduled:market-data -- --start YYYY-MM-DD --end YYYY-MM-DD
```

The explicit end is still capped by the configured publication lag. If a run is
terminated, its lease expires automatically; wait for the reported expiry or
adjust the lease only after confirming no other pipeline process is active.

### Recipes

Full refresh for a range (all accounts):

```bash
npm run ingest:equity-marks  -- --start 2025-09-01 --end 2026-05-31
npm run ingest:option-marks  -- --start 2025-09-01 --end 2026-05-31
npm run backfill:value-snapshots -- --start 2025-09-01 --end 2026-05-31
npm run backfill:lot-excursions
```

Excursions for one account:

```bash
npm run backfill:lot-excursions -- --accountIds D-68011053
```

Excursions for a date range:

```bash
npm run backfill:lot-excursions -- --start 2025-09-01 --end 2026-05-31
```

### Rebuild realized P&L (FIFO matched lots + setups)

Separate from the marks pipeline. Rebuilds the ledger and setup analytics for
every account (e.g. after a FIFO/normalization fix). Takes no flags:

```bash
npm run rebuild:pnl
```

### Reconciliation note

`reconcileDelta` / `unpricedPositionCount` on the value series are surfaced on
purpose. Non-zero values are expected (dividends, assignments, fees) — investigate,
don't panic. "Empty curve after deploy" usually means "no backfill yet," not a bug.

---

## E. Import troubleshooting

### Symptom

CSV upload returns `400` with Prisma errors like `Unknown argument
skippedDuplicateRows` or `Invalid prisma.import.upsert() invocation`.

### Cause

The app is running a stale generated Prisma client that doesn't match the schema.

### Recovery

```bash
docker compose restart app        # 1) try app-only restart, then re-test upload
```

If it still fails (refresh runtime, keep DB data):

```bash
docker compose down
docker volume rm kapman-tradelog_app-node-modules
docker compose up --build
```

### Verify

```bash
# Upload should return 200
curl -sS -o /tmp/upload.json -w '%{http_code}\n' \
  -F "file=@/path/to/statement.csv;type=text/csv" \
  http://localhost:3002/api/imports/upload

# Commit returns parsed/inserted/skipped_duplicate/failed counts
curl -sS -X POST http://localhost:3002/api/imports/<import_id>/commit
```

---

## F. Deployment (Fly.io)

Config lives in `fly.toml`: app `kapman-tradelog`, region `iad`, port `3000`,
`release_command = "npx prisma migrate deploy"`, health check `GET /api/health`.

### First deploy

```bash
fly auth login
fly apps create kapman-tradelog

fly postgres create
fly postgres attach <pg-app-name> -a kapman-tradelog   # injects DATABASE_URL

# Basic Auth gate (src/middleware.ts)
fly secrets set BASIC_AUTH_USER='<user>' BASIC_AUTH_PASSWORD='<strong-pass>' -a kapman-tradelog

# Marks pipeline secrets (only if running backfills against prod)
fly secrets set \
  S3_ENDPOINT_URL='https://files.massive.com' \
  S3_BUCKET='flatfiles' \
  AWS_ACCESS_KEY_ID='...' \
  AWS_SECRET_ACCESS_KEY='...' \
  POLYGON_S3_EQUITY_PREFIX='us_stocks_sip/day_aggs_v1' \
  POLYGON_S3_OPTIONS_PREFIX='us_options_opra/day_aggs_v1' \
  -a kapman-tradelog
# Add POLYGON_API_KEY only if option ingest uses the REST fallback.

fly deploy -a kapman-tradelog          # release_command runs migrate deploy first
```

Never commit DB credentials — `fly postgres attach` and `fly secrets set` own them.

### Verify the deploy

```bash
curl -sf https://kapman-tradelog.fly.dev/api/health | grep ok
curl -u '<user>:<strong-pass>' -sf https://kapman-tradelog.fly.dev/api/overview/summary | grep netPnl
fly checks list -a kapman-tradelog
```

### Clean redeploy

```bash
npm run typecheck && npm run lint && npm test -- --passWithNoTests
fly deploy -a kapman-tradelog
npm run deploy:market-data-scheduler -- kapman-tradelog
curl -sf https://kapman-tradelog.fly.dev/api/health | grep ok
```

The scheduler is deliberately unmanaged by `fly deploy`, so the scheduler update
command is mandatory after every deploy. Reuse the existing Fly secrets; only
rerun `fly secrets set` to rotate. Massive credentials should be read-only for
the flat-file bucket.

### Backfill against prod data

The web deploy creates empty tables — populate them deliberately.

**Option A (recommended for the one-time full backfill): run locally, pointed at prod DB.**

```bash
DATABASE_URL='<prod-connection-string>' npm run ingest:equity-marks
DATABASE_URL='<prod-connection-string>' npm run ingest:option-marks
DATABASE_URL='<prod-connection-string>' npm run backfill:value-snapshots
DATABASE_URL='<prod-connection-string>' npm run backfill:lot-excursions
```

Double-check you're pointed at the right DB before running.

**Option B: run inside Fly** (`tsx` is in the image). Fine for small/incremental
runs; prefer Option A for the heavy first backfill so you don't disrupt the web
service.

```bash
fly ssh console -a kapman-tradelog
# inside the machine:
npm run ingest:equity-marks && npm run backfill:value-snapshots
```

---

## G. Reference

- **Ports:** app host `3002` → container `3000`; DB host `127.0.0.1:55432` →
  container `db:5432`.
- **Env:** copy `.env.example` to `.env`. Required: `DATABASE_URL`, `NODE_ENV`,
  `NEXT_TELEMETRY_DISABLED`. Optional groups: MCP live quotes
  (`MCP_SERVER_URL`, `MCP_BEARER_TOKEN`), Basic Auth (`BASIC_AUTH_USER`,
  `BASIC_AUTH_PASSWORD`), marks pipeline (S3/Polygon vars above). When MCP is
  unset/unreachable, `/api/quotes` and `/api/option-quote` return
  `{ "error": "unavailable" }`; all other features work.
- **npm scripts:** `dev`, `build`, `start`, `lint`, `typecheck`, `test`,
  `rebuild:pnl`, `ingest:equity-marks`, `ingest:option-marks`,
  `backfill:value-snapshots`, `backfill:lot-excursions`, `prisma:generate`,
  `prisma:migrate`, `db:seed`.
- **Local backups:** ad-hoc SQL dumps live in `backups/` (gitignored). Not
  required for normal operation.
