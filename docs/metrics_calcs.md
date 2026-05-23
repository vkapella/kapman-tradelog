# KapMan Metrics And Calculations

This document maps visible metrics to their current data sources and calculations.

## Common Terms

| Term | Current Calculation |
|---|---|
| Realized P&L | Sum of matched-lot realized P&L from FIFO matches. |
| Matched lot holding days | Rounded day difference between open execution trade date and close execution trade date. |
| Matched lot outcome | `WIN` when realized P&L is positive, `LOSS` when negative, otherwise `FLAT`. |
| Option multiplier | `100` in FIFO P&L, open-position market value, and unrealized P&L calculations. |
| Equity multiplier | `1`. |
| Account scope | Usually internal `Account.id` values passed as `accountIds`. |
| Date range | Supplied by `RangeFilterContext`; semantics vary by endpoint. |

## FIFO Realized P&L

`src/lib/ledger/fifo-matcher.ts` computes matched-lot P&L.

For long opens:

```text
(closePrice - openPrice) * quantity * multiplier
```

For short opens:

```text
(openPrice - closePrice) * quantity * multiplier
```

If an option open lot remains open after expiration, the ledger creates a synthetic close at price `0` with event type `EXPIRATION_INFERRED`.

## Overview Summary API

`GET /api/overview/summary` backs the dashboard KPI strip and several widgets.

| Field | Calculation |
|---|---|
| `netPnl` | Sum of `MatchedLot.realizedPnl`. |
| `executionCount` | Count of executions in scope. |
| `matchedLotCount` | Count of matched lots in scope. |
| `setupCount` | Count of setup groups in scope. |
| `averageHoldDays` | Average `MatchedLot.holdingDays`; returns `0.00` when no lots exist. |
| `winRate` | `WIN / (WIN + LOSS) * 100`; excludes `FLAT`. |
| `profitFactor` | Gross winning P&L divided by absolute gross losing P&L; `null` when there are no losses. |
| `expectancy` | Total realized P&L divided by matched-lot count. |
| `startingCapital` | Sum of configured account starting capital. |
| `currentNlv` | Sum of latest broker NLV when available, otherwise latest cash. |
| `totalReturnPct` | `(currentNlv - startingCapital) / startingCapital * 100`; `null` when starting capital is not positive. |
| `snapshotCount` | Count of daily account snapshots. |
| `maxDrawdown` | Largest peak-to-trough decline in the combined snapshot series. |
| `importQuality` | Import counts and parsed/skipped row totals. |
| `snapshotSeries` | Daily snapshots using total cash when available, otherwise balance. |
| `accountBalances` | Latest account cash and broker NLV from snapshots or cash fallback. |

`computeMaxDrawdown()` first builds per-account series using the best available source, preferring broker NLV, then total cash, then balance. It carries account values forward across dates, sums accounts into a combined series, and returns the largest running-peak minus current-value drawdown.

## Dashboard KPI Strip

`src/lib/registries/kpi-registry.ts` defines configurable dashboard KPIs. All currently read `OverviewSummaryResponse`.

| KPI | Source Field |
|---|---|
| Realized P&L | `netPnl` |
| Execution Count | `executionCount` |
| Matched Lot Count | `matchedLotCount` |
| Setup Count | `setupCount` |
| Avg Hold Days | `averageHoldDays` |
| Win Rate | `winRate` |
| Total Return % | `totalReturnPct` |
| Profit Factor | `profitFactor` |
| Expectancy | `expectancy` |
| Max Drawdown | `maxDrawdown` |
| Snapshot Count | `snapshotCount` |

## Dashboard Widgets

| Widget | Primary Source | Calculation |
|---|---|---|
| Cash Balance Curve | `/api/overview/summary` | Plots `snapshotSeries.balance` by date, combined or per account. |
| Daily P&L Calendar | `/api/matched-lots` | Groups closed matched lots by close date and sums realized P&L per day. |
| Account Balances + NLV | `/api/positions/snapshot`, `/api/overview/summary`, `/api/accounts/starting-capital` | Uses broker NLV when available; otherwise cash plus marked open-position value. Scale base is starting capital, falling back to earliest snapshot. |
| Win / Loss / Flat | `/api/matched-lots` | Counts outcomes and calculates win rate as `WIN / (WIN + LOSS)`. |
| Holding Distribution | `/api/matched-lots` | Buckets hold days into `0-1d`, `2-5d`, `6-20d`, and `21d+`. |
| Top Setups by P&L | `/api/setups` | Sorts setup groups by realized P&L descending. |
| Symbol P&L Ranking | `/api/matched-lots` | Groups realized P&L by matched-lot symbol, then lists top winners and losers. |
| Monthly P&L Bars | `/api/matched-lots` | Groups realized P&L by close month, falling back to open month when close date is null. |
| Setup Tag Rollup | `/api/setups` | Groups setup realized P&L and counts by effective tag (`overrideTag` or `tag`). |
| Import Health | `/api/imports` | Counts total, committed, failed, parsed rows, and skipped rows. |
| TTS Readiness | `/api/tts/evidence` | Displays TTS threshold metrics and RAG status. |
| Diagnostics Badge | `/api/diagnostics` | Shows parse coverage, matching coverage, warnings, pair ambiguities, and synthetic expirations. |
| Recent Matched Lots | `/api/matched-lots` | Latest closed matched lots by close date. |
| Recent Executions | `/api/executions` | Latest executions by event timestamp. |
| Open Positions Summary | `openPositionsStore` | Counts cached open positions and sums cost basis, mark value, and unrealized P&L. |
| Portfolio Reconciliation | `/api/positions/snapshot` through `usePositionSnapshot()` | Shows persisted reconciliation bridge from the latest position snapshot. |
| Expectancy vs Hold | `/api/setups` | Scatter plot of setup average hold days versus setup expectancy; bubble size is realized P&L magnitude. |
| Setup Expectancy | `/api/setups` | Groups setups by tag, sums realized P&L and lot counts, and computes P&L per lot. |
| Win / Loss Streak | `/api/overview/streaks` | Orders matched lots by close date, falls back to open date, and tracks current plus longest win/loss streaks. |

Some widgets fetch only the first 1000 rows. See `docs/recommendations.md` for the recommended cleanup.

## Analytics Page

`/analytics` is setup-focused and currently uses `/api/setups`, `/api/matched-lots`, and `/api/diagnostics`.

| Metric | Calculation |
|---|---|
| Total P&L | Sum of setup realized P&L in the current client-side scope. |
| Win Rate | `WIN / (WIN + LOSS) * 100` from matched lots; excludes `FLAT`. |
| Avg Hold | Average matched-lot `holdingDays`. |
| Pair Ambiguities | `setupInference.setupInferencePairAmbiguousTotal` from diagnostics. |
| Short Call Paired | `setupInference.setupInferenceShortCallPairedTotal` from diagnostics. |
| Synth Expires | `syntheticExpirationCount` from diagnostics. |
| P&L by Setup Tag | Sum of setup realized P&L by effective tag. |
| Win / Loss / Flat | Count of matched-lot outcomes. |
| Setup Analytics Table | Setup tag, underlying, realized P&L, win rate, expectancy, and average hold days. |

## Trade Records

### Executions (T1)

The T1 table shows normalized execution records from `/api/executions`. It does not calculate P&L. The table displays event time, trade date, symbol, side, quantity, unit price, event type, open/close effect, option metadata, account, import, execution id, and diagnostic case-file link.

### Matched Lots (T2)

The T2 table shows FIFO match records from `/api/matched-lots`.

Visible metrics:

- close date or open date when close date is missing
- quantity
- realized P&L
- holding days
- outcome
- open and close execution links

### Setups (T3)

The T3 table shows setup groups from `/api/setups`.

Visible metrics:

- effective tag
- underlying
- realized P&L
- win rate
- expectancy per lot
- average hold days
- linked matched lots and source executions in the detail panel
- inference notes generated in the detail route

The page summary computes total P&L, average setup win rate, average setup expectancy, and average setup hold days over currently displayed setup rows.

## Open Positions

Open positions are computed from open executions minus matched quantities, then adjusted by active manual adjustments.

Visible calculations:

| Metric | Calculation |
|---|---|
| DTE | Calendar days from now to option expiration, rounded up. |
| Cost basis | Remaining open quantity times adjusted open price times multiplier. |
| Mark | Cached mark from latest position snapshot. |
| Market value | `mark * netQty * multiplier`. |
| Unrealized P&L | `marketValue - costBasis`. |
| P&L % | `unrealizedPnl / abs(costBasis) * 100`; blank when cost basis is zero or mark is missing. |
| Total cost basis | Sum of displayed row cost basis. |
| Total market value | Sum of displayed market values; blank if any mark is missing. |
| Total unrealized P&L | `totalMarketValue - totalCostBasis`. |

Quote marks are loaded through `POST /api/positions/snapshot/compute` and cached by account in `localStorage`.

## Position Snapshot Reconciliation

`POST /api/positions/snapshot/compute` calculates and stores:

| Field | Calculation |
|---|---|
| `unrealizedPnl` | Total marked value of open positions minus total open-position cost basis. |
| `realizedPnl` | Sum of matched-lot realized P&L. |
| `cashAdjustments` | Sum of cash-event amounts. |
| `manualAdjustments` | Sum of adjustment payload amounts where present, plus add-position cost basis. |
| `currentNlv` | Sum per account of broker NLV when available, otherwise cash plus marked open-position value. |
| `startingCapital` | Sum of configured account starting capital. |
| `totalGain` | `currentNlv - startingCapital`. |
| `unexplainedDelta` | `totalGain - unrealizedPnl - cashAdjustments - realizedPnl - manualAdjustments`. |

`/api/overview/reconciliation` reads the latest persisted position snapshot for the requested account scope.

## TTS Evidence

`GET /api/tts/evidence` computes evidence-oriented trading activity metrics.

| Metric | Calculation |
|---|---|
| Trades per month | Execution count divided by inclusive month span from first to last execution. |
| Active days per week | Distinct trade dates divided by week span from first to last execution. |
| Average holding period | Average matched-lot holding days. |
| Median holding period | Median matched-lot holding days. |
| Annualized trade count | `round(tradesPerMonth * 12)`. |
| Gross proceeds proxy | Sum of `abs(quantity) * price` across executions. The current proxy does not apply the option `100` multiplier. |
| Holding-period distribution | Matched-lot hold buckets: `0-1d`, `2-5d`, `6-20d`, `21d+`. |
| Monthly series | Last six months of trade count, active days/week, hold metrics, annualized count, and gross proceeds proxy. |

RAG thresholds live in `src/lib/tts/readiness.ts`:

| Metric | Green | Amber | Red |
|---|---:|---:|---:|
| Trades per month | `>= 60` | `40-59` | `< 40` |
| Active days per week | `>= 4` | `3` | `< 3` |
| Average holding period | `<= 31d` | `32-45d` | `> 45d` |
| Annualized trade count | `>= 720` | `480-719` | `< 480` |

Overall status is red if any threshold metric is red, amber if any is amber, otherwise green.

## Diagnostics

`GET /api/diagnostics` computes:

| Metric | Calculation |
|---|---|
| Parse coverage | `parsedRows / (parsedRows + skippedRows)`, or `1` when no rows exist. |
| Unsupported rows | Sum of import `skippedRows`. |
| Matching coverage | Distinct matched close execution ids divided by close candidate count. |
| Unmatched close count | `closeCandidateCount - matchedCloseExecutionIds.size`, floored at zero. |
| Partial match count | Matched lots where open execution quantity differs from close execution quantity. |
| Uncategorized count | Setup inference uncategorized total. |
| Warning count | Import warnings plus open-position adjustment warnings, excluding `CANCEL_REBOOK`. |
| Synthetic expiration count | Count of `EXPIRATION_INFERRED` executions. |
| Account cash | Latest account cash source and date from account-balance context. |
| Duplicate snapshot dates | Count of duplicate snapshot-date warning records. |
| Skipped non-cash sections | Counts of skipped forex, futures, and crypto cash-balance sections. |
| Setup inference diagnostics | Totals and samples from `inferSetupGroups()`. |

Diagnostics also groups warning records and setup inference samples into case-file links.

## Imports

Import upload displays:

- adapter id
- detection confidence
- format version
- row estimate
- warning list
- parse preview rows

Import commit displays:

- parsed rows
- inserted executions
- inserted cash events
- skipped execution duplicates
- skipped cash-event duplicates
- failed rows
- warning list

Import history displays filename, broker, account, status, parsed rows, inserted execution count, skipped duplicates, failed rows, import id, and links to related executions.

## Accounts

The Accounts page displays and edits:

- display label
- broker account id
- broker name
- starting capital
- created date

Starting capital feeds total return, account-balance scale base, and position snapshot reconciliation.

## Adjustments

The Adjustments page exposes:

- active and reversed manual adjustments
- adjustment preview before create
- reverse flow
- account-level ledger rebuild

Adjustment preview compares before and after open quantity, cost basis per share, gross cost, affected execution count, and, for execution overrides, affected matched lots and realized P&L impact.

