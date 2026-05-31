# Story 08 — MFE / MAE per Matched Lot + UI

## Context primer

Read `00-overview.md` §1, §8 (definitions). MFE = Maximum Favorable Excursion (best
unrealized gain during a lot's holding window); MAE = Maximum Adverse Excursion (worst
unrealized loss). Computed **per `MatchedLot`** using daily **high/low** from `HistoricalMark`
(stories 03 + 07). Results persist to `LotExcursion` (story 01) and surface on the Analysis
page.

## Goal

1. A compute engine that, for each closed `MatchedLot`, walks its holding window day-by-day
   and finds the favorable/adverse extremes, writing `LotExcursion`.
2. A CLI job to (re)compute excursions for all lots.
3. UI: per-lot MFE/MAE columns + a small distribution visual on the Analysis page.

## Out of scope

- Open (unclosed) lots may optionally be included (window end = today); make it a CLI flag,
  default closed-only.
- Intraday excursion (decision: daily high/low only).

## Excursion math

For a lot with open execution price `entry`, signed direction (long if net long, short if net
short), quantity `qty`, multiplier `mult` (100 for options, 1 equity), over trading days `d`
in `[openTradeDate, closeTradeDate]` (inclusive) with marks `high_d`, `low_d`:

- **Long:**
  - favorable extreme price = `max over d of high_d`; `MFE$ = (favHigh - entry) * qty * mult`
  - adverse extreme price = `min over d of low_d`; `MAE$ = (advLow - entry) * qty * mult`
- **Short:** signs invert:
  - `MFE$ = (entry - min low_d) * qty * mult`
  - `MAE$ = (entry - max high_d) * qty * mult`
- `MFE$ >= 0` and `MAE$ <= 0` in the normal case; store raw computed values regardless.
- `mfePct = MFE$ / |costBasis|`, `maePct = MAE$ / |costBasis|` (null if cost basis 0).
- `mfeDate` / `maeDate` = the day the extreme occurred.
- `pricedDays` / `unpricedDays` = window days with / without a usable mark. If
  `pricedDays == 0`, write the row with zeros and `unpricedDays` set (so the UI can flag "no
  marks").

Instrument: a lot's `instrumentKey` comes from its open execution (equity symbol or canonical
option key per §7). Use the same lookback/window rules story 04 uses for missing days.

## Files to create/modify

- `src/lib/analysis/compute-lot-excursion.ts` + `compute-lot-excursion.test.ts` — pure engine
  given (lot, entry, direction, marks-by-date).
- `src/lib/analysis/backfill-lot-excursions.ts` — orchestration over `MatchedLot`s.
- `scripts/backfill-lot-excursions.ts` — `tsx` CLI; `package.json` script
  `backfill:lot-excursions`.
- `src/app/api/analysis/excursions/route.ts` (+ test) — read endpoint, OR extend
  `/api/matched-lots` to include `excursion` (prefer a dedicated route to avoid disturbing the
  existing matched-lots contract). Add response type to `src/types/api.ts`.
- UI: `src/components/widgets/ExcursionWidget.tsx` mounted on `src/app/analytics/page.tsx`,
  plus MFE/MAE columns in the matched-lots table if one is shown there.

## UI

- Per-lot: MFE$, MAE$, MFE%, MAE% columns (sortable, consistent with the existing analytics
  table sorting in `analytics/page.tsx`).
- Distribution visual (recharts): e.g. a scatter of MFE% (y) vs realized return, or paired
  bars of MFE/MAE per symbol/setup. Keep it simple; reuse the page's chart styling.
- Flag lots with `unpricedDays > 0` (excursion may be understated).

## Performance

Batch-load all `MatchedLot`s (with open/close execution dates, price, qty, instrument) and all
relevant `HistoricalMark` rows once; build an in-memory marks map keyed by
`instrumentKey → date → {high, low}`. Compute in memory; bulk upsert `LotExcursion`.

## Acceptance criteria

- [ ] Engine computes MFE/MAE ($ and %), extreme dates, priced/unpriced day counts, for long
      and short, equity and option (×100).
- [ ] Excursions persist to `LotExcursion` (1:1 with `MatchedLot`); CLI is idempotent.
- [ ] Read endpoint returns per-lot excursions scoped by account/date/setup like sibling
      analytics routes.
- [ ] Analysis page shows per-lot MFE/MAE + a distribution visual; flags unpriced windows.
- [ ] `npm run typecheck && npm run lint && npm test` pass.

## Test plan

`compute-lot-excursion.test.ts` (vitest):

1. Long equity, marks rising then falling → MFE at the peak high, MAE at the trough low;
   correct dates.
2. Short option (×100) → signs invert; MFE from the lowest low.
3. Window with a missing mark day → counted in `unpricedDays`, not crashing.
4. Zero-cost-basis edge → `mfePct`/`maePct` null.
5. `pricedDays == 0` → zeros + unpriced flag.

## Dependencies

Stories 01, 02, and marks from 03 (equity) and 07 (option). Equity-only MFE/MAE can ship
before 07; option lots will show `unpricedDays` until option marks exist.
