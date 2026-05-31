# Story 06 — Analysis-Page UI: Account Value Curve Widget

## Context primer

Read `00-overview.md` §3. The Analysis page is `src/app/analytics/page.tsx` (a client
component) and already consumes `useAccountFilterContext()` (selected accounts) and
`RangeFilterContext` (date range), and uses `applyAccountIdsToSearchParams` +
`applyRangeToSearchParams` to build query strings — copy that fetch pattern exactly. Charts
use `recharts` (already a dependency). Money formatting helpers live in
`src/components/widgets/utils` (`formatCurrency`, `safeNumber`).

## Goal

Add a widget that fetches `GET /api/analysis/account-value-series` (story 05) and renders:

- A **stacked area** of `cash` + `stockEtf` + `options` (the composition).
- A **total** line on top.
- An optional **broker NLV** overlay line (dashed) where present.
- A **data-quality caveat** when any day has `unpricedPositionCount > 0` or broker NLV is
  incomplete.

## Out of scope

- MFE/MAE visuals (story 08).
- Changing global layout/navigation beyond mounting the widget on the Analysis page.

## Files to create/modify

- `src/components/widgets/AccountValueCurveWidget.tsx` (new)
- `src/app/analytics/page.tsx` (mount the widget, wired to account + range context)
- Optional: `src/components/widgets/AccountValueCurveWidget.test.tsx` (render smoke test if
  the repo tests components; otherwise rely on typecheck/lint).

## Behavior

- Re-fetch when `selectedAccounts`, `range.startDate`, or `range.endDate` change (same
  dependency pattern as the existing `loadSetups` effect in `analytics/page.tsx`). Use
  `cache: "no-store"`.
- Build query with `applyAccountIdsToSearchParams(query, selectedAccounts)` and
  `applyRangeToSearchParams(query)`.
- Map `AccountValueSeriesPoint[]` to recharts data. Stacked `Area`s: `cash`, `stockEtf`,
  `options` (consistent colors; cash bottom). A `Line` for `total`. A dashed `Line` for
  `brokerNlv` (recharts skips null points).
- **Empty state:** if `points` is empty, show "No value history yet — run the value-snapshot
  backfill" (mirror existing empty-state copy tone).
- **Caveat banner:** if `meta.daysWithUnpriced > 0`, show a small inline note: "N days have
  positions without historical marks; those are valued at 0 and the total may be understated."
  If broker NLV is incomplete on shown days, note "broker NLV shown only on days where all
  selected accounts reported it."

## UI/format notes

- Tooltip: show date + cash/stock-ETF/options/total formatted via `formatCurrency`, plus
  `reconcileDelta` when present ("Broker vs reconstructed: ±$X").
- Use `ResponsiveContainer` like the existing analytics bar chart.
- Keep the KPI/section styling consistent with `KpiCard` and the surrounding page.
- No new chart library — recharts only.

## Acceptance criteria

- [ ] Widget fetches the series scoped to current accounts + range and re-fetches on change.
- [ ] Stacked area (cash/stock-ETF/options) + total line render; broker NLV overlay appears
      only where present.
- [ ] Empty and caveat states implemented.
- [ ] Mounted on the Analysis page without breaking existing widgets.
- [ ] `npm run typecheck && npm run lint && npm test` pass.

## Test plan

- Typecheck/lint are the primary gate (matches how the page is currently covered).
- If adding a render test, mock `fetch` to return a small `AccountValueSeriesResponse` and
  assert the chart container + caveat render. Otherwise document a manual check: select
  accounts/range, confirm the curve and tooltip.

## Dependencies

Story 05 (the API). Visually complete with equities only; option areas fill in after story 07
+ re-running the story-04 backfill.
