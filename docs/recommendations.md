# KapMan Recommendations

These recommendations focus on minimal, conservative changes that clarify behavior, improve metric accuracy, and remove brittleness without changing frameworks or broad architecture.

## 1. Remove Client-Side 1000-Row Aggregation Caps

Several widgets still fetch `page=1&pageSize=1000` and aggregate client-side. Datasets above 1000 rows will undercount metrics.

Affected examples:

- `HoldingDistributionWidget`
- `WinLossFlatWidget`
- `MonthlyPnlWidget`
- `SetupTagRollupWidget`
- `TopSetupsWidget`
- `SymbolPnlWidget`
- `ImportHealthWidget`
- `RecentExecutionsWidget`

Minimal change:

- Use `fetchAllPages()` for widgets that truly need all rows.
- Use smaller server-limited requests for recent-list widgets, for example `pageSize=10` for Recent Executions.
- Prefer small server aggregate endpoints later if performance becomes a problem.

## 2. Make Setup Date Filtering Trade-Date Based

`/api/setups` currently filters date ranges by `SetupGroup.createdAt`. Since setup groups are rebuilt derivations, this can make analytics date ranges depend on rebuild time rather than trade activity.

Minimal change:

- Filter setup groups through linked matched lots using close date, with open date as fallback when no close exists.
- Longer term, add explicit setup entry/exit date fields if the UI needs stable setup-level date semantics.

## 3. Align Win/Loss Streaks With Range Filters And API Shape

`StreakWidget` passes account and date range parameters, but `/api/overview/streaks` only applies account scope. The route also returns a raw object instead of the standard `{ data }` detail response.

Minimal change:

- Add `parseDateRangeParams()` handling to the streak route using the same matched-lot close/open date semantics as other matched-lot metrics.
- Return `detailResponse(payload)`.
- Remove the widget's fallback parser after the route is consistent.

## 4. Persist Or Surface Wash-Sale Flags Deliberately

`runFifoMatcher()` sets `washSaleFlagged` on matched-lot candidates and emits `WASH_SALE_FLAGGED`, but `MatchedLot` has no persisted wash-sale field and current warning rewrite logic does not reliably attach that warning to an import because the warning row ref combines open and close execution ids.

Minimal change:

- Add a nullable or default-false `washSaleFlagged` field to `MatchedLot`, or
- Persist wash-sale warnings in diagnostics through a dedicated warning mapping that can resolve both open and close execution ids.

Do not adjust P&L for wash sales unless a future requirement explicitly changes that rule.

## 5. Standardize Account Identifier Semantics In URLs

The app uses internal `Account.id` for `accountIds`, external broker ids for some `account` filters, and renders links that sometimes pass internal ids through an `account` parameter.

Minimal change:

- Treat `accountIds` as the only internal-id API/query parameter.
- Treat `account` as external broker account id only where still needed for backward compatibility.
- Update drill-through links to use `accountIds` or omit redundant account filters when an execution/setup id is already unique.

This reduces brittle links and avoids filters that silently do nothing.

## 6. Invalidate Position Snapshots After Destructive Data Changes

Import commit triggers an asynchronous position snapshot compute. Import delete and manual ledger rebuild rebuild derived ledger/setup data but do not consistently invalidate or recompute position snapshots.

Minimal change:

- After committed import deletion, trigger `/api/positions/snapshot/compute` for the affected account or mark cached snapshots stale.
- After manual ledger rebuild, invalidate open-position localStorage for that account and trigger a snapshot recompute.

## 7. Clarify TTS Gross Proceeds Proxy

`/api/tts/evidence` calculates gross proceeds as `abs(quantity) * price` and intentionally does not apply the option `100` multiplier. The UI labels this as gross trading proceeds, which can be read as actual notional proceeds.

Minimal change:

- Rename the label to "Gross Proceeds Proxy" everywhere, or
- Add a second metric that applies the option multiplier and label the current one as premium-per-contract-share proxy.

The current field is useful, but the label should match the calculation.

## 8. Unify Setup Win-Rate Semantics

Persisted setup metrics calculate win rate as `wins / (wins + losses)`, excluding flats. The in-memory setup inference result has a helper that calculates `wins / lots`, including flats, before persisted metrics are recomputed.

Minimal change:

- Change the inference helper to use the same denominator as persisted setup metrics, or
- Remove unused win-rate fields from the inference result to avoid future misuse.

## 9. Give Diagnostics Explicit Counts Over Ratios

Diagnostics already exposes unmatched close count, partial match count, and grouped warning signals. The matching coverage ratio can still be misread because partial closes and multi-lot closes are better represented by explicit counts.

Minimal change:

- Keep the ratio, but make UI copy and help text emphasize unmatched close count, partial match count, and grouped case files first.
- Add help text explaining that matching coverage is a coarse health signal, not an accounting reconciliation percentage.

## 10. Use A Stable Multi-Account Chart Palette

`EquityCurveWidget` alternates between two colors for per-account lines. Three or more accounts become visually ambiguous.

Minimal change:

- Define a CSS-variable palette array and cycle through at least six distinct semantic colors.
- Reuse the same palette in any future per-account chart.

## 11. Document Date Semantics In API Help Text

Different endpoints use different date anchors:

- executions use event timestamp or trade date
- matched lots usually use close date, with open date fallback in some paths
- setups currently use created date
- snapshots use snapshot dates or snapshot compute time

Minimal change:

- Add short help text or tooltip copy where a date range affects the page.
- Once setup date filtering is changed, document that setup ranges are trade-date based.

## 12. Prefer Server-Side Shared Aggregates For Reused Metrics

The dashboard KPI registry, Analytics page, widgets, and TTS page repeat several calculations. Some are already centralized server-side; others are still repeated client-side.

Minimal change:

- First replace capped client fetches with `fetchAllPages()`.
- Then promote the most reused metrics to small server aggregate endpoints when necessary.
- Keep formulas in one module per domain, not inside page components.
