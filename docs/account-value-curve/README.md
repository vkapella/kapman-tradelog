# Account Value Curve & Excursion Analysis — Spec Index

This folder is a **Codex/Windsurf-ready specification** for adding two features to the
Analysis page:

1. A **daily account-value curve** over any selected accounts/range, split into
   **cash / stock-ETF / options / total**, with broker NLV shown as a reconciliation overlay.
2. **MFE / MAE** (max favorable / adverse excursion) **per matched lot**.

> **Start with [`00-overview.md`](./00-overview.md).** It is the shared context primer —
> locked decisions, what already exists, the canonical instrument-key contract, and the
> conventions every story must follow. Then work the stories in dependency order below.

## Stories

| # | File | Output | Depends on |
|---|---|---|---|
| 00 | [`00-overview.md`](./00-overview.md) | Primer / shared context | — |
| 01 | [`01-data-model.md`](./01-data-model.md) | Prisma models + migration | — |
| 02 | [`02-asof-holdings.md`](./02-asof-holdings.md) | `computeHoldingsAsOf()` | 01 |
| 03 | [`03-polygon-ingest.md`](./03-polygon-ingest.md) | Equity marks (S3 flat-file, TS port) | 01 |
| 04 | [`04-backfill-job.md`](./04-backfill-job.md) | Daily valuation → `AccountValueSnapshot` | 01,02,03 |
| 05 | [`05-value-series-api.md`](./05-value-series-api.md) | `GET /api/analysis/account-value-series` | 01,04 |
| 06 | [`06-analysis-ui.md`](./06-analysis-ui.md) | Stacked-area value-curve widget | 05 |
| 07 | [`07-options-history.md`](./07-options-history.md) | Option marks (OPRA + OCC parser) | 01,03 |
| 08 | [`08-mfe-mae.md`](./08-mfe-mae.md) | `LotExcursion` engine + MFE/MAE UI | 01,02,03,07 |

## Build order

```
01 ─┬─> 02 ─┐
    ├─> 03 ─┼─> 04 ─> 05 ─> 06     ← equity-only screen ships here (usable)
    │       │
    └────── 07 ───────┘            ← adds option marks; then re-run 04
02 + (03|07) ─> 08                  ← MFE/MAE
```

**Ship 01→06 with equities first** (cash + stock/ETF + total; options show as "unpriced"
until 07). Then 07 + re-run the story-04 backfill fills option values with no UI change;
08 adds MFE/MAE.

## How to feed this to Codex (Windsurf)

- Hand Codex **one story at a time**, in the order above. Each file is self-contained:
  *Context primer → Goal → Out-of-scope → Files → inline schema/algorithm → Acceptance
  criteria → Test plan → Dependencies*.
- Every story's gate is the same: `npm run typecheck && npm run lint && npm test`.
- Stories 03 and 07 cite exact reference files in the sibling **`kapman-trader`** repo — point
  Codex at those so it ports proven S3 flat-file logic instead of inventing it.
- Two empirical sub-tasks are intentionally deferred to in-repo notes (do them with the live
  DB/bucket in hand): `CashEvent.rowType` treatment → `04-cash-rowtypes.md`; OPRA
  prefix/columns → `07-opra-findings.md`.

---

## Deployment & migrations (local-first → Fly.io)

> **Short answer to "won't migrations need to occur?":** Yes — but the mechanism is already
> wired. The new tables migrate automatically. The *data backfill* is the part that is **not**
> automatic and must be run as a separate job.

### What changes across the stories (deploy-relevant)

| Change | Introduced in | Deploy impact |
|---|---|---|
| New tables (`HistoricalMark`, `AccountValueSnapshot`, `LotExcursion`) | 01 | A Prisma **migration** — applied automatically (see below) |
| New npm dep `@aws-sdk/client-s3` | 03 | Baked into the Docker image at build (`npm ci`) — no action |
| New env vars (S3/Polygon creds + prefixes) | 03, 07 | **Must be set as Fly secrets** before the backfill jobs can run |
| Ingestion + backfill CLI scripts (`tsx`) | 03, 04, 07, 08 | **Run manually** — not part of the web deploy |

### How migrations run here (already configured)

- **Local:** `scripts`/`dev:container` and the local flow use `prisma migrate dev` (creates
  the migration file) and `prisma migrate deploy` (applies committed migrations). `docker
  compose` runs `prisma migrate deploy` on app start.
- **Fly.io:** `fly.toml` has `release_command = "npx prisma migrate deploy"`. Fly runs this in
  a **release step on every `fly deploy`, before the new version goes live**, against the
  production `DATABASE_URL`. So committing the story-01 migration and deploying is enough to
  create the tables in prod — no manual prod migration step.

### Recommended sequence: validate locally, then promote

**1 — Create + apply the migration locally (story 01)**
```bash
docker compose up -d db                 # local Postgres on :55432 (or your existing local DB)
npx prisma migrate dev --name add_value_curve_models
npm run typecheck && npm run test
```
This writes a migration file under `prisma/migrations/` — **commit it**. (`migrate dev` is
local-only; never run it against prod. Prod uses `migrate deploy`.)

**2 — Set credentials locally, run a SMALL ingest + backfill (stories 03/04)**
```bash
# put S3_ENDPOINT_URL / S3_BUCKET / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
# and the *_PREFIX vars in your local .env (see .env.example after story 03)
npm run ingest:equity-marks  -- --symbols AAPL,MSFT --start 2024-01-01 --end 2024-01-31
npm run backfill:value-snapshots -- --start 2024-01-01 --end 2024-01-31
npm run dev                              # open the Analysis page, confirm the curve renders
```
Keep the first run tiny (a couple symbols, one month) to validate end-to-end before a
full-history pull.

**3 — Set the same secrets on Fly (one-time, before deploy)**
```bash
fly secrets set \
  S3_ENDPOINT_URL='https://files.massive.com' \
  S3_BUCKET='flatfiles' \
  AWS_ACCESS_KEY_ID='...' \
  AWS_SECRET_ACCESS_KEY='...' \
  POLYGON_S3_EQUITY_PREFIX='us_stocks_sip/day_aggs_v1' \
  POLYGON_S3_OPTIONS_PREFIX='us_options_opra/day_aggs_v1' \
  -a kapman-tradelog
```
(Add `POLYGON_API_KEY` only if story 07 uses the REST fallback.)

**4 — Deploy (migration runs automatically)**
```bash
fly deploy -a kapman-tradelog
# Fly runs `npx prisma migrate deploy` as the release_command → tables created in prod.
```

**5 — Run the backfill against prod data (separate, deliberate step)**

The tables exist after step 4, but they are **empty** — the curve/MFE-MAE screens will show
their empty state until a backfill populates them. Two safe ways to run the one-time historical
backfill:

- **Option A (recommended for the one-time full backfill): run locally, pointed at prod DB.**
  You control concurrency and don't load the web machine.
  ```bash
  DATABASE_URL='<prod-connection-string>' npm run ingest:equity-marks
  DATABASE_URL='<prod-connection-string>' npm run ingest:option-marks      # after story 07
  DATABASE_URL='<prod-connection-string>' npm run backfill:value-snapshots
  DATABASE_URL='<prod-connection-string>' npm run backfill:lot-excursions  # after story 08
  ```
  Use the prod DB's direct/external connection string; double-check you're pointed at the
  right DB before running.

- **Option B: run inside Fly.** `tsx` is present in the image (it's installed by `npm ci`), so:
  ```bash
  fly ssh console -a kapman-tradelog
  # then, inside the machine:
  npm run ingest:equity-marks && npm run backfill:value-snapshots
  ```
  Fine for incremental/daily runs; for the heavy first backfill prefer Option A or a one-off
  machine so you don't disrupt the running web service.

**6 — Keep it current (later).** The same jobs are idempotent; schedule a daily incremental
(yesterday's marks + a one-day valuation/excursion update). Wire it via a Fly scheduled
machine / cron once the one-time backfill looks right. Re-running story 04 after story 07 lands
is the mechanism that fills option values in.

### Gotchas to remember

- **Migration order:** the story-01 migration must be committed and deployed **before** any
  job that writes the new tables runs in prod. Step 1 + 4 cover this.
- **Empty ≠ broken:** after deploy, an empty Analysis curve means "no backfill yet," not a bug
  (story 06 ships an explicit empty state for exactly this).
- **Secrets before jobs:** the S3/Polygon secrets (step 3) gate the ingestion jobs — the web
  app and migrations work without them; only the marks pull needs them.
- **Don't `migrate dev` on prod:** prod only ever runs `migrate deploy` (via the
  release_command). `migrate dev` can reset/rewrite history and is local-only.
- **Reconciliation will show deltas:** `reconcileDelta`/`unpricedPositionCount` are surfaced
  on purpose. Non-zero values are expected (dividends, assignments, fees) — investigate, don't
  panic.
