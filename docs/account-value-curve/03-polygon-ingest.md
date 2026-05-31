# Story 03 — Equity Historical Marks: Massive S3 Flat-File Ingestion (TS port)

## Context primer

Read `00-overview.md` §7 (keys) and §9 (reference impl). We need daily OHLC for every
equity/ETF the accounts ever traded, written into `HistoricalMark` (story 01). The robust,
proven approach is **Massive/Polygon S3 flat files**: one gzipped CSV per trading day
containing *all* US equities. `kapman-trader` (Python sibling repo) already implements this;
this story **ports that logic to TypeScript** using `@aws-sdk/client-s3`. We are NOT using
the live MCP for history.

## Reference implementation (port these, do not reinvent)

Absolute paths in the sibling repo `kapman-trader`:

- `core/ingestion/ohlcv/s3_flatfiles.py`
  - Key layout: `{prefix}/{YYYY}/{MM}/{YYYY-MM-DD}.csv.gz`, default prefix
    `us_stocks_sip/day_aggs_v1`.
  - `list_available_dates_in_range()` — lists by `YYYY/MM/` prefix to avoid full-bucket
    scans. Port this paginated listing.
  - `get_s3_client()` — endpoint `S3_ENDPOINT_URL` (`https://files.massive.com`), bucket
    `flatfiles`, **path-style addressing**, signature v4. The AWS SDK v3 equivalent is
    `forcePathStyle: true` + `endpoint`.
- `core/ingestion/ohlcv/parser.py`
  - CSV columns: `ticker`, `open`/`o`, `high`/`h`, `low`/`l`, `close`/`c`, `volume`/`v`,
    `window_start` (nanosecond epoch). Port the column-fallback and dedup logic.
  - Filtering: `include_symbols` set restricts parsing to symbols we care about.

## Goal

A TypeScript module + CLI job that, given a set of equity symbols and a date range,
downloads each day's flat file once, parses rows for the requested symbols, and **upserts**
`HistoricalMark` rows (`assetClass = EQUITY`, `source = MASSIVE_S3`).

## Out of scope

- Options (story 07).
- Computing account values (story 04).

## Files to create

- `src/lib/marketdata/s3-flatfiles.ts` — S3 client, key building, date listing, gzip fetch.
- `src/lib/marketdata/equity-day-aggs-parser.ts` — CSV → parsed rows for requested symbols.
- `src/lib/marketdata/ingest-equity-marks.ts` — orchestration: range → upsert
  `HistoricalMark`.
- `scripts/ingest-equity-marks.ts` — `tsx` CLI wrapper (mirror `scripts/rebuild-pnl.ts`).
- Tests: `s3-flatfiles.test.ts`, `equity-day-aggs-parser.test.ts`.
- `.env.example` additions (below).
- `package.json`: add `@aws-sdk/client-s3` dependency and an `ingest:equity-marks` script.

## New env vars (add to `.env.example` with comments)

```
# Massive/Polygon S3 flat files (historical marks). Required only for the
# account-value-curve backfill; the rest of the app works without them.
S3_ENDPOINT_URL=https://files.massive.com
S3_BUCKET=flatfiles
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
POLYGON_S3_EQUITY_PREFIX=us_stocks_sip/day_aggs_v1
```

## Implementation notes

- **AWS SDK v3 client:**
  ```ts
  new S3Client({
    endpoint: process.env.S3_ENDPOINT_URL,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: ..., secretAccessKey: ... },
  });
  ```
- **Gzip:** stream `GetObjectCommand` body → `zlib.gunzipSync` (node built-in) → parse CSV.
  Use a small CSV parser; avoid heavy deps. A streaming line reader is fine — files are one
  day of US equities (manageable).
- **Date → close:** the flat file's bar is the daily aggregate; `close` is the EOD mark we
  store. Persist O/H/L/C/V all (H/L feed MFE/MAE in story 08).
- **markDate:** use the file's calendar date (from the S3 key), stored as `@db.Date`. Do not
  derive from `window_start` to avoid TZ drift.
- **Idempotent upsert:** `prisma.historicalMark.upsert({ where: { instrumentKey_markDate: {
  instrumentKey, markDate } }, ... })`. `instrumentKey = symbol.toUpperCase()` for equities.
- **Missing files:** a non-trading day (weekend/holiday) has no key → skip silently. A
  missing key for a trading day → log a warning and continue (do not abort the whole range).
- **Symbol filter:** pass the traded-symbol set as `include_symbols` so we don't store the
  entire market. Source set = distinct `Execution.symbol` where `assetClass = 'EQUITY'`
  (the CLI computes this when no explicit list is given).
- **Resumability:** because upsert is idempotent, re-running a range is safe. Log per-day row
  counts and a final summary (dates processed, rows upserted, symbols missing).

## CLI contract

```
npm run ingest:equity-marks -- --start 2023-01-01 --end 2024-12-31 [--symbols AAPL,MSFT]
# no --symbols  => all distinct equity symbols ever traded
# no --start    => earliest equity Execution.tradeDate
# no --end      => yesterday (UTC)
```

## Acceptance criteria

- [ ] `@aws-sdk/client-s3` added; `npm install` clean.
- [ ] Module downloads a day file, gunzips, parses, and filters to requested symbols.
- [ ] Upserts `HistoricalMark` rows idempotently (re-run produces no duplicates).
- [ ] Non-trading days and missing keys are skipped with a warning, not a crash.
- [ ] CLI defaults: all traded equity symbols, earliest trade date → yesterday.
- [ ] `.env.example` documents the new vars; missing vars produce a clear error (mirror
      `default_s3_flatfiles_config`'s "Missing required S3 env vars" message).
- [ ] `npm run typecheck && npm run lint && npm test` pass.

## Test plan

- `equity-day-aggs-parser.test.ts`: feed a small gzipped CSV fixture (build in-test with
  `zlib.gzipSync`), assert parsed rows for included symbols, column fallbacks (`o` vs
  `open`), invalid-row skipping, and dedup.
- `s3-flatfiles.test.ts`: unit-test pure helpers (`buildDayAggsKey`,
  `listAvailableDatesInRange` against a mocked paginator). Mock `S3Client.send`; no network.
- Manual smoke (documented, not CI): run the CLI for one symbol over one week against real
  credentials; confirm rows in `historical_marks`.

## Dependencies

Story 01 (the `HistoricalMark` table).
