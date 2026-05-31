# Story 02 — As-of-Date Holdings Engine

## Context primer

Read `00-overview.md` §3, §4, §7. The existing `computeOpenPositions()`
(`src/lib/positions/compute-open-positions.ts`) produces **current** open positions by
netting all executions and subtracting **all** matched-lot quantity. It has no date
parameter and cannot answer "what was held on date D". This story adds that capability as a
**new pure function** without modifying the existing one.

## Goal

Add `computeHoldingsAsOf(executions, matchedLots, adjustments, asOfDate)` returning the set
of open positions (split EQUITY vs OPTION) **as they stood at end of `asOfDate`**, each
carrying `instrumentKey` (canonical, per §7), `netQty`, `costBasis`, `accountId`, and the
option metadata needed to value it.

## Out of scope

- Pricing/marks (story 03/04 join marks to these holdings).
- Cash (story 04 computes cash from `CashEvent`).
- Modifying `computeOpenPositions()` (leave it as the "current" path).

## Files to create

- `src/lib/positions/compute-holdings-asof.ts`
- `src/lib/positions/compute-holdings-asof.test.ts`

## Algorithm

Mirror `compute-open-positions.ts`, but make every quantity **date-aware**:

1. **Opens:** include an execution as an opener only if its `tradeDate <= asOfDate` AND it
   qualifies as an open (same predicate the existing engine uses: `openingClosingEffect ===
   "TO_OPEN"`, or the "plain equity buy" special case — copy that predicate exactly so
   behavior matches).
2. **Closes:** instead of subtracting *all* matched-lot quantity for an open execution,
   subtract only matched lots whose **close execution `tradeDate <= asOfDate`**. A lot that
   closes *after* `asOfDate` was still open on `asOfDate`, so its quantity must NOT be
   subtracted.
   - `MatchedLotRecord` carries `closeTradeDate` (string ISO) and `openExecutionId`. Build
     `matchedQtyByOpenExecutionId` from only the lots with `closeTradeDate != null &&
     closeTradeDate <= endOfDay(asOfDate)`.
   - Open lots (`closeTradeDate == null`) are never subtracted — they are still held.
3. **Adjustments:** apply only adjustments with `effectiveDate <= asOfDate`. Reuse
   `applyExecutionSplitAdjustment` and `applyPositionAdjustmentsWithWarnings`, but filter the
   adjustment list by date first. (Splits effective after `asOfDate` must not retroactively
   rescale historical holdings.)
4. **Grouping, netting, cost basis:** identical to the existing engine — group by
   `accountId + "::" + instrumentKey`, sum signed qty and `qtySigned * adjustedPrice *
   multiplier` (multiplier 100 for options). Drop positions with `netQty === 0`.

Return type: reuse `OpenPosition` from `@/types/api` (same shape the current engine returns)
so downstream marking code is shared.

```ts
export function computeHoldingsAsOf(
  executions: ExecutionRecord[],
  matchedLots: MatchedLotRecord[],
  adjustments: ManualAdjustmentRecord[],
  asOfDate: Date,
): OpenPosition[];
```

## Edge cases to handle (and test)

- **Date boundary:** compare against **end-of-day UTC** of `asOfDate` (reuse
  `toEndOfDayUtcIso` from `src/lib/api/account-scope.ts`). A trade on `asOfDate` counts as
  held that day.
- **Lot closes after asOf:** quantity stays open. (Core regression risk — test explicitly.)
- **Partial closes:** an open execution partially matched by lots, some closing before and
  some after `asOfDate` → only the before-closes reduce the held quantity.
- **Asof before any trade:** returns `[]`.
- **Split effective after asOf:** holdings on `asOfDate` use pre-split qty/price.
- **Plain equity buy** (the `openingClosingEffect === "UNKNOWN"` special case): preserve the
  exact predicate from the current engine.

## Acceptance criteria

- [ ] `computeHoldingsAsOf` exported with the signature above.
- [ ] `computeOpenPositions()` is unchanged.
- [ ] For an `asOfDate` >= the latest trade/close date, output **equals**
      `computeOpenPositions()` for the same inputs (parity test — guards against divergence).
- [ ] All edge cases above covered by unit tests.
- [ ] `npm run typecheck && npm run lint && npm test` pass.

## Test plan

`src/lib/positions/compute-holdings-asof.test.ts` (vitest), using hand-built
`ExecutionRecord`/`MatchedLotRecord` fixtures (mirror the style of existing ledger tests in
`src/lib/ledger/__tests__`). Minimum cases:

1. Single equity buy, no closes → held at and after buy date; not held before.
2. Lot opened day 1, closed day 5 → held on days 1–4, flat from day 5.
3. Partial close: open 100 on day 1, close 40 on day 3 → 100 held days 1–2, 60 from day 3.
4. Option position with multiplier 100 → cost basis includes ×100.
5. **Parity:** `asOfDate = far future` equals `computeOpenPositions()`.
6. Split adjustment effective day 10 → holdings on day 5 use unsplit basis.

## Dependencies

Story 01 (types only; no new tables used here, but `OpenPosition` and the record types must
exist — they already do in `@/types/api`).
