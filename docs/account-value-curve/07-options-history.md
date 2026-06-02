# Story 07 — Option Historical Marks: OPRA Flat Files + OCC Parser

## Context primer

Read `00-overview.md` §7 (keys) and §9. This is the **riskiest** story — historical option
marks. The existing `kapman-trader` options code
(`core/providers/market_data/polygon_options.py`, `core/ingestion/options/`) uses the
**live snapshot** endpoint (`/v3/snapshot/options/{underlying}`) and is **not** a source of
historical OHLC — do not copy it for this. Instead, reuse the **same S3 flat-file machinery
from story 03** pointed at the **OPRA options** dataset.

## Goal

Daily OHLC for every option **contract** the accounts ever held, written into
`HistoricalMark` (`assetClass = OPTION`, `source = MASSIVE_S3`), keyed by the canonical option
`instrumentKey` (§7) so the story-04 engine can value option holdings.

## Recommended approach: spike first

Before committing to a full backfill, **spike against 5–10 real closed option lots**:

1. Pick lots from `MatchedLot` joined to their option `Execution`s.
2. Confirm the OPRA flat-file prefix and key layout in the Massive bucket (likely
   `us_options_opra/day_aggs_v1/{YYYY}/{MM}/{YYYY-MM-DD}.csv.gz`; verify by listing).
3. Confirm the CSV's contract identifier column (an OCC ticker like `O:SPY260116C00500000`)
   and OHLC columns.
4. Verify a known contract's close on a known date is plausible vs the executed price.

Write the spike findings into `07a-opra-findings.md` (prefix, columns, coverage gaps observed)
before building the full ingester. If OPRA flat files are unavailable on the plan, fall back
to Polygon REST `/v2/aggs/ticker/{occTicker}/range/1/day/{from}/{to}` per held contract
(document the switch; it's more calls but bounded by the number of distinct contracts held).

## OCC ↔ canonical conversion (shared contract — must be correct)

OCC ticker format: `O:` + underlying (padded) + `YYMMDD` + `C`/`P` + strike×1000 as 8 digits.

```
O:SPY260116C00500000
   └─SPY  └26 01 16  └C  └00500000  => strike 500.000
```

Implement and unit-test both directions:

```ts
// "SPY|CALL|500|2026-01-16"  <->  "O:SPY260116C00500000"
export function occToCanonical(occ: string): { instrumentKey: string; underlying: string; ... };
export function canonicalToOcc(instrumentKey: string): string;
```

- Strike: OCC integer = strike × 1000 (8 digits). Format canonical strike to match how
  holdings store it (`buildOptionInstrumentKey` uses the numeric strike, e.g. `500`, not
  `500.0`) — normalize to avoid join misses (e.g. trailing-zero/decimal mismatches). Add tests
  for fractional strikes (e.g. `7.5`).
- Expiration: OCC `YYMMDD` ↔ canonical `YYYY-MM-DD`.

> Join correctness lives or dies here. A mismatch between the strike formatting used by
> `compute-holdings-asof` (`instrumentKey`) and by this converter means option holdings will
> silently show as **unpriced**. Add a test that round-trips a holding's `instrumentKey`
> through `canonicalToOcc(occToCanonical(...))`.

## Files to create

- `src/lib/marketdata/occ-ticker.ts` + `occ-ticker.test.ts` — the converters above.
- `src/lib/marketdata/option-day-aggs-parser.ts` + test — parse OPRA day file rows; map OCC →
  canonical; filter to the held-contract set.
- `src/lib/marketdata/ingest-option-marks.ts` — orchestration → upsert `HistoricalMark`.
- `scripts/ingest-option-marks.ts` — `tsx` CLI.
- `.env.example`: add `POLYGON_S3_OPTIONS_PREFIX=us_options_opra/day_aggs_v1` (verify in
  spike) and, if using the REST fallback, `POLYGON_API_KEY`.
- `package.json`: `ingest:option-marks` script.
- `07a-opra-findings.md` — spike output.

## Implementation notes

- **Reuse** `src/lib/marketdata/s3-flatfiles.ts` from story 03 (parameterize the prefix); do
  not duplicate the S3 client/listing logic.
- Held-contract set = distinct option `instrumentKey`s from
  `computeHoldingsAsOf` across the full history (or distinct option `Execution`s). Convert each
  to OCC and filter the day file to those, so we don't store the entire OPRA universe (it is
  enormous — filtering is mandatory, not optional).
- `markDate` from the S3 key (calendar day). Upsert on `(instrumentKey, markDate)`.
- A contract with no row on a day (illiquid / no trades) → no mark; story 04 handles the gap
  via its lookback window / unpriced count.

## CLI contract

```
npm run ingest:option-marks -- [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--contracts <canonicalKey,...>]
# defaults: all held option contracts, earliest option trade date -> yesterday
```

## After this story

Re-run story 04 (`npm run backfill:value-snapshots`) — it is idempotent and will now populate
`optionValue`. The story-06 chart's options area fills in with no UI change.

## Acceptance criteria

- [ ] `occToCanonical`/`canonicalToOcc` correct and round-trip-tested, incl. fractional
      strikes; round-trips a real holding `instrumentKey`.
- [ ] Reuses story-03 S3 module (no duplicated S3 client).
- [ ] Filters OPRA day files to held contracts; upserts `HistoricalMark` (`OPTION`)
      idempotently.
- [ ] Spike findings recorded in `07a-opra-findings.md` (prefix, columns, coverage); REST
      fallback documented if used.
- [ ] `npm run typecheck && npm run lint && npm test` pass.

## Test plan

- `occ-ticker.test.ts`: known conversions both directions; fractional strike (`7.5`);
  round-trip property; underlying with non-3-letter symbol.
- `option-day-aggs-parser.test.ts`: gzipped CSV fixture with a couple of OCC rows → parsed,
  mapped to canonical keys, filtered to the held set.
- Manual smoke: ingest one real held contract over its holding window; confirm marks land and
  re-running story 04 produces non-zero `optionValue`.

## Dependencies

Stories 01, 03 (S3 module). Consumed by 04 (re-run) and 08.
