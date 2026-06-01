# Story 07 OPRA Findings

## Spike Date

2026-05-31

## Prefix

- Confirmed listable Massive/Polygon flat-file prefix: `us_options_opra/day_aggs_v1`.
- Verified key layout by listing January 2024: `us_options_opra/day_aggs_v1/YYYY/MM/YYYY-MM-DD.csv.gz`.
- January 2024 listing returned 21 trading-day files, starting with `2024-01-02.csv.gz`.

## Columns

S3 object download returned HTTP 403 with the locally configured plan, so the OPRA file header could not be directly read from S3 during the spike. The parser supports the same daily aggregate column families used by Massive/Polygon flat files:

- Contract identifier: `ticker` or `symbol`, expected as OCC ticker, for example `O:SPY260116C00500000`.
- OHLC: `open/high/low/close` or short-form `o/h/l/c`.
- Volume: `volume` or short-form `v`.

## Coverage and Fallback

- S3 listing is available, but `GetObject` for `us_options_opra/day_aggs_v1/2024/01/2024-01-02.csv.gz` returned HTTP 403 in local testing. This indicates the current credentials can enumerate OPRA keys but cannot read OPRA day files on the current plan.
- The implementation keeps the S3 path as the primary ingestion source and adds a bounded REST fallback via `--source rest` using Polygon aggregates for only the held contracts.
- REST fallback persists marks with `source = POLYGON_REST`; S3 ingestion persists marks with `source = MASSIVE_S3`.
- No full OPRA universe storage is performed. Both paths are filtered to explicit or discovered held option contracts.
- REST fallback smoke succeeded for one recent held contract over `2026-05-28` to `2026-05-29`, upserting 2 local marks.
- REST fallback for older `2024` option aggregate data returned a plan authorization error, so local historical coverage still depends on the configured Polygon plan.
- After confirming the plan includes a two-year historical window, retries inside that window succeeded:
  - REST fallback for `INTC|CALL|34|2024-07-19` over `2024-06-10` to `2024-06-14` upserted 5 marks.
  - S3 download for `us_options_opra/day_aggs_v1/2024/06/2024-06-10.csv.gz` succeeded and returned the expected OPRA aggregate header.
- Option mark ingestion now clamps requested/default start dates to the configured Polygon historical access floor. Defaults use a two-year rolling window and start one day after the boundary; override with `POLYGON_HISTORICAL_MARKS_START_DATE=YYYY-MM-DD` if Massive provides an account-specific fixed date.
