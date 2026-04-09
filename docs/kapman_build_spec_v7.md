# KapMan Build Spec v7

## Product statement

v7 is a full UX refactor of the KapMan Trading Journal MVP (v6).
The backend data pipeline — adapter, FIFO ledger, T1/T2/T3 layers, and all existing API routes — is **preserved exactly**.
v7 adds a production-quality UX layer on top of what v6 built:
- an editable, widget-based dashboard as the landing page
- a live open-positions view backed by Schwab Market Data quotes
- net liquidation value (NLV) per account using mark prices
- a global account selector that replaces all hardcoded account labels
- a consolidated Trade Records page (T1/T2/T3 in tabs)
- an Analytics page derived from existing data
- select-all / scrollable-list mode on every paginated table

The v7 refactor must not modify any Prisma schema, FIFO logic, T1/T2/T3 computation, or existing API route handlers.
All changes are additive: new routes, new components, new hooks, new context.

## v7 goals

1. **Dashboard** — replace the OverviewPage placeholder with a real, editable widget grid
2. **Open Positions** — derive open positions client-side from existing T1/T2 data; quote marks live from Schwab
3. **Net Liquidation Value** — cash snapshot + open position mark values per account
4. **Account Selector** — dynamic multi-select from real account IDs; no hardcoded labels anywhere
5. **Analytics** — new page derived entirely from existing API data, no new backend logic
6. **Trade Records** — merge Executions, Matched Lots, and Setups into a single tabbed page
7. **Table UX** — select-all mode (pageSize=1000) + scrollable list on every paginated table
8. **Design System** — v7 color tokens, redesigned sidebar and topbar, consistent badge/KPI components

## Product principles (unchanged from v6)

- FIFO is the immutable ledger of record
- T2 matched lot is the canonical tax/analytics unit
- T3 setup is the business-intelligence grouping layer
- Adapters stay lean: detect, parse, normalize, warn
- TTS outputs are evidence/readiness, not legal determination
- **New for v7:** all UI labels come from data, never from hardcoded strings

## Architecture

### Layer model

v7 adds two new layers above the existing v6 stack:

1. **Quote layer** — new server-side proxy routes (`/api/quotes`, `/api/option-quote`) that call Schwab Market Data REST API
2. **Client computation layer** — React hooks that derive open positions and NLV from existing paginated API data without any new DB queries

All other layers are unchanged: adapter, ledger, analytics, DB, containers, deploy.

### Data flow for open positions

```
/api/executions?pageSize=1000       →  useOpenPositions() hook
/api/matched-lots?pageSize=1000     →  cross-reference: TO_OPEN not in matched openExecutionId set
→ grouped by instrumentKey          →  net qty, cost basis per position
→ /api/quotes or /api/option-quote  →  live mark price per position
→ NLV = cash snapshot + mark values →  displayed in Account Balances widget
```

### Data flow for dashboard widgets

All 15 dashboard widgets are derived from existing APIs.
No new DB tables or Prisma queries are required for any widget except the streak tracker.

| Widget | Source |
|---|---|
| Portfolio KPI strip | `/api/overview/summary` |
| Equity Curve | `/api/overview/summary` → `snapshotSeries[]` |
| Account Balances + NLV | `snapshotSeries` + `/api/quotes` + `/api/option-quote` |
| Win/Loss/Flat Donut | `/api/matched-lots?pageSize=1000` → client aggregate |
| Holding Distribution | `/api/matched-lots?pageSize=1000` → client bucket |
| Symbol P&L Ranking | `/api/matched-lots?pageSize=1000` → client GROUP BY symbol |
| Monthly P&L Bars | `/api/matched-lots?pageSize=1000` → client GROUP BY YYYY-MM |
| Top Setups | `/api/setups?pageSize=1000` → sorted by realizedPnl |
| Setup Tag Rollup | `/api/setups?pageSize=1000` → client GROUP BY tag |
| Import Health | `/api/overview/summary` → `importQuality` |
| TTS Readiness | `/api/tts/evidence` |
| Diagnostics Badge | `/api/diagnostics` |
| Recent Executions | `/api/executions?pageSize=10` |
| Open Positions Summary | `useOpenPositions` + `/api/quotes` |
| Expectancy vs Hold Scatter | `/api/setups?pageSize=1000` |
| Win/Loss Streak | `/api/overview/streaks` (new) |

## Schwab Market Data integration

### Why not the MCP server

The Schwab MCP server is connected to the Claude AI conversation context, not to the Next.js runtime.
The app must call the Schwab Market Data REST API directly from server-side Next.js route handlers using OAuth credentials.
This is the same underlying API the MCP server wraps.

### OAuth token lifecycle

All Schwab API calls go through `lib/schwab-auth.ts`.

Required environment variables:
```
SCHWAB_CLIENT_ID=
SCHWAB_CLIENT_SECRET=
SCHWAB_REFRESH_TOKEN=
```

Token flow:
- POST to `https://api.schwabapi.com/v1/oauth/token` with `grant_type=refresh_token`
- cache access token in-process with expiry timestamp
- auto-refresh when within 60 seconds of expiry
- all proxy route handlers call `getAccessToken()` before every Schwab API request

### Equity quote endpoint

```
GET /api/quotes?symbols=SMH,QQQ,AMZN
```

Server calls: `https://api.schwabapi.com/marketdata/v1/quotes`

Returns:
```json
{
  "SMH": { "mark": 430.31, "bid": 430.0, "ask": 430.49, "last": 430.0, "netChange": 7.39, "netPctChange": 1.75 },
  ...
}
```

Cache: 30-second in-process cache per symbol set.
Error handling: non-200 responses return `{ "error": "unavailable" }` with HTTP 200 so UI can fall back gracefully.

### Option quote endpoint

```
GET /api/option-quote?symbol=QQQ&strike=585&expDate=2027-01-15&contractType=CALL
```

Server calls: `https://api.schwabapi.com/marketdata/v1/chains`
Parses `callExpDateMap` or `putExpDateMap` to locate the exact contract.

Returns:
```json
{ "mark": 57.3, "bid": 56.44, "ask": 58.15, "delta": 0.527, "theta": -0.071, "iv": 19.6, "dte": 281, "inTheMoney": true }
```

Error handling: same as equity endpoint — return `{ "error": "unavailable" }` on failure.

### Streak tracker endpoint (new)

```
GET /api/overview/streaks
```

Server queries matched lots ordered by `closeTradeDate` ascending, walks sequentially.

Returns:
```json
{ "currentStreak": 3, "currentStreakType": "WIN", "longestWinStreak": 7, "longestLossStreak": 5 }
```

## Open positions computation

Open positions are computed entirely client-side by `hooks/useOpenPositions.ts`.
No new database query, Prisma model, or backend route is required.

Algorithm:
1. Fetch `GET /api/executions?pageSize=1000` → all T1 rows
2. Fetch `GET /api/matched-lots?pageSize=1000` → all T2 rows
3. Build `Set<string>` of `openExecutionId` values from all matched lots
4. Filter executions: `openingClosingEffect === 'TO_OPEN'` AND `id NOT IN` the Set
5. Group by `instrumentKey`; for each group: net quantity (`BUY = +qty`, `SELL = -qty`), sum cost basis (`qty × price`)
6. Exclude groups where `netQty === 0`

Result type per position:
```ts
interface OpenPosition {
  symbol: string;
  underlyingSymbol: string;
  assetClass: 'OPTION' | 'EQUITY';
  optionType: 'CALL' | 'PUT' | null;
  strike: string | null;
  expirationDate: string | null;
  instrumentKey: string;
  netQty: number;
  costBasis: number;
  accountId: string;
}
```

## Net liquidation value computation

`hooks/useNetLiquidationValue.ts` computes NLV per account.

Formula per account:
```
NLV = latestSnapshotBalance + sum(equityMarkValue) + sum(optionMarkValue)

equityMarkValue  = mark × netQty
optionMarkValue  = mark × 100 × netQty   (positive for long, negative for short)
```

The latest snapshot balance comes from `snapshotSeries` in `/api/overview/summary`, filtered to the most recent entry per `accountId`.

If `/api/quotes` or `/api/option-quote` returns `{ "error": "unavailable" }`, the widget shows cash balance with a "NLV unavailable" indicator rather than crashing.

## New API routes summary

| Route | Method | Description | Issue |
|---|---|---|---|
| `/api/quotes` | GET | Equity/ETF mark prices from Schwab | KM-025 |
| `/api/option-quote` | GET | Single option contract mark + Greeks from Schwab | KM-026 |
| `/api/overview/streaks` | GET | Win/loss streak stats from matched lots | KM-030 |

All existing v6 routes are unchanged. New routes are additive only.

## Existing API surface (unchanged)

All existing v6 API routes are preserved with no modifications to handlers, query logic, or response shapes.

| Route | Notes |
|---|---|
| `GET /api/page-stats` | Returns `accountTotal`, `importTotal`, `snapshotTotal` |
| `GET /api/overview/summary` | Returns `netPnl`, `executionCount`, `matchedLotCount`, `setupCount`, `averageHoldDays`, `snapshotSeries[]`, `importQuality` |
| `GET /api/executions` | Supports `pageSize`, `page`, `symbol`, `accountId`, `importId`, `from`, `to`, `executionId` |
| `GET /api/matched-lots` | Supports `pageSize`, `page`, `symbol`, `accountId`, `outcome`, `from`, `to` |
| `GET /api/setups` | Supports `pageSize`, `page`, `accountId`, `tag` |
| `GET /api/setups/:id` | Detail with lots + executions |
| `GET /api/tts/evidence` | Returns all TTS metrics + `holdingPeriodDistribution[]` |
| `GET /api/diagnostics` | Returns parse/match/setup coverage + warnings + `setupInference` stats |
| `POST /api/imports/upload` | Multipart file upload |
| `POST /api/imports/:id/commit` | Commit import |
| `GET /api/imports` | Import history |
| `GET /api/health` | Health check |

All APIs support `pageSize=1000` to return the full dataset in a single call, which is required for client-side aggregation in dashboard widgets.

## Navigation structure

### v6 sidebar (7 flat items)
```
Overview
Imports & Connections
Executions
Matched Lots
Setups
TTS Evidence
Diagnostics
```

### v7 sidebar (4 groups, 7 items)
```
WORKSPACE
  Dashboard          /dashboard   (replaces Overview)
  Analytics          /analytics   (new)
  Open Positions     /positions   (new)

TRADE RECORDS
  Executions / Lots / Setups   /trade-records   (merged, tabbed)

IMPORT & DATA
  Imports & Connections   /imports   (tabbed: Upload / History / Adapters)

EVIDENCE & AUDIT
  TTS Evidence    /tts-evidence
  Diagnostics     /diagnostics
```

## Dashboard widget catalogue

All 15 widgets are user-configurable: addable via widget picker, removable, reorderable with drag-and-drop (`@dnd-kit/core`).
Widget layout is persisted to `localStorage`.
All widgets respect the global account selector filter.

| Widget | Source | Requires new endpoint | Default col span |
|---|---|---|---|
| Equity Curve | `/api/overview/summary` → `snapshotSeries` | No | 2 |
| Account Balances + NLV | `snapshotSeries` + `/api/quotes` + `/api/option-quote` | Yes (quotes) | 1 |
| Win/Loss/Flat Donut | `/api/matched-lots?pageSize=1000` | No | 1 |
| Holding Distribution | `/api/matched-lots?pageSize=1000` | No | 1 |
| Top Setups by P&L | `/api/setups?pageSize=1000` | No | 1 |
| Symbol P&L Ranking | `/api/matched-lots?pageSize=1000` | No | 2 |
| Monthly P&L Bars | `/api/matched-lots?pageSize=1000` | No | 2 |
| Setup Tag Rollup | `/api/setups?pageSize=1000` | No | 1 |
| Import Health | `/api/overview/summary` → `importQuality` | No | 1 |
| TTS Readiness | `/api/tts/evidence` | No | 1 |
| Diagnostics Badge | `/api/diagnostics` | No | 1 |
| Recent Executions | `/api/executions?pageSize=10` | No | 2 |
| Open Positions Summary | `useOpenPositions` + `/api/quotes` | Yes (quotes) | 1 |
| Expectancy vs Hold Scatter | `/api/setups?pageSize=1000` | No | 2 |
| Win/Loss Streak | `/api/overview/streaks` | Yes | 1 |

## Open positions page

Route: `/positions`
Sidebar group: WORKSPACE

Table columns:

| Column | Value | Format |
|---|---|---|
| Symbol | `underlyingSymbol` | Bold |
| Type | `assetClass` + `optionType` | Badge: CALL / PUT / EQUITY |
| Strike | `strike` | Mono, right-aligned; `—` for equity |
| Expiry | `expirationDate` | `MMM DD YYYY`; `—` for equity |
| DTE | Days from today to `expirationDate` | Integer; `<7d` red, `<30d` amber |
| Qty | `netQty` | `+N` green / `-N` red |
| Cost Basis | `costBasis` | `$N.NN` mono |
| Mark | `/api/quotes` or `/api/option-quote` | `$N.NN` mono + loading spinner |
| Mkt Value | `mark × qty × (option ? 100 : 1)` | `$N.NN` mono |
| Unrealized P&L | `mktValue − costBasis` | `+$N.NN` / `-$N.NN` color-coded |
| P&L % | `(mktValue − costBasis) / abs(costBasis)` | `+N.N%` / `-N.N%` |
| Account | last 4 chars of `accountId` | Muted |

Features: account selector filter, manual quote refresh button, last-quoted timestamp, select-all toggle.

## Account selector

The global account selector is a multi-select dropdown in the topbar.
It replaces all hardcoded account labels in the entire codebase.

Requirements:
- populate options from distinct `accountId` values returned by the API (not hardcoded)
- store selection in `AccountFilterContext` (`selectedAccounts: string[]`)
- all widgets, tables, and charts consume this context and filter accordingly
- default state: all accounts selected
- no string in the codebase may hardcode an account name, alias, or label such as "Paper money", "paper trading", or "D-68011053"

## Table UX — select-all mode

Every paginated table in the app must have a select-all toggle.
All existing APIs support `pageSize=1000` to return full datasets.

Behavior when activated:
- re-fetch with `pageSize=1000`
- hide pagination controls
- render table in scrollable container: `max-height: calc(100vh - 280px)`, `overflow-y: auto`
- show record count: "Showing all N records"

Behavior when deactivated:
- re-fetch with `pageSize=25`
- restore pagination controls

Persist preference per table in `localStorage` key: `kapman_table_{tableName}_showAll`.

Applies to: Executions, Matched Lots, Setups, Import History tables.

## Design system

### Color tokens (update `globals.css` and `tailwind.config`)

```css
:root {
  --bg:       #090f1e;
  --panel:    #121933;
  --panel-2:  #182145;
  --muted:    #9ca9c9;
  --text:     #eef3ff;
  --accent:   #67a3ff;
  --accent-2: #7ef0c6;
  --border:   rgba(255, 255, 255, 0.1);
}
```

Body background: `radial-gradient(circle at 0% 0%, #152245 0%, #090f1e 42%, #050913 100%)`

### Sidebar

- Width: 220px
- Background: `#0a1020`
- Logo mark: teal square with "KM"
- Nav groups with uppercase muted labels: WORKSPACE / TRADE RECORDS / IMPORT & DATA / EVIDENCE & AUDIT
- Active item: left-border accent indicator (`var(--accent)`)
- Badge counts on items with data
- Footer: version string only

### Topbar

- Height: 44px
- Background: `rgba(18, 25, 51, 0.9)` (semi-transparent navy)
- Page title (bold), contextual badges
- Account selector dropdown (right-aligned)
- No hardcoded labels

### Shared components

- `KpiCard` — uppercase muted label, large mono value with pos/neg/neutral/accent color variants, muted subtitle
- `Badge` — variants: buy, sell, call, put, win, loss, flat, to-open, to-close, committed, stub
- All charts use Recharts (already installed in v6)
- Drag-and-drop uses `@dnd-kit/core`

## Technical stack

Same as v6 with two additions:

| Addition | Purpose |
|---|---|
| `@dnd-kit/core` | Widget drag-and-drop reorder in dashboard |
| `lib/schwab-auth.ts` | Schwab OAuth token lifecycle (new file, no new package) |

All other stack choices from v6 are unchanged: Next.js 14.2.x, TypeScript 5.4.x, Prisma 5.14.x, PostgreSQL, Tailwind 3.4.x, Recharts 2.12.x, TanStack Table 8.17.x.

## Environment additions

Add to `.env.example` and `.env.local`:

```
SCHWAB_CLIENT_ID=
SCHWAB_CLIENT_SECRET=
SCHWAB_REFRESH_TOKEN=
```

These are required only for live quote features (Open Positions, NLV).
The app must remain fully functional for all non-quote features when these vars are absent.

## Non-goals for v7

- Modifying the Prisma schema
- Changing T1/T2/T3 computation logic
- Changing existing API route handlers
- Adding broker adapters or ingestion changes
- Journaling/notes editor
- Mobile-native app
- Legal determination of TTS qualification
- Options Greeks analytics (beyond mark price for NLV)

## Acceptance criteria

v7 is complete when:

1. `docker compose up` starts and seeds fixture data identically to v6.
2. The root route (`/`) redirects to `/dashboard` and renders the editable widget dashboard.
3. The account selector dropdown populates from real `accountId` values in the data; no hardcoded account labels exist anywhere in the codebase.
4. All 15 dashboard widgets render from live API data; at least the Equity Curve, Win/Loss/Flat, and Top Setups widgets are functional.
5. The Open Positions page (`/positions`) lists all 20 currently open positions (per the cross-reference computation), with live mark prices from Schwab when `SCHWAB_*` env vars are set.
6. Account Balances widget shows both cash balance (from snapshots) and NLV (cash + mark values) when quotes are available.
7. `/trade-records` renders Executions, Matched Lots, and Setups as three tabs with all existing filter functionality preserved.
8. Every paginated table has a "Show all" toggle that loads `pageSize=1000` and switches to a scrollable list.
9. The sidebar shows 4 groups with correct labels; no "MVP routing shell", "Placeholder", or "Paper money" strings exist anywhere in the rendered UI.
10. TypeScript compiles clean with no new errors introduced. Existing tests pass.
