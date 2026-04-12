# KapMan v7.2 As-Built Inventory

Date: 2026-04-12
Scope: current v7.2 implementation in this repository, audited against `docs/kapman_build_spec_v7.md`, `docs/kapman_codex_master_prompt_v7.md`, `docs/kapman_github_issues_v7.md`, and the PRs merged after the original v7 inventory was created.

## Purpose

This document records what the current v7 app actually ships today:

- all navigable v7 screens and redirects
- the dashboard KPI strip and all 15 supported widgets
- every current screen-level metric, chart, table, and indicator
- each item’s data source and calculation path
- how to interpret each item
- the main strengths and weaknesses of the current implementation
- notable differences between the v7 target spec and current as-built behavior
- the v7.2 additions that landed after the original inventory, including manual adjustments, reconciliation, drill-through, and ledger replay changes

## Audit Basis

Inspected implementation paths:

- routes: `src/app/**`
- screen panels: `src/components/**`
- widgets: `src/components/widgets/**`
- hooks: `src/hooks/**`
- shared navigation/context: `src/components/root-shell.tsx`, `src/components/sidebar-nav.tsx`, `src/components/account-selector.tsx`, `src/contexts/AccountFilterContext.tsx`
- API routes: `src/app/api/**`
- calculation helpers: `src/lib/positions/compute-open-positions.ts`, `src/lib/mcp/market-data.ts`
- adjustment and reconciliation helpers: `src/lib/adjustments/**`, `src/lib/reconciliation/**`
- Prisma schema for account/id lineage only: `prisma/schema.prisma`

## Route Inventory

| Route | Current behavior |
|---|---|
| `/` | Redirects to `/dashboard` |
| `/dashboard` | v7 landing page with KPI strip and widget grid |
| `/analytics` | v7 analytics screen |
| `/positions` | v7 open positions screen |
| `/trade-records` | v7 merged T1/T2/T3 screen |
| `/imports` | v7 tabbed imports screen |
| `/adjustments` | v7.2 manual adjustments screen with preview, create, reverse, and replayed rebuilds |
| `/tts-evidence` | v6-style data page wrapper plus TTS evidence panel |
| `/diagnostics` | v6-style data page wrapper plus diagnostics panel |
| `/executions` | Redirects to `/trade-records?tab=executions` |
| `/matched-lots` | Redirects to `/trade-records?tab=matched-lots` |
| `/setups` | Redirects to `/trade-records?tab=setups` |

## Shared Data Lineage

| UI surface | Endpoint / hook | Server-side source |
|---|---|---|
| Sidebar counts | `/api/page-stats`, `/api/overview/summary` | `Account`, `Import`, `DailyAccountSnapshot`, `Execution`, `MatchedLot`, `SetupGroup` |
| Dashboard KPI strip | `/api/overview/summary` | `Execution`, `MatchedLot`, `SetupGroup`, `Import`, `DailyAccountSnapshot` |
| Dashboard widgets | Mixed: `/api/overview/summary`, `/api/overview/reconciliation`, `/api/imports`, `/api/executions`, `/api/matched-lots`, `/api/setups`, `/api/diagnostics`, `/api/overview/streaks`, quotes hooks, open-position adjustment helpers | Mixed DB reads plus quote proxy routes, manual-adjustment replay, and reconciliation overlays |
| Analytics page | `/api/setups`, `/api/matched-lots`, `/api/diagnostics` | `SetupGroup`, `MatchedLot`, setup inference diagnostics |
| Open Positions page | `useOpenPositions()`, `/api/adjustments`, `/api/quotes`, `/api/option-quote` | `Execution`, `MatchedLot`, `ManualAdjustment`, quote proxy routes |
| Trade Records / T1 | `/api/executions` | `Execution` |
| Trade Records / T2 | `/api/matched-lots` | `MatchedLot` + linked executions |
| Trade Records / T3 | `/api/setups`, `/api/setups/:id` | `SetupGroup` + linked matched lots/executions |
| Imports page | `/api/imports`, `/api/imports/upload`, `/api/imports/:id/commit`, `/api/imports/adapters` | `Import`, adapter registry, parser/ledger rebuild flows |
| Adjustments page | `/api/adjustments`, `/api/adjustments/preview`, `/api/adjustments/:id/reverse` | `ManualAdjustment`, `Execution`, ledger rebuild flows |
| Cash events ledger | `/api/cash-events` | `CashEvent` |
| TTS Evidence page | `/api/page-stats`, `/api/tts/evidence` | `Execution`, `MatchedLot` |
| Diagnostics page | `/api/page-stats`, `/api/diagnostics` | `Import`, `Execution`, `MatchedLot`, rerun setup inference |
| Quotes | `/api/quotes`, `/api/option-quote` | `src/lib/mcp/market-data.ts` -> MCP market-data tools |

## Cross-Cutting As-Built Notes

### 1. Account IDs are mixed internally and externally

The app currently mixes:

- internal account primary keys: `Account.id` stored on `Execution.accountId`, `MatchedLot.accountId`, and `SetupGroup.accountId`
- external broker account IDs: `Account.accountId` exposed on imports and snapshots

Current consequences:

- the global account selector hydrates from executions/imports and keeps an internal-to-external map
- some surfaces display external IDs correctly: `AccountBalancesWidget`, snapshot-based views, adjustment ledger account values
- some surfaces still display internal IDs directly: executions table account column, setups API records, open positions table account column

Interpretation:

- when an account label looks like a UUID-like value, it is the internal DB key, not the broker account number
- when it looks like the broker account number, it came through the `Account.accountId` path or was resolved through the account mapping helper

Strength:

- the context provider bridges enough of the mismatch for most filtering to work

Weakness:

- displayed account labels are still inconsistent across screens

### 2. Many client aggregates are capped at `pageSize=1000`

Widgets and several screens fetch `pageSize=1000` and aggregate client-side.

Affected examples:

- account selector hydration
- open positions computation
- most dashboard widgets
- analytics charts/table inputs
- TTS readiness widget
- import history show-all mode
- adjustments history show-all mode
- trade-records show-all mode

Interpretation:

- the current implementation assumes 1000 rows is effectively “all rows”

Strength:

- simple implementation and responsive client-side grouping on current data sizes

Weakness:

- large datasets can silently truncate widget and chart totals once rows exceed 1000

### 3. Quote integration differs from the v7 build spec

Current as-built behavior:

- `/api/quotes` and `/api/option-quote` do not call a direct Schwab OAuth module
- both routes call `src/lib/mcp/market-data.ts`
- `src/lib/mcp/market-data.ts` calls MCP tools through `callMcpTool("get_quotes")` and `callMcpTool("get_option_chain")`

Still true in the current app:

- both routes cache successful results for 30 seconds
- both routes return `{ "error": "unavailable" }` with HTTP 200 when live data is unavailable

Strength:

- live quote fallback behavior matches the UX goal

Weakness:

- implementation is coupled to MCP availability instead of the direct Schwab REST/OAuth path described in the v7 spec

### 4. Global account selector coverage is partial

| Surface | Uses global selector? | Notes |
|---|---|---|
| Dashboard widgets | Mostly yes | `Diagnostics Badge`, `Win / Loss Streak`, and `Portfolio Reconciliation` stay global |
| Dashboard KPI strip | No | Always global summary |
| Analytics page | Partially | P&L/win-rate charts filter by selector; diagnostics-derived KPI counts stay global |
| Open Positions page | Yes | Position rows and marks filter by selector |
| Trade Records | No | Uses local account filters only |
| Imports page | No | Uses local account filter only |
| Adjustments page | Partially | Account selection is selector-fed, but the ledger list is not globally filtered |
| TTS Evidence page | No | Global only |
| Diagnostics page | No | Global only |
| Sidebar counts/footer | No | Global only |

## Shell Inventory

### Sidebar

| Item | Source | Calculation / display logic | Interpretation |
|---|---|---|---|
| Trade Records badge | `/api/overview/summary` | `executionCount` | Total execution rows in the system |
| Imports badge | `/api/page-stats` | `importTotal` | Total imported statement records |
| Footer account count | `/api/page-stats` | `accountTotal` | Number of account rows |
| Footer snapshot count | `/api/page-stats` | `snapshotTotal` | Number of daily snapshot rows |

Strengths:

- all counts are DB-backed, not inferred client-side
- navigation groups are stable and consistent with the current route map

Weaknesses:

- counts are always global; selector state does not change them
- the Trade Records badge uses execution count, not a combined T1/T2/T3 count

### Topbar

| Item | Source | Calculation / display logic | Interpretation |
|---|---|---|---|
| Page title | `src/lib/navigation.ts` | Matched from pathname against nav config | Current route title |
| Context tags | `src/lib/navigation.ts` | Static per-route labels like `KPI strip`, `Widget grid`, `T1`, `T2`, `T3`, `Audit trail`, and `Overrides` | Descriptive route context only |
| Account selector label | `AccountFilterContext` | `Accounts: none`, `Accounts: all (N)`, or `Accounts: selected/available` | Current account selector state |
| Refresh button | Browser | `window.location.reload()` | Full-page refresh |

Strengths:

- title changes reliably by route
- selector is available on every screen in the shell

Weaknesses:

- tags are static labels, not live metrics
- refresh is coarse-grained; it reloads the full page

### Global Account Selector

| Item | Source | Calculation / display logic | Interpretation |
|---|---|---|---|
| Available accounts | `/api/executions?pageSize=1000` plus `/api/imports?pageSize=1000` fallback | unique sorted account IDs; imports backfill when executions do not exist yet | Accounts that can be selected globally |
| Selected accounts | local state in `AccountFilterContext` | defaults to all available accounts | Current global filter set |
| External mapping | imports keyed by `importId` | bridges execution internal account IDs to broker account IDs | Lets snapshot/account-balance views resolve external IDs |

Strengths:

- sensible default: all accounts selected
- works even before executions exist because imports backfill account discovery

Weaknesses:

- depends on 1000-row fetches
- current UI exposes ID inconsistencies instead of a single normalized account label strategy

## Dashboard

### Dashboard KPI Strip

Current location: `/dashboard`
Current source: `/api/overview/summary`
Current account-filter behavior: global only, not selector-aware

| KPI | Calculation | Interpretation |
|---|---|---|
| Realized P&L | `sum(Number(matchedLot.realizedPnl))`, formatted to 2 decimals server-side | Total realized P&L across all matched lots |
| Executions | `prisma.execution.count()` | Count of T1 execution rows |
| Matched Lots | `matchedLots.length` from DB query | Count of T2 rows |
| Setups | `prisma.setupGroup.count()` | Count of T3 setup groups |
| Average Hold Days | `sum(matchedLot.holdingDays) / matchedLots.length`, 2 decimals | Average holding period across matched lots |
| Snapshots | `prisma.dailyAccountSnapshot.count()` | Total snapshot row count |

Strengths:

- DB-backed summary instead of client-side approximation
- fast single endpoint for the main landing page

Weaknesses:

- ignores global account selector
- Realized P&L is still realized only; open-position mark-to-market lives in the positions and reconciliation surfaces
- the strip does not expose snapshot-series detail, only the aggregate count

### Widget Support Summary

Current supported widget count: 16
Default first-visit layout: `equity-curve`, `account-balances`, `win-loss-flat`, `holding-dist`, `top-setups`, `import-health`
The widget picker also includes `portfolio-reconciliation`, `recent-execs`, `open-pos-summary`, `scatter`, and `streaks` beyond the default first-visit layout.

Current widget layout behavior:

- drag/reorder supported
- add/remove supported
- layout persisted in `localStorage` under `kapman_dashboard_layout`
- duplicate widgets are allowed

### Widget Inventory

#### 1. Equity Curve

Source: `/api/overview/summary` -> `snapshotSeries[]`
Account-filter behavior: selector-aware through `isSelectedAccount()`

| Displayed item | Calculation | Interpretation |
|---|---|---|
| Combined line | Group snapshot rows by `snapshotDate.slice(0, 10)` and sum balances across selected accounts | Daily combined cash-equity curve using snapshot balances |
| Per-account lines | Same grouped rows, but separate line per account ID | Daily balance trajectory by account |
| X axis | Snapshot date | Calendar ordering of snapshot points |
| Y axis | Snapshot balance values | Balance magnitude |

Strengths:

- selector-aware even though snapshots use external account IDs
- combined/per-account toggle is useful for multi-account review

Weaknesses:

- grouped by date only; intra-day ordering is not represented
- the curve reflects the full snapshotSeries returned by the summary route, so sparse statement history can still produce a choppy line
- more than two accounts reuse the same two line colors

#### 2. Account Balances + NLV

Source: `useNetLiquidationValue(accountId)` -> `/api/overview/summary`, `useOpenPositions()`, `/api/adjustments`, `/api/quotes`, `/api/option-quote`
Account-filter behavior: selector-aware

Per-account formula:

- `latestCash = most recent snapshot totalCash when present, otherwise balance`
- `cashAsOf = snapshot date used for the cash anchor`
- `equityValue = sum(mark * netQty)`
- `optionValue = sum(mark * 100 * netQty)`
- `nlv = latestCash + equityValue + optionValue`
- if any required quote is unavailable, `nlv = null` and the widget falls back to cash only
- `progressReference = earliest available cash/balance snapshot for the account, or a fallback based on current value`

| Displayed item | Calculation | Interpretation |
|---|---|---|
| Account ID | `toExternalAccountId(accountId)` | Broker-facing account identifier when mapping exists |
| Cash | latest snapshot `totalCash` or `balance` | Latest statement cash anchor for the account |
| Cash as of | `cashAsOf?.toISOString().slice(0, 10)` | Snapshot date used for cash |
| NLV | `cash + equityValue + optionValue`, or `null` if a required quote is unavailable | Net liquidation estimate using current marks |
| Marks as of | timestamp after live quote load or `Quotes unavailable` | Freshness of mark-based NLV |
| Stale cash badge | shown when cash date differs from marks date | Snapshot cash and live marks were pulled on different dates |
| Progress bar | `clamp((value / progressReference) * 100, 0, 100)` | Scale against the earliest available cash/balance snapshot for that account |

Strengths:

- combines snapshots and live marks into a true balance-plus-positions view
- displays external account IDs when possible

Weaknesses:

- one missing quote nulls the entire account NLV
- the progress bar is not a financial percentage; it is just value scaled to a per-account snapshot baseline
- quote refresh still remounts the row instead of using a dedicated refresh hook
- cash and mark timestamps can diverge, so the widget may show a stale-cash warning even when NLV is otherwise available

#### 3. Win / Loss / Flat

Source: `/api/matched-lots?pageSize=1000`
Account-filter behavior: selector-aware

| Displayed item | Calculation | Interpretation |
|---|---|---|
| WIN count | count of matched lots where `outcome === "WIN"` | Closed lots with positive realized outcome |
| LOSS count | count of matched lots where `outcome === "LOSS"` | Closed lots with negative realized outcome |
| FLAT count | remaining matched lots | Closed lots that are neither win nor loss |
| Win rate | `WIN / (WIN + LOSS) * 100` | Percent of non-flat matched lots that are winners |
| Donut slices | counts above | Outcome mix visualization |

Strengths:

- simple and legible
- uses T2, the canonical closed-lot unit

Weaknesses:

- capped by 1000 lots
- ignores setup-level grouping; a multi-lot setup can influence the chart multiple times
- FLAT lots do not affect win rate denominator

#### 4. Holding Distribution

Source: `/api/matched-lots?pageSize=1000`
Account-filter behavior: selector-aware

| Displayed item | Calculation | Interpretation |
|---|---|---|
| `0-1d` | count where `holdingDays <= 1` | Very short holding periods |
| `2-5d` | count where `2 <= holdingDays <= 5` | Short swing window |
| `6-20d` | count where `6 <= holdingDays <= 20` | Medium-duration holds |
| `21d+` | count where `holdingDays >= 21` | Long-duration holds |

Strengths:

- same bucket logic as the TTS distribution, which keeps interpretation consistent

Weaknesses:

- capped by 1000 lots
- bucket thresholds are fixed and not user-adjustable

#### 5. Top Setups by P&L

Source: `/api/setups?pageSize=1000`
Account-filter behavior: selector-aware

| Displayed item | Calculation | Interpretation |
|---|---|---|
| Setup label | `(overrideTag ?? tag) + " · " + underlyingSymbol` | Best-performing setup groups by current tag |
| P&L value | `realizedPnl` sorted descending, top 10 only | Highest realized setup outcomes |
| Bar width | `abs(realizedPnl) / maxAbs(top10) * 100` | Relative magnitude within the displayed top 10 |

Strengths:

- respects override tags
- easy to identify best setup groups quickly

Weaknesses:

- capped by 1000 setup rows
- “top” means sorted descending by realized P&L only; if all setups are negative it still shows the least negative rows
- no direct click-through from the widget to setup detail

#### 6. Symbol P&L Ranking

Source: `/api/matched-lots?pageSize=1000`
Account-filter behavior: selector-aware

| Displayed item | Calculation | Interpretation |
|---|---|---|
| Top Winners | group matched lots by `symbol`, sum `realizedPnl`, keep highest 10 non-negative totals | Best realized symbols |
| Top Losers | same grouping, keep lowest 10 negative totals | Worst realized symbols |

Strengths:

- quickly surfaces concentration in winners and losers

Weaknesses:

- capped by 1000 lots
- groups by `symbol`, not `underlyingSymbol`, so stock and option contracts are not normalized to a common underlying rollup

#### 7. Monthly P&L Bars

Source: `/api/matched-lots?pageSize=1000`
Account-filter behavior: selector-aware

| Displayed item | Calculation | Interpretation |
|---|---|---|
| Month bucket | `(closeTradeDate ?? openTradeDate).slice(0, 7)` | Calendar month used for realized P&L rollup |
| Monthly P&L | sum of `realizedPnl` per month bucket | Realized P&L trend by month |
| Bar color | green if month P&L >= 0, red if < 0 | Positive vs negative month |

Strengths:

- uses closed-lot realized P&L
- month ordering is chronological

Weaknesses:

- capped by 1000 lots
- open date is used when close date is missing, which can blur month attribution for unusual rows

#### 8. Setup Tag Rollup

Source: `/api/setups?pageSize=1000`
Account-filter behavior: selector-aware

| Displayed item | Calculation | Interpretation |
|---|---|---|
| Tag P&L bar | group by `overrideTag ?? tag`, sum `realizedPnl` | Realized P&L contribution by inferred or overridden setup tag |
| Tag count legend | same grouping, count rows | Number of setup groups carrying each tag |

Strengths:

- respects override tags
- shows both tag P&L and how many setup groups produced it

Weaknesses:

- capped by 1000 setup rows
- bar chart communicates P&L only; count is relegated to the text legend

#### 9. Import Health

Source: `/api/imports?pageSize=1000`
Account-filter behavior: selector-aware via `isSelectedAccount()`

| Displayed item | Calculation | Interpretation |
|---|---|---|
| Total imports | filtered import row count | Number of imports in scope |
| Committed | count where `status === "COMMITTED"` | Successful imports |
| Failed | count where `status === "FAILED"` | Imports that failed commit or parse |
| Parsed rows | sum of `parsedRows` | Parsed rows recorded on imports |
| Skipped rows | `sum(skipped_parse + skipped_duplicate)` | Total skipped rows, including parser skips and duplicates |
| Health label | `Healthy` if failed imports = 0 and skipped rows = 0, else `Needs review` | Quick import quality status |

Strengths:

- selector-aware, unlike the dashboard KPI strip
- includes duplicate skips, which is operationally useful

Weaknesses:

- capped by 1000 imports
- not aligned to `overview.summary.importQuality.skippedRows`, which only includes parser-side skipped rows

#### 10. TTS Readiness

Source: client-side from `/api/executions?pageSize=1000` and `/api/matched-lots?pageSize=1000`
Account-filter behavior: selector-aware

| Displayed item | Calculation | Interpretation |
|---|---|---|
| Trades/mo | `executionCount / monthSpan` | Average executions per month |
| Active days/wk | `distinct trade dates / weekSpan` | Average number of active trading days per week |
| Annualized count | `tradesPerMonth * 12` | Annualized execution count |
| Avg hold | average of matched-lot `holdingDays` | Mean holding duration |
| Median hold | median of matched-lot `holdingDays` | Central holding-duration value |
| Gross proceeds | `sum(abs(quantity) * price)` compact-formatted | Trade-activity scale proxy |

Strengths:

- selector-aware
- mirrors the TTS evidence page formulas closely enough for dashboard use

Weaknesses:

- capped by 1000 executions and 1000 lots
- uses client-side recomputation instead of the dedicated `/api/tts/evidence` route
- execution-count basis means this is activity-oriented, not setup-oriented

#### 11. Diagnostics Badge

Source: `/api/diagnostics`
Account-filter behavior: global only

| Displayed item | Calculation | Interpretation |
|---|---|---|
| Parse coverage | `parseCoverage * 100` | Parsed-row ratio |
| Matching coverage | `matchingCoverage * 100` | Matched-lot coverage proxy |
| Warnings | `warningsCount` | Count of stored warnings across imports |
| Pair ambiguity | `setupInference.setupInferencePairAmbiguousTotal` | Ambiguous short-call pairing cases |
| Synthetic expiration | `syntheticExpirationCount` | Count of inferred expiration close events |
| Status label | `All clear` if warnings = 0 and both coverages are 100%, else `N warnings` | High-level diagnostics state |

Strengths:

- good high-signal shortcut to the audit page

Weaknesses:

- global only; does not respect account selector
- `All clear` ignores uncategorized setups and other nuance beyond the three checked conditions

#### 12. Recent Executions

Source: `/api/executions?pageSize=1000`
Account-filter behavior: selector-aware

| Displayed item | Calculation | Interpretation |
|---|---|---|
| Row set | latest 10 rows after sorting by `eventTimestamp` descending | Most recent execution activity |
| Symbol | execution `symbol` | Instrument traded |
| Date / price line | `tradeDate` plus `price ?? "~"` | Trade day and execution price placeholder |
| Side badge | `BUY` or `SELL` | Direction |
| Type badge | `CALL`, `PUT`, or `EQUITY` | Instrument class |

Strengths:

- concise and useful as a dashboard activity feed

Weaknesses:

- fetches 1000 then slices 10 instead of using a smaller API request
- displays trade date, not exact event timestamp, in the row subtitle

#### 13. Open Positions Summary

Source: `useOpenPositions()`, `/api/adjustments`, `/api/quotes`, `/api/option-quote`
Account-filter behavior: selector-aware

| Displayed item | Calculation | Interpretation |
|---|---|---|
| Open positions | filtered open-position count | Number of open grouped positions |
| Cost basis | `sum(position.costBasis)` | Aggregate signed carrying cost |
| Mark value | sum of equity and option mark values | Aggregate marked value of open positions |
| Unrealized | `markValue - totalCostBasis` | Current unrealized mark-to-market result |
| Last quoted | browser timestamp after mark load | Freshness of displayed marks |
| Positions link | `/positions` | Shortcut to the full open-positions page |

Strengths:

- good rollup companion to the full positions page
- reuses the same selector-aware open-position computation as the full positions page

Weaknesses:

- if any quote call returns unavailable, the whole mark-value rollup becomes null
- does not include cash, so it is not an account balance or NLV widget

#### 14. Portfolio Reconciliation

Source: `/api/overview/reconciliation`
Account-filter behavior: global only

| Displayed item | Calculation | Interpretation |
|---|---|---|
| Starting Capital | `STARTING_CAPITAL` env var, or `0` if unset/invalid | Reconciliation baseline |
| Current NLV | sum of latest per-account `brokerNetLiquidationValue` snapshots | Broker-reported NLV across accounts |
| Total Gain | `currentNlv - startingCapital` | Net gain vs starting capital |
| Unrealized P&L | marked open-position value from current executions, matched lots, and active adjustments | Mark-to-market open-position component |
| Cash Adjustments | sum of persisted cash-event amounts | Cash ledger contribution |
| Realized P&L | sum of matched-lot realized P&L | Closed-trade contribution |
| Manual Adjustments | sum of active manual adjustment amounts/cost basis | Reconciliation overlays from the `/adjustments` flow |
| Unexplained Delta | residual after all other components are subtracted | Remaining mismatch to investigate |

Strengths:

- bridges realized, unrealized, cash, and adjustment components in one widget
- shows a clear residual instead of hiding reconciliation drift inside a single balance number

Weaknesses:

- global only
- depends on `STARTING_CAPITAL` for a meaningful baseline
- residuals are only as good as the underlying cash-event, adjustment, and snapshot data

#### 15. Expectancy vs Hold

Source: `/api/setups?pageSize=1000`
Account-filter behavior: selector-aware

| Displayed item | Calculation | Interpretation |
|---|---|---|
| X axis | `averageHoldDays` | Average hold duration per setup group |
| Y axis | `expectancy` | Expected value per setup group |
| Bubble size | `abs(realizedPnl)` | Magnitude of realized outcome |
| Bubble color | mapped by tag (`long_call`, `stock`, `bull_vertical`, `diagonal`, else muted) | Setup-tag grouping cue |
| Tooltip | realized P&L and tag | Quick point identification |

Strengths:

- surfaces tradeoff between expectancy and time in market
- respects override tags in grouping labels

Weaknesses:

- capped by 1000 setup rows
- color mapping only covers a few named tags explicitly
- tooltip does not show hold/expectancy numbers directly

#### 16. Win / Loss Streak

Source: `/api/overview/streaks`
Account-filter behavior: global only

Server-side streak algorithm:

- matched lots ordered by close trade date ascending, fallback open trade date
- only `WIN` and `LOSS` outcomes participate
- `FLAT` resets the streak to zero
- longest win and longest loss are tracked during the walk

| Displayed item | Calculation | Interpretation |
|---|---|---|
| Headline | `currentStreak + "W"`, `currentStreak + "L"`, or `0` | Current run of wins or losses |
| Longest win streak | `longestWinStreak` | Best consecutive winning run |
| Longest loss streak | `longestLossStreak` | Worst consecutive losing run |

Strengths:

- deterministic and simple
- derived from matched-lot close sequence rather than raw executions

Weaknesses:

- global only; no account filtering
- counts lots, not setups
- route returns a bare JSON object rather than the standard `{ data }` detail envelope; the widget compensates for both shapes

## Analytics Screen

Current route: `/analytics`
Primary sources: `/api/setups?pageSize=1000`, `/api/matched-lots?pageSize=1000`, `/api/diagnostics`, paged `/api/setups`
Account-filter behavior: mixed

### KPI Strip

| KPI | Calculation | Interpretation |
|---|---|---|
| Total P&L | sum of selector-filtered setup `realizedPnl` | Realized T3 P&L in scope |
| Win Rate | selector-filtered matched-lot `WIN / (WIN + LOSS)` | T2 win rate in scope |
| Avg Hold | selector-filtered average `holdingDays` | T2 average holding period |
| Pair Ambiguities | `diagnostics.setupInference.setupInferencePairAmbiguousTotal` | Global ambiguous pairing cases |
| Short Call Paired | `diagnostics.setupInference.setupInferenceShortCallPairedTotal` | Global short-call pair classifications |
| Synth Expires | `diagnostics.syntheticExpirationCount` | Global inferred-expiration closes |

Strengths:

- mixes realized performance with diagnostics context
- selector-aware for the performance KPIs

Weaknesses:

- first three KPIs are selector-aware; last three are global diagnostics counts
- cross-unit mix: setups and matched lots are both used in the same strip

### P&L by Setup Tag

| Item | Calculation | Interpretation |
|---|---|---|
| Tag bar | group selector-filtered setup rows by `overrideTag ?? tag`, sum `realizedPnl` | Realized P&L by setup tag |

Strengths:

- override tags are honored

Weaknesses:

- no count overlay, so a large bar may come from one setup or many

### Win / Loss / Flat Pie

| Item | Calculation | Interpretation |
|---|---|---|
| Pie slices | selector-filtered matched-lot outcome counts | Outcome mix at T2 level |

Strengths:

- easy read of T2 outcome mix

Weaknesses:

- no center label or total count
- not directly comparable to setup-based P&L bars because the unit changes from T3 to T2

### Setup Analytics Table

Server feed: paged `/api/setups`
Client filter: selector filter applied after the server response returns

| Column | Source / calculation | Interpretation |
|---|---|---|
| Tag | `overrideTag ?? tag` | Effective setup tag |
| Underlying | `underlyingSymbol` | Setup underlying |
| Realized P&L | setup `realizedPnl`, currency-formatted client-side | Setup realized outcome |
| Win Rate | setup `winRate` | Stored T3 win rate |
| Expectancy | setup `expectancy` | Stored T3 expectancy |
| Avg Hold | setup `averageHoldDays` | Stored T3 average hold |

Strengths:

- sortable by every displayed analytic field
- show-all state persists in `localStorage`

Weaknesses:

- server pagination happens before selector filtering, so counts/pages can feel inconsistent under account filtering
- uses the same `kapman_table_setups_showAll` storage key as the T3 trade-records panel

## Open Positions Screen

Current route: `/positions`
Primary sources: `useOpenPositions()`, `/api/adjustments`, `/api/quotes`, `/api/option-quote`
Account-filter behavior: selector-aware

### Open Position Computation

Current as-built algorithm is more precise than the simplified v7 spec:

- fetch `/api/executions?pageSize=1000`
- fetch `/api/matched-lots?pageSize=1000`
- fetch active `/api/adjustments?pageSize=1000&status=ACTIVE`
- build `matchedQtyByOpenExecutionId`
- for each `TO_OPEN` execution, compute `remainingQuantity = openQuantity - matchedQuantity`
- ignore rows with no remaining quantity
- apply active quantity, price, split, add, remove, and execution-specific overrides before grouping open positions
- group by `accountId + instrumentKey` fallbacking to a synthetic key when needed
- signed quantity: `SELL` -> negative, everything else -> positive
- cost basis contribution: `signedQty * price * multiplier`, where multiplier is `100` for options and `1` for equity

Interpretation:

- long positions produce positive `netQty`
- short positions produce negative `netQty`
- cost basis is signed, not always positive

Strengths:

- supports partial closes correctly
- incorporates active manual adjustments before mark-to-market grouping
- works without any new DB route
- live quote refresh is explicit and deterministic from the refresh button

Weaknesses:

- still capped by 1000 executions and 1000 matched lots
- uses `price ?? 0` when price is missing

### Summary Cards

| Item | Calculation | Interpretation |
|---|---|---|
| Total Cost Basis | `sum(row.costBasis)` | Aggregate signed carrying cost across visible positions |
| Total Market Value | `sum(row.marketValue)` when all rows have marks | Marked value of the visible position set |
| Total Unrealized P&L | `totalMarketValue - totalCostBasis` | Mark-to-market result for the visible position set |

### Header Actions and Indicators

| Item | Calculation | Interpretation |
|---|---|---|
| Position count | filtered open-position row count | Number of current open grouped positions |
| Last quoted | browser time after last successful mark load | Quote freshness |
| Refresh Quotes | increments `refreshCounter` and reloads live marks | Explicit mark refresh action |
| Show all | localStorage-backed toggle | Switches between paged rows and full-height table mode |
| Quote warning | shown when any mark is unavailable or when no live marks exist | Some rows may be cost-basis-only |

### Table Columns

| Column | Calculation / source | Interpretation |
|---|---|---|
| Symbol | `underlyingSymbol` | Underlying instrument |
| Type | `CALL`, `PUT`, or `EQUITY` badge | Instrument type |
| Strike | `strike` | Option strike |
| Expiry | `expirationDate` | Option expiration |
| DTE | `ceil((expirationDate - now) / 1 day)` | Days to expiration |
| Qty | grouped `netQty` | Current signed open quantity |
| Cost Basis | grouped `costBasis` | Signed carrying cost |
| Mark | quote `mark` when available | Current mark price |
| Mkt Value | `mark * netQty * multiplier` | Marked value of the position |
| Unrealized P&L | `marketValue - costBasis` | Current mark-to-market result |
| P&L % | `unrealized / abs(costBasis) * 100` when cost basis non-zero | Relative gain/loss vs absolute cost basis |
| Account | full internal `accountId` | Internal account key only |

Strengths:

- strongest current position view in the app
- partial quote availability still leaves whatever marks were resolved visible in-table

Weaknesses:

- account column is not a stable broker-facing label
- DTE uses browser time and can go negative for stale open expiries
- option quote calls are made one contract at a time, which can be slow

## Trade Records

Current route: `/trade-records`
Tabs: `executions`, `matched-lots`, `setups`
Global selector behavior: not integrated; each tab uses its own filters

### Executions (T1)

Primary source: `/api/executions`
Filter support: symbol, account, import, date range, execution ID
Sorting: event time, symbol, quantity, price

| Column / item | Source / calculation | Interpretation |
|---|---|---|
| Event Time | `eventTimestamp` | Exact normalized event timestamp |
| Trade Date | `tradeDate` | Trading date |
| Symbol | `symbol` | Instrument symbol |
| Side | `BUY` / `SELL` badge | Direction |
| Qty | `quantity` | Executed quantity |
| Price | `price ?? "~"` | Price, with `~` preserved as null placeholder |
| Event | `eventType` | Trade, assignment, exercise, inferred expiration, etc. |
| Effect | `TO_OPEN`, `TO_CLOSE`, or `UNKNOWN` | Opening/closing effect |
| Option | option badge plus `strike expiration` | Option contract summary |
| Account | `row.accountId` | Internal account ID |
| Import | truncated `importId` button | Opens execution drill-through for the selected row |

Strengths:

- best audit view for normalized T1 rows
- direct support for execution detail drill-through and parent-import lookup
- row detail includes raw JSON, instrument-key copy, and parent import navigation

Weaknesses:

- account column still shows the internal account key
- drill-through is still same-page state, not a dedicated route
- the import button does not open the import record directly; it opens the execution detail panel first

#### Execution Detail Drill-Through

| Item | Source / calculation | Interpretation |
|---|---|---|
| Execution ID | selected row | Exact T1 row selected from the table |
| Import ID | selected execution `importId` | Parent import lineage |
| Account | selected execution `accountId` | Internal account key |
| Trade Date | selected execution `tradeDate` | Trading date for the execution |
| Symbol / Side / Qty / Price / Event / Effect | selected execution fields | Full normalized execution context |
| Option summary | `optionType`, `strike`, `expirationDate` | Contract summary for options |
| Instrument Key | `instrumentKey` with copy action | Derived instrument identifier for audit use |
| Raw row JSON | `rawRowJson` | Persisted source-row payload for auditability |
| Parent import link | `/imports?tab=history&import={importId}` | Shortcut back to the import history row |

### Ledger Replay and Adjustment Effects

Primary sources: `src/lib/ledger/ingest.ts`, `src/lib/ledger/rebuild-account-ledger.ts`, `src/lib/adjustments/**`

Current as-built behavior:

- broker dedupe prefers `brokerRefNumber` when present, so duplicate executions with the same reference collapse earlier in ingest
- active `SPLIT` adjustments rescale quantity and price before FIFO matching and remap option instrument keys to the post-split contract key
- active `EXECUTION_QTY_OVERRIDE` adjustments target a specific execution ID and rewrite quantity before FIFO matching
- missing override targets emit warnings instead of silently disappearing

Strengths:

- ledger replay is now adjustment-aware instead of being a pure import replay
- split handling preserves option identity across post-split contract keys

Weaknesses:

- adjustment replay introduces more moving parts when reconciling historical imports
- quantity overrides that target missing executions still require warning review

### Matched Lots (T2)

Primary source: `/api/matched-lots`
Filter support: symbol, account, import, outcome, date range
Sorting: close date, symbol, realized P&L, hold days

| Column / item | Source / calculation | Interpretation |
|---|---|---|
| Close Date | `closeTradeDate ?? openTradeDate` | Realization date fallback |
| Symbol | `symbol` from open execution | Instrument symbol |
| Qty | `quantity` | Lot quantity matched |
| Realized P&L | `realizedPnl` | Realized result of the lot |
| Hold Days | `holdingDays` | Days between open and close |
| Outcome | `WIN`, `LOSS`, `FLAT` badge | Outcome class |
| Open Execution | linked `openExecutionId` | Trace back to source open T1 row |
| Close Execution | linked `closeExecutionId` or `-` | Trace back to close T1 row |

Strengths:

- very clear FIFO audit surface
- links bridge directly back to the T1 audit table

Weaknesses:

- open/close execution links go through `/executions`, which then redirects to `/trade-records`; workable but indirect
- when `closeTradeDate` is null the date column falls back to open date, which can be misleading without context

### Setups (T3)

Primary sources: `/api/setups`, `/api/setups/:id`
Filter support: account, tag

#### T3 Summary Cards

| KPI | Calculation | Interpretation |
|---|---|---|
| Performance Summary | sum of current `rows[].realizedPnl` | P&L for the currently loaded setup page/filter set |
| Win Rate | average of current `rows[].winRate` | Average stored setup win rate across the loaded rows |
| Expectancy | average of current `rows[].expectancy` | Average stored expectancy across the loaded rows |
| Average Hold (Days) | average of current `rows[].averageHoldDays` | Mean stored hold duration across the loaded rows |

Strengths:

- quick rollup of the visible T3 result set

Weaknesses:

- summary is based on the currently loaded page, not the full filtered population unless `Show all` is enabled
- not tied to the global account selector

#### T3 Table

| Column | Source / calculation | Interpretation |
|---|---|---|
| Tag | `overrideTag ?? tag` | Effective setup tag |
| Underlying | `underlyingSymbol` | Underlying instrument |
| Realized P&L | setup `realizedPnl` | Setup outcome |
| Win Rate | setup `winRate` | Setup win rate |
| Expectancy | setup `expectancy` | Setup expectancy |
| Avg Hold | setup `averageHoldDays` | Setup hold duration |
| Detail | link to `?setup={id}#setup-detail` | Opens drill-through section |

#### Setup Detail Drill-Through

| Item | Source / calculation | Interpretation |
|---|---|---|
| Header summary | effective tag, underlying, setup ID | Identifies selected setup group |
| Inference Notes | `/api/setups/:id` -> `inference.reasons[]` | Why the setup tag exists or fell back |
| Lot rows | linked matched lots in the setup | T2 rows attached to the setup |
| Open/Close execution links | linked execution IDs | Trace setup back to T1 |

Strengths:

- best current explanation surface for setup inference output

Weaknesses:

- no inline charting or richer setup diagnostics
- drill-through is query-string driven and lives on the same page, which is functional but basic

## Adjustments Screen

Current route: `/adjustments`
Global selector behavior: not integrated; the account picker is fed from selector-aware account discovery, but the ledger list itself is not selector-filtered

### Create Adjustment

| Item | Source / calculation | Interpretation |
|---|---|---|
| Account | selector-fed account picker | Account to which the adjustment will apply |
| Symbol | free-text input | Symbol or underlying anchor for the adjustment |
| Effective Date | date input, locked for execution-qty overrides | Date the adjustment takes effect |
| Type | `SPLIT`, `QTY_OVERRIDE`, `PRICE_OVERRIDE`, `ADD_POSITION`, `REMOVE_POSITION`, or `EXECUTION_QTY_OVERRIDE` | Adjustment category |
| Type-specific payload | form fields derived from adjustment type | Structured adjustment content |
| Reason | required text input | Human-readable audit justification |
| Evidence URL | optional text input | External documentation reference |
| Created By | free-text input | Audit author metadata |
| Preview | `/api/adjustments/preview` | Before/after impact check before commit |
| Create Adjustment | `/api/adjustments` | Persists the manual adjustment and triggers ledger/setup rebuilds |

Strengths:

- creates auditable overlays without mutating raw execution rows
- preview happens before commit, which makes split and execution-override changes safer to review
- execution-qty overrides resolve the target execution and normalize the effective date automatically

Weaknesses:

- the page is not selector-filtered, so history review is broader than the account picker itself
- typed payloads are powerful but create more validation surface than a simple comment-only notes field

### Adjustment Preview

| Item | Source / calculation | Interpretation |
|---|---|---|
| Affected executions | count from preview response | How many ledger rows would be impacted |
| Before / after open qty | open-position quantity before and after the proposed change | Quantity delta for the adjustment |
| Before / after gross cost | gross cost before and after the proposed change | Carrying-cost delta for the adjustment |
| Before / after cost basis per share | gross cost divided by open quantity, or `null` when unavailable | Unit-cost delta for the proposed change |
| Execution override preview | before/after effective qty, matched-lot count, realized P&L impact, unexplained delta impact | Detailed impact model for execution-specific overrides |
| Warning list | preview warnings | Validation and replay caveats before commit |

Strengths:

- shows before/after impact without writing anything to the database
- execution-specific overrides surface both lot impact and reconciliation impact

Weaknesses:

- preview is only as good as the current ledger state, so stale data can change the result after commit
- some adjustment types still only produce a coarse before/after summary rather than a line-by-line replay

### Adjustment Ledger

| Item | Source / calculation | Interpretation |
|---|---|---|
| Created | `createdAt` localized | Adjustment creation timestamp |
| Account | external account ID | Broker-facing account identifier |
| Symbol | `symbol` | Adjustment symbol |
| Type | adjustment type plus split direction for `SPLIT` | Adjustment category |
| Effective | `effectiveDate` | Date used when replaying the adjustment |
| Payload | JSON stringified payload | Exact adjustment content |
| Reason | stored reason text | Audit justification |
| Status | `ACTIVE` or `REVERSED` plus superseded marker for stale execution overrides | Lifecycle state |
| Action | reverse button | Creates a reversal record and rebuilds the ledger |

Strengths:

- the ledger is auditable and reversible
- superseded execution-qty overrides are visible instead of silently replacing history

Weaknesses:

- the screen is still page-driven and capped by the same `pageSize=1000` pattern used elsewhere
- reversal creates a new record rather than editing the original, which is correct for auditability but adds more rows to scan

## Imports Screen

Current route: `/imports`
Tabs: `Upload Statement`, `Import History`, `Adapter Registry`
Global selector behavior: not integrated

### Upload Statement

| Item | Source / calculation | Interpretation |
|---|---|---|
| File input | browser file selection | CSV chosen for upload |
| Upload progress | XHR `loaded / total * 100` | Upload transfer progress |
| Detection adapter | `/api/imports/upload` -> `detection.adapterId` | Chosen parser adapter |
| Detection confidence | upload response `detection.confidence` | Adapter match confidence |
| Detection format | upload response `detection.formatVersion` | Parser format version |
| Parse preview rows | first 10 parsed executions from upload response | Pre-commit normalization preview |
| Commit button | enabled only after successful upload and before successful commit | Commits parsed data into T1/T2/T3 |
| Commit summary | `parsedRows · inserted · skipped_duplicate · failed` | Post-commit result summary |
| Warning list | commit response warnings | Parser/ledger/setup warnings surfaced from commit |

Strengths:

- complete pre-commit workflow exists in one tab
- upload progress and preview are already implemented

Weaknesses:

- upload response also contains `rowEstimate`, `reason`, and detection warnings, but the UI does not render them
- commit summary does not display `skipped_parse`

### Import History

| Column / item | Source / calculation | Interpretation |
|---|---|---|
| Imported At | `createdAt` localized | Import timestamp |
| Filename | import filename | Original uploaded file |
| Broker | mapped broker ID | Adapter/broker lineage |
| Account | external broker account ID from imports API | Account associated with the import |
| Status | import status string | Upload/commit state |
| Parsed | `parsedRows` | Parsed rows on the import |
| Inserted | `inserted` | Persisted execution rows |
| Skipped Duplicate | `skipped_duplicate` | Duplicate rows skipped on ingest |
| Failed | `failed` | Failed ingest rows |
| Link | query link into T1 executions | Shortcut to resulting execution rows |

Strengths:

- useful audit bridge from file to resulting T1 rows
- account filter and show-all mode are implemented

Weaknesses:

- no styled status badges; status is plain text
- no direct visibility into parse-skip counts or warnings from the history table itself

### Adapter Registry

Source: `/api/imports/adapters`

| Item | Source / calculation | Interpretation |
|---|---|---|
| Adapter name | `displayName` | Registered adapter |
| Status | `active` / `stub` | Implementation readiness |
| Notes | `coverage.notes` | Human-readable coverage summary |

Strengths:

- enough to confirm adapter availability quickly

Weaknesses:

- API exposes detailed coverage booleans, but the UI only renders the notes string

## TTS Evidence Screen

Current route: `/tts-evidence`
Global selector behavior: not integrated
Structure: generic `DataPagePanel` plus dedicated TTS evidence panel

### Shared DataPagePanel on this screen

Source: `/api/page-stats`

| Item | Calculation | Interpretation |
|---|---|---|
| Accounts | `accountTotal` | Account row count |
| Imports | `importTotal` | Import row count |
| Snapshots | `snapshotTotal` | Snapshot row count |

Strengths:

- gives the page an immediate empty/populated scaffold

Weaknesses:

- generic and global, not TTS-specific

### TTS Evidence Metrics

Source: `/api/tts/evidence`

Server-side formulas:

- `tradesPerMonth = executionCount / monthSpan`
- `activeDaysPerWeek = distinctTradeDates / weekSpan`
- `averageHoldingPeriodDays = average(matchedLot.holdingDays)`
- `medianHoldingPeriodDays = median(matchedLot.holdingDays)`
- `annualizedTradeCount = round(tradesPerMonth * 12)`
- `grossProceedsProxy = sum(abs(quantity) * price)`
- distribution buckets: `0-1d`, `2-5d`, `6-20d`, `21d+`

| Item | Interpretation |
|---|---|
| Trades Per Month | Average trading activity frequency |
| Active Days Per Week | Regularity of trading activity |
| Annualized Trade Count | Annualized activity proxy |
| Average Holding Period (Days) | Mean time in market |
| Median Holding Period (Days) | Central hold-duration tendency |
| Gross Proceeds Proxy | Approximate trading notional flow |
| Holding-Period Distribution | How activity is distributed across short vs long holds |

Strengths:

- server-side aggregation, not capped by 1000-row client fetches
- clear disclaimer that metrics are evidence signals, not legal determinations

Weaknesses:

- global only, no account selector integration
- gross proceeds is a compact-formatted proxy and intentionally excludes the option `×100` notional multiplier, so it remains a readiness signal rather than a precise notional measure

## Diagnostics Screen

Current route: `/diagnostics`
Global selector behavior: not integrated
Structure: generic `DataPagePanel` plus dedicated diagnostics panel

### Shared DataPagePanel on this screen

Source: `/api/page-stats`

| Item | Calculation | Interpretation |
|---|---|---|
| Accounts | `accountTotal` | Account row count |
| Imports | `importTotal` | Import row count |
| Snapshots | `snapshotTotal` | Snapshot row count |

### Diagnostics Metrics

Source: `/api/diagnostics`

Server-side formulas:

- `parseCoverage = parsedRows / (parsedRows + skippedRows)`; if denominator is zero, returns `1`
- `unsupportedRowCount = skippedRows`
- `matchingCoverage = matchedCount / closeCandidateExecutionCount`; if denominator is zero, returns `1`
- `unmatchedCloseCount = max(0, closeCandidateExecutionCount - matchedCount)`
- `partialMatchCount = matched lots whose open and close quantities differ`
- `unmatchedCloseExecutions = first 25 close-candidate executions that did not match`
- `uncategorizedCount = inferSetupGroups(...).diagnostics.setupInferenceUncategorizedTotal`
- `warningsCount = total stored warning entries across imports`
- `syntheticExpirationCount = execution count where eventType = EXPIRATION_INFERRED`
- remaining cards come directly from rerun setup-inference diagnostics

| Item | Interpretation |
|---|---|
| Parse Coverage | Fraction of parsed rows vs parser-side skipped rows |
| Unsupported Rows | Count of skipped parser rows |
| Matching Coverage | Proxy ratio of matched close candidates vs close-candidate executions |
| Unmatched Close Count | Number of close-candidate executions that were not matched |
| Partial Match Count | Number of matched lots where open and close quantities differ |
| Unmatched Close Executions | Explicit list of the first unmatched close-candidate executions |
| Uncategorized Setups | Setup groups that inference left uncategorized |
| Warning Count | Aggregate import warning volume |
| Synthetic Expiration Closes | Inferred expiry-close events created by ledger logic |
| Setup Inference Total | Total setup-inference lot population |
| Short Call Standalone | Short-call classifications without supported pairing |
| Short Call Paired | Short-call classifications that paired successfully |
| Pair Outcomes | Vertical, calendar, diagonal pair counts |
| Pair Failures | No-overlap, no-eligible-expiry, missing-metadata counts |
| Pair Ambiguities | Ambiguous pairing cases |
| Surfaced Warnings / Assumptions | First warning samples from import warning JSON |
| Setup Inference Samples | Sample codes/messages from inference diagnostics |

Strengths:

- strongest observability page in the product
- setup inference diagnostics are recomputed live from current matched lots

Weaknesses:

- global only
- warning samples are capped to the first 10 collected warnings
- matching coverage is a record-count proxy, not a quantity-weighted coverage measure
- the screen still only lists the first 25 unmatched close candidates, so very large mismatch sets need API inspection for the full picture

## Spec vs As-Built Deltas Worth Keeping in Mind

1. Quote routes use the MCP market-data wrapper, not a direct Schwab OAuth module.
2. `/api/overview/streaks` returns a bare JSON object instead of the normal `{ data }` detail envelope.
3. The dashboard KPI strip is still global and ignores the account selector.
4. Diagnostics, streak, and reconciliation widgets remain global, even on the selector-aware dashboard.
5. TTS Evidence and Diagnostics pages still use the older `DataPageLayout` + `DataPagePanel` wrapper pattern.
6. Several widgets and analytics views rely on `pageSize=1000` client aggregation and can truncate large datasets.
7. Account identifiers are not normalized consistently in the rendered UI.
8. `Import Health` uses imports API totals, while dashboard summary import quality comes from overview summary; they are similar but not identical because skipped-row definitions differ.
9. `/adjustments` is a new as-built audit surface for manual split, override, add, remove, and execution-specific adjustment replay.
10. The portfolio-reconciliation widget is a new dashboard surface that depends on `STARTING_CAPITAL` and aggregates cash events, realized P&L, unrealized P&L, and manual adjustments.
11. The T1 execution table now has same-page drill-through with raw JSON, instrument-key copy, and a parent-import shortcut instead of a dedicated execution route.
12. The TTS Readiness dashboard widget recomputes its own metrics client-side instead of consuming `/api/tts/evidence`.
13. The open-positions computation is better than the original spec wording because it subtracts matched quantity and therefore supports partial closes correctly.

## Recommended Documentation Posture

Use the v7 docs set this way:

- `docs/kapman_build_spec_v7.md`: target-state intent
- `docs/kapman_github_issues_v7.md`: implementation backlog and acceptance criteria
- `docs/kapman_codex_master_prompt_v7.md`: execution instructions
- `docs/kapman_v7_2_as_built_inventory.md`: actual shipped behavior and current caveats
- `docs/kapman_v7_as_built_inventory.md`: original v7 baseline and historical reference
