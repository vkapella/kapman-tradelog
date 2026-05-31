# Account Value Curve & Excursion Analysis — Overview / Primer

> **Read this first.** Every story file in this directory is self-contained, but this
> document is the shared context primer. If you are an autonomous coding agent picking
> up a single story, read this file plus that story's "Context primer" section before
> writing code.

## 1. Goal

Add an **Analysis-page screen** that shows, for any selected accounts and date range, the
**daily history** of account value broken into:

- **Cash** value
- **Stock/ETF** (equity) market value
- **Options** market value
- **Total** value (= the three above)

…plus, where the broker reported it, the broker Net Liquidation Value (NLV) overlaid as a
**reconciliation** check.

Second deliverable: **MFE / MAE** (Maximum Favorable Excursion / Maximum Adverse
Excursion) computed **per matched lot** (entry → exit), rolling up per setup and symbol.

## 2. Locked product decisions

These were decided with the product owner. Do not relitigate them in code.

| Decision | Value |
|---|---|
| Time granularity | **Daily end-of-day** (one point per trading day). MFE/MAE use daily high/low. |
| MFE/MAE level | **Per matched lot** (`MatchedLot`), rolled up per setup/symbol. |
| Source of truth | **Reconstructed** value (executions + historical marks). Broker NLV is shown as a reconciliation delta where present, never as the primary number. |
| Cash source | **`CashEvent`** ledger (cumulative), reconciled against `DailyAccountSnapshot.totalCash`. |
| Backfill scope | **All history, all traded symbols.** |
| Historical price source | **Massive/Polygon S3 flat files** (daily aggregates), ported to TypeScript. |
| Reuse model | **Port to TypeScript** in this repo. `kapman-trader` (Python) is the reference implementation, not a runtime dependency. |

## 3. What already exists (do not rebuild)

Verified in the codebase as of this spec:

- **`DailyAccountSnapshot`** (`prisma/schema.prisma`): per account/date `balance`, `totalCash`,
  optional `brokerNetLiquidationValue`. Powers the *current* cash/balance curve only.
- **`Execution`**: full trade ledger with `assetClass` (`EQUITY`/`OPTION`/`CASH`/`OTHER`),
  `symbol`, `underlyingSymbol`, `optionType`, `strike`, `expirationDate`, `instrumentKey`,
  `quantity`, `price`, `side`, `openingClosingEffect`, `tradeDate`, `eventTimestamp`.
- **`MatchedLot`**: FIFO-matched open→close lots with `openExecutionId`, `closeExecutionId`,
  `quantity`, `realizedPnl`, `holdingDays`, `outcome`. The open/close executions carry
  `tradeDate` and `symbol`. **This is the anchor for MFE/MAE.**
- **`CashEvent`**: dated cash ledger rows (`eventDate`, `rowType`, `amount`).
- **`computeOpenPositions()`** (`src/lib/positions/compute-open-positions.ts`): nets
  executions and subtracts matched-lot quantity to produce **current** open positions split
  by asset class. **It has no date parameter** — it is point-in-time by construction.
- **Snapshot compute** (`src/app/api/positions/snapshot/compute/route.ts`): already marks
  equity vs option positions live and sums marked value by account. This is the math the new
  daily engine reuses — it just needs to run *as-of each historical date* with *historical*
  marks.
- **Live quotes** (`src/lib/mcp/market-data.ts`): current quotes via MCP (`get_quotes`,
  `get_option_chain`). **Current only — no historical marks anywhere.**
- **API/UI conventions**: `detailResponse`/`errorResponse`/`listResponse`
  (`src/lib/api/responses.ts`); account/date scope helpers in
  `src/lib/api/account-scope.ts` (`parseAccountIds`, `parseDateRangeParams`,
  `buildAccountScopeWhere`, `buildAccountIdWhere`, `toEndOfDayUtcIso`); charts use
  `recharts`; the Analysis page is `src/app/analytics/page.tsx` and already consumes
  `AccountFilterContext` + `RangeFilterContext`.

## 4. The two real gaps this project fills

1. **An as-of-date holdings engine** — reconstruct what was held on date `D`.
2. **A historical mark store** — daily OHLC for every held equity and option contract.

Everything else (charting, API scoping, asset-class split math) already exists in some form.

## 5. New components (target state)

| Component | Story | Kind |
|---|---|---|
| `HistoricalMark`, `AccountValueSnapshot`, `LotExcursion` models | 01 | Prisma + migration |
| `computeHoldingsAsOf()` | 02 | Pure function + tests |
| S3 flat-file equity ingestion (`HistoricalMark`) | 03 | TS port of `kapman-trader` |
| Daily valuation backfill job → `AccountValueSnapshot` + reconciliation | 04 | `tsx` script |
| `GET /api/analysis/account-value-series` | 05 | Next route |
| Analysis-page stacked-area + total + broker overlay widget | 06 | React/recharts |
| S3 flat-file **option** ingestion (OPRA prefix + OCC parser) | 07 | TS port + new parser |
| `LotExcursion` compute + MFE/MAE UI | 08 | Engine + UI |

## 6. Build order & dependency graph

```
01 ─┬─> 02 ─┐
    ├─> 03 ─┼─> 04 ─> 05 ─> 06     (equity-only vertical slice ships here)
    │       │
    └────── 07 ───────┘            (adds option marks; re-run 04)
02 + (03|07) ─> 08                  (MFE/MAE)
```

**Ship 01→06 first with equities only.** That is a usable screen (cash + stock/ETF + total,
options shown as "unpriced" until 07 lands). Then 07 backfills option marks and 08 adds
MFE/MAE.

## 7. Canonical instrument keys (shared contract — read carefully)

`HistoricalMark`, `computeHoldingsAsOf`, and the marking step must agree on one key per
instrument. Use this canonical scheme:

- **Equity/ETF:** `instrumentKey = SYMBOL.toUpperCase()` (e.g. `"AAPL"`).
- **Option:** `instrumentKey = "{UNDERLYING}|{CALL|PUT}|{STRIKE}|{YYYY-MM-DD}"`
  (e.g. `"SPY|CALL|500|2026-01-16"`). This matches
  `buildOptionInstrumentKey` in `src/lib/mcp/market-data.ts` and the option branch of
  `fallbackInstrumentKey` in `compute-open-positions.ts`.

The OPRA flat files use the **OCC ticker** form `O:SPY260116C00500000`. Story 07 defines a
bijective `occToCanonical()` / `canonicalToOcc()` converter so option marks land under the
canonical key. **All joins between holdings and marks happen on the canonical key.**

## 8. Glossary

- **NLV** — Net Liquidation Value: total account worth if liquidated now.
- **Mark** — the price used to value a held instrument on a given day (here: daily close).
- **As-of holdings** — the set of open positions as they stood at the end of a past date.
- **MFE** — Maximum Favorable Excursion: best unrealized gain reached during a lot's holding
  window.
- **MAE** — Maximum Adverse Excursion: worst unrealized loss reached during the window.
- **OPRA** — Options Price Reporting Authority; the options flat-file dataset.
- **OCC ticker** — standardized option symbol, e.g. `O:SPY260116C00500000`.

## 9. Reference implementation (Python → TypeScript)

`kapman-trader` (sibling repo) already solves the flat-file ingestion. Port, don't reinvent.
Stories 03 and 07 cite exact files. Key ones:

- `core/ingestion/ohlcv/s3_flatfiles.py` — S3 client, key layout
  (`us_stocks_sip/day_aggs_v1/YYYY/MM/YYYY-MM-DD.csv.gz`), date listing, gzip streaming.
- `core/ingestion/ohlcv/parser.py` — CSV columns (`ticker`, `open/o`, `high/h`, `low/l`,
  `close/c`, `volume/v`, `window_start` ns timestamp), dedup, missing-symbol handling.
- `core/providers/market_data/polygon_s3.py` — provider-class variant of the same.
- `core/providers/market_data/polygon_options.py` — **live snapshot only**, NOT historical;
  do not copy for historical option marks. Use the OPRA flat-file prefix instead (story 07).

## 10. Conventions every story must follow

- **Tests:** `vitest` (`npm test`). Co-locate `*.test.ts` next to source, matching existing
  files (e.g. `compute-open-positions` has no test yet — add one if you touch it).
- **Money:** `Prisma.Decimal` at the DB boundary; convert to `number` only for arithmetic, as
  existing code does. Persist with `.toFixed(6)`.
- **Migrations:** `npx prisma migrate dev --name <snake_case>`; do not hand-write timestamps.
- **Jobs:** `tsx scripts/<name>.ts`, registered in `package.json` scripts, following
  `scripts/rebuild-pnl.ts` style (instantiate `PrismaClient`, `main()`, structured logs).
- **API:** use `detailResponse`/`errorResponse`; parse scope with `account-scope.ts` helpers.
- **Validation:** `zod` for request/response shapes (already a dependency).
- **No secrets in code.** New env vars go in `.env.example` with comments (story 03).
- **Typecheck + lint must pass:** `npm run typecheck && npm run lint && npm test`.
