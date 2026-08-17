# KapMan Operations Runbook

Single source of truth for running, recovering, backfilling, and deploying the
KapMan Trading Journal. For app architecture and data model see
[docs/architecture.md](docs/architecture.md) and
[docs/data_model.md](docs/data_model.md). For the autonomous direct-to-main git
workflow see [AGENTS.md](AGENTS.md).

**Quick facts**

| Thing | Value |
|---|---|
| App URL (host) | `http://localhost:3002` (container serves `:3000`) |
| Health endpoint | `GET /api/health` → `{"status":"ok","db":"connected"}` |
| DB from host | `127.0.0.1:55432` |
| DB from inside containers | `db:5432` |
| App runtime volume | `kapman-tradelog_app-node-modules` |
| Postgres data volume | `postgres-data` (deleted only by `docker compose down -v`) |
| Local Postgres version | 16 (docker) — **production is 17**; see [Section D](#d-backup--recovery) |
| Prod DB backup archive | `../KapMan-DB-Archive/` (beside the repo) via `ops/archive-db-to-mac.sh` |

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

## D. Backup & recovery

Production holds irreplaceable imported trading history. Three independent
layers protect it; none substitutes for the others.

| Layer | What it is | Window | Survives loss of the Fly account |
|---|---|---|---|
| Fly volume snapshots | Block-level copy of the whole volume, automatic daily | 30 days | **No** |
| Mac archive | Verified logical `pg_dump`, portable anywhere | Kept indefinitely | Yes |
| Backblaze Personal Backup | Sweeps the Mac archive off-machine | ~30-day version history | Yes |

Snapshots are the undo button; the archive is the record. Use snapshots to
reverse a bad migration or rebuild from the last few weeks. Use the archive for
anything older, anything selective, or anything that must restore off Fly.

### Archive production to this Mac

```bash
ops/archive-db-to-mac.sh
```

Read-only against production. Dumps on the Postgres Machine (so `pg_dump`
always matches the server version), copies the file down, and refuses to
archive it unless the transfer is byte-exact, above a size floor, readable by
`pg_restore -l`, and holding the same table count production reported. Writes
three files to the archive directory (`../KapMan-DB-Archive/`, beside the repo):

| File | Purpose |
|---|---|
| `kapman_prod_<stamp>.dump` | PG17 custom-format dump |
| `kapman_prod_<stamp>.manifest.txt` | Row counts captured from production **at dump time** |
| `kapman_prod_<stamp>.sha256` | Integrity checksum |

The manifest is what makes a later restore verifiable without a second
production connection — compare restored counts against it.

The archive lives at `/Volumes/OWC Envoy Pro SX/App Development/KapMan-DB-Archive`
— beside the repo, deliberately **not inside it**. The script refuses to run if
its archive directory sits within any git working tree, because untracked dumps
are exactly what `git clean -fd` deletes and `git add -A` commits into history.

Backblaze Personal Backup covers the OWC volume, and that is the off-machine
copy of the archive.

Two properties of this location to keep in mind:

- **POSIX permissions are not enforced.** The OWC volume has
  `Owners: Disabled` (APFS), so the script's `chmod 700` is cosmetic — any
  process on this Mac can read the dumps. They hold complete trading history
  and account identifiers.
- **Same physical device as the working copy.** A single OWC failure takes out
  the repo and the local archive together. Backblaze (off-machine) and the Fly
  snapshots (Section D above) are what make that survivable — treat the local
  archive as convenience, not as an independent copy.

**The script never deletes anything.** At ~3 MB per dump, a decade of monthly
archives costs well under a gigabyte. Prune manually and deliberately if ever
needed — and note that deleting a local file also ages it out of Backblaze
after their version-history window.

### Restore rehearsal

Verified working 2026-08-02 against a full production dump.

> **Production is PostgreSQL 17.7; the local docker dev database is 16.** A
> PG17 dump cannot be restored into PG16. Always rehearse against
> `postgres:17-alpine` — never against the dev stack, which must stay untouched.

```bash
docker run -d --name kapman-restore-rehearsal -p 55433:5432 -e POSTGRES_PASSWORD=rehearsal postgres:17-alpine
docker cp ../KapMan-DB-Archive/<stamp>.dump kapman-restore-rehearsal:/tmp/prod.dump
docker exec kapman-restore-rehearsal createdb -U postgres kapman_restore
docker exec kapman-restore-rehearsal pg_restore -U postgres -d kapman_restore --no-owner --no-privileges /tmp/prod.dump
```

Row counts alone are not proof. Check financial and structural integrity too:

```bash
docker exec kapman-restore-rehearsal psql -U postgres -d kapman_restore -A -t \
  -c "select 'PL:', sum(realized_pnl) from matched_lots" \
  -c "select 'X:', md5(string_agg(broker_tx_id, ',' order by broker_tx_id)) from executions" \
  -c "select 'I:', count(*) from pg_indexes where tablename in (select relname from pg_stat_user_tables)" \
  -c "select 'F:', count(*) from pg_constraint where contype = 'f'" \
  -c "select 'M:', count(*) filter (where finished_at is null), count(*) from _prisma_migrations"
```

The 2026-08-02 rehearsal produced: realized P&L `143427.600000`, execution
checksum `5e60de0f885a28da632710eb54ca27bd`, 42 indexes, 17 foreign keys, 20
migrations with 0 unfinished. Compare row counts against the archive's
`.manifest.txt`.

Tear down when finished — the rehearsal container holds real trading data:

```bash
docker rm -f kapman-restore-rehearsal
```

### Fly volume snapshots

Automatic, incremental, encrypted, taken daily by Fly. Retention was raised
from the 5-day default to 30 days on 2026-08-02.

```bash
fly volumes snapshots list vol_vxm75kl6e611oww4 -a kapman-tradelog-db
fly volumes update vol_vxm75kl6e611oww4 --snapshot-retention 30 -a kapman-tradelog-db
```

Restore is **not** in place. You create a new volume from a snapshot, attach a
Machine to it, and repoint `DATABASE_URL`:

```bash
fly volumes create pg_data --snapshot-id <snapshot-id> -a kapman-tradelog-db -r iad
```

Limits worth knowing before you rely on this: daily granularity means up to ~24
hours of loss; you cannot restore a single table; the snapshot is a PG17 data
directory tied to Fly's `postgres-flex` image and is not portable off Fly; and
it lives in the same Fly account as the database it protects.

> **This restore path has never been rehearsed.** Unlike the archive restore
> above, it is documented from Fly's behavior, not from a run we have done.

### Known gaps

Tracked, not yet built:

- No scheduled/automated backup — `ops/archive-db-to-mac.sh` is manual today.
- No off-platform object-storage copy (B2/R2) independent of this Mac.
- No automated restore verification (`ops/verify-backup.sh`).
- No secrets inventory. The dump restores data, **not** `BASIC_AUTH_*`,
  `DATABASE_URL`, or the Massive S3 credentials — full recovery needs those
  documented by name, with values in a password manager.
- The Fly snapshot restore path is unrehearsed (above).

---

## E. Data pipeline — historical marks → value snapshots → excursions

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

`npm run deploy` runs this for you. To update the Machine on its own:

```bash
npm run deploy:market-data-scheduler -- kapman-tradelog
```

The command is idempotent: it creates the named `market-data-daily` Machine when
absent and otherwise updates its image, command, resource limits, schedule, and
non-secret environment, then **starts it once** to re-arm the schedule (see the
warning below). App-level Fly secrets are inherited by the Machine. That start
also runs the pipeline immediately, which no-ops when data is already current.

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

> **Deploy with `npm run deploy`, not bare `fly deploy`.**
>
> `npm run deploy` runs `fly deploy` and then the scheduler script, which points
> the `market-data-daily` Machine at the new image **and starts it once**. That
> final start is the part that matters: `fly machine update` uses `--skip-start`,
> and a Machine that is updated but never started keeps `schedule = daily` in its
> config while Fly never fires it. The pipeline then goes silent with no error
> anywhere — the last run stays `SUCCEEDED` while market data quietly ages.
>
> This is not hypothetical: production ran daily until the first post-deploy
> `machine update` on 2026-07-19, then sat stale for four weeks until
> 2026-08-16. `fly machine status <id>` showed `schedule: daily` the whole time
> with zero start events. Checking the schedule field is therefore *not* a valid
> health check — check start events or run history instead.
>
> The Diagnostics panel below reports this state as **Stale data**, and the
> freshness alert fires on it if alerting is configured.

### Scheduler status, run history, and alerts

Every attempt writes a durable row to `scheduled_pipeline_runs`: trigger,
requested and effective ranges, per-stage status and row counts, observed source
freshness, duration, and a sanitized failure message. A row is written as
`RUNNING` before work begins and finalized as `SUCCEEDED`, `NOOP`, `FAILED`, or
`SKIPPED_LOCKED`. A run whose process dies without finalizing is reclassified
`ABANDONED` by the next run once its lease has expired.

Read status in the app at **Diagnostics → Scheduled pipeline**, or via API:

```bash
curl -sf http://localhost:3002/api/scheduler/status | jq .data.health
```

```bash
curl -sf "http://localhost:3002/api/scheduler/runs?page=1&pageSize=20" | jq '.data[] | {startedAt, status, errorMessage}'
```

Both endpoints are account-independent and sit behind the app's Basic Auth gate.
Neither returns credentials, lease owners, or raw provider payloads.

`health` collapses run outcome and data freshness into one verdict:

| Health | Meaning | First action |
|---|---|---|
| `HEALTHY` | Last run finished and all sources are inside tolerance | None |
| `RUNNING` | A run holds the lease right now | Re-check after it finishes |
| `STALE` | A source is beyond the freshness tolerance | Confirm the Machine is armed, re-run the deploy script, then catch up |
| `FAILED` | Last run failed or was abandoned | Read the sanitized message, fix, re-run |
| `NEVER_RUN` | No history rows exist | Create the Machine, then run the pipeline once |

**Retention.** Finalized runs older than `MARKET_DATA_RUN_RETENTION_DAYS`
(default 90) are deleted at the end of each run. `RUNNING` rows are never
pruned, so an in-flight or stranded run cannot be lost before it is resolved.
Set the variable to a larger value to keep more history; pruning is skipped
entirely if it is not a positive integer.

**External alerts (optional).** Alerting is off until
`PIPELINE_ALERT_WEBHOOK_URL` is set; with it unset the pipeline behaves exactly
as before. When configured, the pipeline POSTs JSON to that URL for failed runs,
recovered abandoned runs, lock contention at or beyond
`PIPELINE_ALERT_LOCK_CONTENTION_THRESHOLD`, and freshness lag beyond
`PIPELINE_ALERT_FRESHNESS_LAG_DAYS`. An unchanged, still-firing alert is
suppressed for `PIPELINE_ALERT_REPEAT_MINUTES` (default 12h), and a single
recovery notice is sent once the condition clears. See `.env.example` for every
variable and its default.

Set them in production as non-secret Machine environment or Fly secrets:

```bash
fly secrets set PIPELINE_ALERT_WEBHOOK_URL='https://example.com/hook' -a kapman-tradelog
```

Then re-run `npm run deploy:market-data-scheduler` so the scheduled Machine
picks up the change.

Alert troubleshooting:

- **No alerts arriving** — confirm `alertsConfigured: true` in
  `/api/scheduler/status`. If false, the webhook variable is not visible to the
  process that runs the pipeline (the Machine, not just the web app).
- **Alert fired once and went quiet** — expected. It is deduplicated until the
  repeat window elapses or the condition materially changes.
- **No recovery notice** — recovery is sent only for an alert that was actually
  firing; a condition that never alerted has nothing to resolve.
- **Delivery errors** — logged as `alert_delivery_failed` with the transport
  error. Alert delivery never fails a pipeline run.

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

## F. Import troubleshooting

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

## G. Deployment (Fly.io)

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
npm run deploy -- kapman-tradelog
curl -sf https://kapman-tradelog.fly.dev/api/health | grep ok
```

`npm run deploy` chains `fly deploy` and the scheduler update so the second step
cannot be forgotten. The scheduler is deliberately unmanaged by `fly deploy`
itself, so running `fly deploy` alone still requires
`npm run deploy:market-data-scheduler` afterwards. Reuse the existing Fly secrets; only
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

## H. Reference

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
- **Backups:** see [Section D](#d-backup--recovery). Production archives go to
  `../KapMan-DB-Archive/` (beside the repo) via `ops/archive-db-to-mac.sh`. The in-repo `backups/`
  directory holds only historical ad-hoc dev dumps (gitignored) and is not part
  of the backup story.
- **ops scripts:** `ops/archive-db-to-mac.sh` — operational scripts that touch
  production live in `ops/`, deliberately outside `npm run` so they cannot be
  invoked by a blanket `npm run *` permission grant.
