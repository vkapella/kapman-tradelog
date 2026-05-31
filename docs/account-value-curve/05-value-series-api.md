# Story 05 — API: GET /api/analysis/account-value-series

## Context primer

Read `00-overview.md` §3 (API conventions). With `AccountValueSnapshot` materialized by story
04, this story exposes it as a JSON series the Analysis page consumes. Follow the exact
patterns in `src/app/api/overview/summary/route.ts`: scope parsing via
`src/lib/api/account-scope.ts`, response via `detailResponse`/`errorResponse`, types in
`src/types/api.ts`.

## Goal

`GET /api/analysis/account-value-series?accountIds=<csv>&startDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>`
returns the daily, **account-summed** value series for the scope, plus per-day data-quality
fields and a small summary.

## Out of scope

- Computing values (story 04 owns that; this route only reads `AccountValueSnapshot`).
- MFE/MAE (story 08 adds its own endpoint).

## Files to create/modify

- `src/app/api/analysis/account-value-series/route.ts`
- `src/app/api/analysis/account-value-series/route.test.ts`
- `src/types/api.ts` — add the response type.

## Behavior

1. Parse `accountIds` (`parseAccountIds`), `startDate`/`endDate` (`parseDateRangeParams`,
   `toEndOfDayUtcIso`). No scope = all accounts (match `summary/route.ts` semantics).
2. Resolve internal account ids (`buildAccountIdWhere`) like `summary/route.ts` does.
3. Query `AccountValueSnapshot` for those accounts within the date range, ordered by
   `snapshotDate asc`.
4. **Aggregate across accounts per date** (the screen shows the combined portfolio):
   - `cash`, `stockEtf` (= equityValue), `options` (= optionValue), `total` summed.
   - `brokerNlv`: sum only when **every** in-scope account has a `brokerNlv` for that date;
     otherwise null (so the overlay doesn't show a misleading partial total). Track an
     `brokerNlvComplete` boolean per point.
   - `unpricedPositionCount`: sum.
   - `reconcileDelta`: `brokerNlv - total` when `brokerNlvComplete`, else null.
5. Return the series + a summary (first/last total, min/max, count of unpriced days).

## Response shape (add to `src/types/api.ts`)

```ts
export interface AccountValueSeriesPoint {
  date: string;                 // YYYY-MM-DD
  cash: string;                 // Decimal as string, 2dp
  stockEtf: string;
  options: string;
  total: string;
  brokerNlv: string | null;     // null unless all in-scope accounts have it that day
  reconcileDelta: string | null;
  unpricedPositionCount: number;
}

export interface AccountValueSeriesResponse {
  points: AccountValueSeriesPoint[];
  meta: {
    accountCount: number;
    startDate: string | null;
    endDate: string | null;
    daysWithUnpriced: number;
    firstTotal: string | null;
    lastTotal: string | null;
  };
}
```

Wrap in `detailResponse(payload)`.

## Notes

- Format money with `.toFixed(2)` for display fields, mirroring `summary/route.ts`'s
  `snapshotSeries` formatting (the curve doesn't need 6dp precision in the wire format).
- Empty result (no snapshots in range) → `points: []` with a populated `meta` (not a 404).
- This route is read-only and cheap; no MCP/S3 calls.

## Acceptance criteria

- [ ] Route returns the aggregated daily series for the scope + range.
- [ ] `brokerNlv`/`reconcileDelta` null unless all in-scope accounts have broker NLV that day.
- [ ] `unpricedPositionCount` summed per day; `meta.daysWithUnpriced` correct.
- [ ] Account + date scoping matches `summary/route.ts` semantics (no scope = all).
- [ ] Response typed in `src/types/api.ts`; `detailResponse` used.
- [ ] `npm run typecheck && npm run lint && npm test` pass.

## Test plan

`route.test.ts` (vitest), following `summary/route.test.ts` style (seed via Prisma test
helpers or mock). Cases:

1. Two accounts, overlapping dates → values summed per date.
2. One account missing broker NLV on a date → `brokerNlv` null that day even if the other has
   it.
3. Date-range filter excludes out-of-range snapshots.
4. Unpriced counts aggregate and surface in `meta.daysWithUnpriced`.
5. Empty range → `points: []`, valid `meta`.

## Dependencies

Stories 01, 04 (needs materialized `AccountValueSnapshot` rows).
