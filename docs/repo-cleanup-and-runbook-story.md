# Story: Repo cleanup + consolidated operational RUNBOOK

> **How to run this:** Hand this whole file to Codex in Windsurf using the
> `docs/Codex_Kickoff Prompt_Durable_Template.md` wrapper (it tells Codex to read
> `AGENTS.md` first and follow the autonomous git/PR workflow). This story is
> docs-only — no application code, schema, or script logic changes.

---

## Goal

Make operations discoverable and the repo root tidy:

1. Replace the thin `RUNBOOK.md` (currently only the import/Prisma-stale-client
   case) with the **single authoritative operations runbook** — Appendix A of
   this story is the finished file; drop it in verbatim.
2. Trim `README.md` down to a quickstart that **links** to `RUNBOOK.md` instead
   of duplicating restart/recovery/Fly content.
3. Archive stale root-level status markers into `docs/archived/`.
4. Fix `docs/README.md` index gaps and the duplicate story-number collisions in
   `docs/account-value-curve/`.

## Out of scope

- No changes to `src/`, `prisma/schema.prisma`, `prisma/migrations/`, or
  `scripts/*.ts` logic.
- No changes to npm script **definitions** in `package.json`.
- No deletion of gitignored local data (`backups/`, `.next/`, fixtures).
- No new features, endpoints, or behavior changes.

## Files to change

**Replace**
- `RUNBOOK.md` — overwrite with Appendix A below (verbatim).

**Trim**
- `README.md` — keep: title/blurb, Prerequisites, Environment, a 4-step
  quickstart (`cp .env.example .env` → `docker compose up --build` → health curl
  → open `http://localhost:3002`), and the "UI target" line. Remove the
  "After a system restart", "Common recovery commands", "Troubleshooting import
  failures", "Scripts", and "Fly.io deployment" sections and replace them with a
  single line: `For all operational procedures (restart, recovery, data
  backfills, deployment), see [RUNBOOK.md](RUNBOOK.md).` Do not leave broken
  anchors — remove the in-page cross-links that pointed at the deleted sections.

**Archive (use `git mv` so history is preserved)**
- `DONE.md` → `docs/archived/DONE.md`
- `SPRINT1_DONE.md` → `docs/archived/SPRINT1_DONE.md`
- `inventory.md` → `docs/archived/inventory.md`
- `CHANGES.md` → `docs/archived/CHANGES.md`

**Doc index + numbering**
- `docs/README.md` — under a new "## Subsystems" (or extend existing lists),
  add entries for `account-value-curve/`, `seed-data/`, `testing/`,
  `reconciliation/`, and `Codex_Kickoff Prompt_Durable_Template.md`. Add a
  pointer to the new root `RUNBOOK.md`.
- `docs/account-value-curve/` — resolve the duplicate story numbers so build
  order is unambiguous (these are sub-notes, not standalone stories):
  - `git mv docs/account-value-curve/04-cash-rowtypes.md docs/account-value-curve/04a-cash-rowtypes.md`
  - `git mv docs/account-value-curve/07-opra-findings.md docs/account-value-curve/07a-opra-findings.md`
  - Update every reference to those two filenames (grep the repo) including the
    table and prose in `docs/account-value-curve/README.md` and `00-overview.md`.

## Delivery order

1. `git mv` the four archived files; fix any links that pointed at them
   (grep `DONE.md|SPRINT1_DONE.md|inventory.md|CHANGES.md`). Note: `CHANGES.md`
   is referenced by `DONE.md` and by `docs/archived/kapman_build_spec_v7_2.md` —
   keep those links valid after the move.
2. `git mv` the two `account-value-curve` sub-notes; fix references.
3. Overwrite `RUNBOOK.md` with Appendix A.
4. Trim `README.md`; point it at `RUNBOOK.md`.
5. Update `docs/README.md` index.
6. Run the validation gate.

## Acceptance criteria

- `RUNBOOK.md` contains all seven sections (A–G) from Appendix A.
- Every `npm run <script>` named in `RUNBOOK.md` exists in `package.json`
  (`rebuild:pnl`, `ingest:equity-marks`, `ingest:option-marks`,
  `backfill:value-snapshots`, `backfill:lot-excursions`, plus the lifecycle
  scripts). Every documented CLI flag matches the script source
  (`scripts/*.ts`): `ingest:equity-marks` → `--start/--end/--symbols`;
  `ingest:option-marks` → `--start/--end/--contracts/--source`;
  `backfill:value-snapshots` → `--accountIds/--start/--end`;
  `backfill:lot-excursions` → `--accountIds/--start/--end/--include-open`.
- The data-pipeline section documents the **ingest-marks-before-backfill**
  ordering rule and the **unpriced-lot** troubleshooting note.
- Repo root no longer contains `DONE.md`, `SPRINT1_DONE.md`, `inventory.md`,
  `CHANGES.md`; each exists under `docs/archived/` and `git log --follow`
  shows continuous history.
- `README.md` ops sections are replaced by a link to `RUNBOOK.md`; no broken
  relative links or dangling in-page anchors in `README.md` or `docs/README.md`.
- `docs/account-value-curve/` has no duplicate `04-`/`07-` story numbers; all
  references resolve.
- `npm run typecheck && npm run lint && npm test -- --passWithNoTests` pass
  (docs-only change → expected green).

## Test plan

- `grep -rn "npm run" RUNBOOK.md` and diff the script names against
  `package.json`'s `scripts` block.
- For each documented flag, confirm it appears in the matching `scripts/*.ts`
  `parseArgs`.
- Relative-link check on `README.md`, `RUNBOOK.md`, `docs/README.md`,
  `docs/account-value-curve/README.md` (no 404 paths).
- `git log --follow docs/archived/DONE.md` shows the pre-move history.
- Run the validation gate above.

---

# Appendix A — finished `RUNBOOK.md` (drop in verbatim)

````markdown
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

These power the Analysis page (account-value curve + MFE/MAE). They are **manual
jobs**, not part of the web deploy. Background:
[docs/account-value-curve/README.md](docs/account-value-curve/README.md).

### Prerequisites

Marks ingestion needs the Massive/Polygon S3 credentials in `.env` (see
`.env.example`): `S3_ENDPOINT_URL`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `POLYGON_S3_EQUITY_PREFIX`, `POLYGON_S3_OPTIONS_PREFIX`
(and optionally `POLYGON_API_KEY` for the option REST fallback). The rest of the
app works without them.

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
curl -sf https://kapman-tradelog.fly.dev/api/health | grep ok
```

Reuse the existing Fly secrets; only rerun `fly secrets set` to rotate.

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
````
