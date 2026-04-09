# KapMan GitHub Issues v7

---

## Issue KM-031 — v7 color system and design tokens

Update `globals.css` and `tailwind.config` with the v7 design token set.

Deliverables:
- CSS custom properties on `:root`:
  - `--bg: #090f1e`
  - `--panel: #121933`
  - `--panel-2: #182145`
  - `--muted: #9ca9c9`
  - `--text: #eef3ff`
  - `--accent: #67a3ff`
  - `--accent-2: #7ef0c6`
  - `--border: rgba(255, 255, 255, 0.1)`
- Body background: `radial-gradient(circle at 0% 0%, #152245 0%, #090f1e 42%, #050913 100%)`
- Tailwind config extended with these values as theme tokens
- All tokens usable as `var(--accent)` in CSS and `text-accent` / `bg-panel` in Tailwind class names

Acceptance criteria:
- no hardcoded hex values appear in any new component file
- existing pages continue to render without visual breakage
- `npm run typecheck` and `npm run lint` pass clean after this change

---

## Issue KM-003 — Purge all hardcoded placeholder and account label strings

Remove every developer-facing and hardcoded string from rendered UI output.

Strings to search for and remove from rendered output:
- `"Paper money"` and `"paper trading"` and `"paper_money"`
- `"MVP routing shell"`
- `"Placeholder"` (in any heading, subheading, or page description)
- `"OverviewPage"`, `"ImportsConnectionsPage"`, `"ExecutionsPage"`, `"MatchedLotsPage"`, `"SetupsPage"`, `"TtsEvidencePage"`, `"DiagnosticsPage"` (as rendered text; component names may remain)

Note: the `paper_money` flag on the accounts table is a legitimate data field and must not be removed from the schema or API response. Only remove it from rendered UI labels.

Acceptance criteria:
- global text search finds zero instances of the above strings in any `.tsx`, `.ts`, `.css`, or `.html` file that affects rendered output
- all pages still render without console errors after the purge
- `npm run typecheck` passes

---

## Issue KM-002 — Global account selector context and topbar dropdown

Create the account selector — the primary global filter for all v7 surfaces.

Deliverables:
- `contexts/AccountFilterContext.tsx` with:
  - `availableAccounts: string[]` — distinct account IDs from the API
  - `selectedAccounts: string[]` — currently selected (default: all)
  - `setSelectedAccounts: (ids: string[]) => void`
- Wrap app layout with `AccountFilterContextProvider`
- Multi-select dropdown in topbar, right-aligned before action buttons
- Populate `availableAccounts` by calling `/api/executions?pageSize=1` (or `/api/page-stats`) and collecting distinct `accountId` values
- Default state: all accounts selected

Acceptance criteria:
- account IDs in the dropdown are real values from the database, never hardcoded
- selecting/deselecting accounts updates `selectedAccounts` in context
- the dropdown renders correctly in the topbar with no overflow or z-index issues
- `AccountFilterContext` is exported and importable by any component

---

## Issue KM-034 — KpiCard shared component

Create a reusable KPI card component used across all data pages and the dashboard KPI strip.

Deliverables:
- `components/KpiCard.tsx`
- Props: `label: string`, `value: string | number`, `sub?: string`, `colorVariant?: 'pos' | 'neg' | 'neutral' | 'accent'`
- Layout: uppercase muted label above, large mono-font value below, optional muted subtitle beneath value
- Color variants: `pos` = `var(--accent-2)`, `neg` = red, `neutral` = `var(--text)`, `accent` = `var(--accent)`
- Background: `var(--panel)`, border: `1px solid var(--border)`, border-radius matches v7 design tokens

Acceptance criteria:
- component renders correctly in isolation with all four color variants
- used in at least one location before the issue is closed

---

## Issue KM-035 — Badge shared component

Create a reusable badge/tag component used in all tables.

Deliverables:
- `components/Badge.tsx`
- Prop: `variant: 'buy' | 'sell' | 'call' | 'put' | 'win' | 'loss' | 'flat' | 'to-open' | 'to-close' | 'committed' | 'stub'`
- Optional prop: `children?: React.ReactNode` (falls back to uppercase variant name if not provided)
- Color mapping:
  - `buy`, `win`, `committed` → green fill + green text
  - `sell`, `loss` → red fill + red text
  - `call`, `to-open` → blue fill + blue text
  - `put` → purple fill + purple text
  - `to-close` → amber fill + amber text
  - `flat`, `stub` → muted fill + muted text
- Style: `border-radius: 99px`, `font-size: 9px`, `font-weight: 700`, `padding: 2px 6px`

Acceptance criteria:
- all variants render correctly
- used to replace any inline badge styling in existing Executions and Matched Lots tables

---

## Issue KM-032 — Sidebar v7 redesign

Replace the existing sidebar with the v7 design.

Deliverables:
- Sidebar width: 220px, background: `#0a1020`
- Logo mark: teal rounded square containing "KM" in white, followed by "KapMan Trading Journal" name and version string
- Nav groups with all-caps muted labels: WORKSPACE / TRADE RECORDS / IMPORT & DATA / EVIDENCE & AUDIT
- Nav items: 11px font, left-border active indicator using `var(--accent)`, active background `rgba(103, 163, 255, 0.1)`
- Badge counts on: Trade Records (execution count), Imports (import count) — values sourced from `/api/page-stats`
- Footer: version string only (e.g. `v7.0 · 2 accounts · 470 snapshots`)

Nav structure:
```
WORKSPACE
  Dashboard          /dashboard
  Analytics          /analytics
  Open Positions     /positions

TRADE RECORDS
  Executions / Lots / Setups  /trade-records  [badge: execution count]

IMPORT & DATA
  Imports & Connections  /imports  [badge: import count]

EVIDENCE & AUDIT
  TTS Evidence    /tts-evidence
  Diagnostics     /diagnostics
```

Acceptance criteria:
- all 7 routes are reachable from the sidebar with no 404s
- active state is visually distinct with left-border indicator
- sidebar is responsive at 1280px+ viewport width
- no hardcoded account labels or "MVP routing shell" text appears

---

## Issue KM-033 — Topbar v7 redesign

Replace the existing topbar with the v7 design.

Deliverables:
- Height: 44px, background: `rgba(18, 25, 51, 0.9)`, border-bottom: `1px solid var(--border)`
- Page title (bold, 12px) from route context
- Contextual badges (e.g. record counts, date ranges) — each page manages its own badge content
- Account selector dropdown (from KM-002) right-aligned before action buttons
- No hardcoded labels of any kind

Acceptance criteria:
- account selector renders correctly in topbar on every page
- page title updates correctly on route change
- topbar does not overflow or collapse at 1280px viewport width

---

## Issue KM-001 — Scaffold /dashboard route (replace Overview placeholder)

Create the `/dashboard` route as the new landing page.

Deliverables:
- `/app/dashboard/page.tsx` (or `/app/page.tsx` with redirect, depending on existing routing structure)
- Root route `/` redirects to `/dashboard`
- Page layout: persistent KPI strip at top (6 `KpiCard` components from `/api/overview/summary`), then the widget grid area below
- KPI strip values: `netPnl` (neg color), `executionCount` (accent), `matchedLotCount` (accent), `setupCount` (accent), `averageHoldDays` (accent), `snapshotCount` (neutral)

Acceptance criteria:
- navigating to `/` or `/dashboard` renders the dashboard without a 404
- the KPI strip shows real values from `/api/overview/summary`
- the Overview placeholder page is removed or redirected
- loading and error states are handled for the KPI strip

---

## Issue KM-004 — Consolidated /trade-records page with T1/T2/T3 tabs

Merge the three separate Executions, Matched Lots, and Setups pages into a single tabbed page.

Deliverables:
- `/app/trade-records/page.tsx` with three tabs: Executions (T1), Matched Lots (T2), Setups (T3)
- Move existing page components into tab panels — do not rewrite them, just relocate
- Sidebar nav item "Executions / Lots / Setups" links to `/trade-records`
- Topbar badge shows total execution count from `meta.total`
- Deep-link support: `/trade-records?tab=matched-lots` opens directly to the Matched Lots tab
- All existing filter functionality (symbol, account, date, outcome, tag) is preserved within each tab
- Export button per tab (existing behavior preserved)

Acceptance criteria:
- all three tabs render with real data
- all existing filter controls work within each tab
- existing `/executions`, `/matched-lots`, and `/setups` routes redirect to `/trade-records?tab=executions` etc. so no bookmarks break
- select-all toggle (from KM-029) is present on each tab's table

---

## Issue KM-006 — Add tabs to /imports page

Reorganize the Imports & Connections page into three tabs.

Deliverables:
- Tab 1 "Upload Statement": existing file input, upload button, detection result, parse preview, commit summary
- Tab 2 "Import History": existing import history table
- Tab 3 "Adapter Registry": existing adapter list (Schwab thinkorswim ACTIVE, Fidelity STUB)
- All existing import workflow behavior is preserved; this is a UI reorganization only

Acceptance criteria:
- all three tabs render correctly
- the import upload workflow is fully functional within tab 1
- import history table is in tab 2 with the select-all toggle (from KM-029)
- no existing import functionality is broken

---

## Issue KM-028 — lib/schwab-auth.ts — Schwab OAuth token lifecycle

Create the server-side Schwab OAuth token manager.

Deliverables:
- `lib/schwab-auth.ts`
- Reads `SCHWAB_CLIENT_ID`, `SCHWAB_CLIENT_SECRET`, `SCHWAB_REFRESH_TOKEN` from `process.env`
- `getAccessToken(): Promise<string>` — POSTs to `https://api.schwabapi.com/v1/oauth/token` with `grant_type=refresh_token`
- Caches access token in-process with expiry timestamp
- Auto-refreshes when within 60 seconds of expiry
- If any of the three env vars are absent, throws a typed error that callers can catch to return `{ "error": "unavailable" }`
- Add `SCHWAB_CLIENT_ID`, `SCHWAB_CLIENT_SECRET`, `SCHWAB_REFRESH_TOKEN` to `.env.example` with empty values and a comment explaining they are optional (required only for live quotes)

Acceptance criteria:
- `getAccessToken()` returns a valid token when env vars are set
- `getAccessToken()` throws a recognizable error when env vars are absent
- token is not re-fetched on every call — in-process cache is used until within 60s of expiry
- no Schwab credentials are logged or exposed in API responses

---

## Issue KM-025 — /api/quotes — Schwab equity mark price proxy

Create the equity/ETF quote proxy endpoint.

Deliverables:
- `app/api/quotes/route.ts`
- `GET /api/quotes?symbols=SMH,QQQ,AMZN`
- Calls `https://api.schwabapi.com/marketdata/v1/quotes` with bearer token from `lib/schwab-auth.ts`
- Returns:
  ```json
  { "SMH": { "mark": 430.31, "bid": 430.0, "ask": 430.49, "last": 430.0, "netChange": 7.39, "netPctChange": 1.75 } }
  ```
- 30-second in-process cache keyed by sorted symbol list
- On Schwab API error or missing env vars: returns HTTP 200 with `{ "error": "unavailable" }`
- Add shared response type to `/types/api.ts`

Acceptance criteria:
- returns real marks for equity symbols when env vars are set
- returns `{ "error": "unavailable" }` (not a 4xx/5xx) when env vars are absent
- cache prevents redundant Schwab API calls within 30 seconds
- `npm run typecheck` passes with the new route and types

---

## Issue KM-026 — /api/option-quote — Schwab option mark price proxy

Create the option contract quote proxy endpoint.

Deliverables:
- `app/api/option-quote/route.ts`
- `GET /api/option-quote?symbol=QQQ&strike=585&expDate=2027-01-15&contractType=CALL`
- Calls `https://api.schwabapi.com/marketdata/v1/chains` with bearer token from `lib/schwab-auth.ts`
- Parses `callExpDateMap` or `putExpDateMap` to locate the exact contract entry for the given strike and expiry
- Returns:
  ```json
  { "mark": 57.3, "bid": 56.44, "ask": 58.15, "delta": 0.527, "theta": -0.071, "iv": 19.6, "dte": 281, "inTheMoney": true }
  ```
- On Schwab API error, contract not found, or missing env vars: returns HTTP 200 with `{ "error": "unavailable" }`
- Add shared response type to `/types/api.ts`

Acceptance criteria:
- returns correct option mark for a known open position instrument key when env vars are set
- returns `{ "error": "unavailable" }` (not 4xx/5xx) on any failure mode
- `npm run typecheck` passes

---

## Issue KM-022 — useOpenPositions hook

Compute open positions client-side from existing API data.

Deliverables:
- `hooks/useOpenPositions.ts`
- Fetches `/api/executions?pageSize=1000` and `/api/matched-lots?pageSize=1000`
- Builds `Set<string>` of `openExecutionId` from all matched lots
- Filters: `openingClosingEffect === 'TO_OPEN'` AND `id NOT IN` the Set
- Groups by `instrumentKey`; for each group: nets quantity (`BUY = +qty`, `SELL = -qty`), sums cost basis (`qty × price`)
- Excludes groups where `netQty === 0`
- Returns `{ positions: OpenPosition[], loading: boolean, error: string | null }`
- `OpenPosition` type added to `/types/api.ts`

Acceptance criteria:
- hook returns the correct open positions (verified against the known 20 open positions in the test dataset)
- no Prisma access or direct database calls in the hook
- loading and error states behave correctly
- `npm run typecheck` passes

---

## Issue KM-023 — Open Positions page (/positions)

Create the Open Positions page.

Deliverables:
- `/app/positions/page.tsx`
- Uses `useOpenPositions()` hook for position data
- Uses `/api/quotes` for equity marks and `/api/option-quote` for option marks (fetched in parallel)
- Table columns: Symbol, Type (badge), Strike, Expiry, DTE, Qty, Cost Basis, Mark, Mkt Value, Unrealized P&L, P&L%, Account
- DTE color coding: `< 7d` red, `< 30d` amber, otherwise default text color
- Qty color coding: positive green, negative red
- P&L and P&L% color coding: positive green, negative red
- Mark column shows loading spinner while quote is fetching; "—" if `{ "error": "unavailable" }`
- Topbar: position count badge, "Last quoted: HH:MM:SS" timestamp, refresh button to re-fetch marks
- Account selector filters the table
- Select-all toggle (from KM-029)
- Loading, empty, and populated states

Acceptance criteria:
- page renders all open positions with correct cost basis values
- live marks appear when Schwab env vars are configured
- "—" appears in Mark column (not an error) when Schwab env vars are absent
- DTE values are calculated from `new Date()` at render time
- account selector correctly filters rows
- select-all toggle works on the positions table

---

## Issue KM-027 — useNetLiquidationValue hook

Compute net liquidation value per account.

Deliverables:
- `hooks/useNetLiquidationValue.ts`
- Accepts `accountId: string`
- Reads latest cash balance from `snapshotSeries` in `/api/overview/summary` for the given account (most recent entry by `snapshotDate`)
- Reads open positions for the account from `useOpenPositions()`
- Fetches marks via `/api/quotes` (equity) and `/api/option-quote` (options)
- Computes: `NLV = latestCash + sum(equityMark × netQty) + sum(optionMark × 100 × netQty)`
- Returns: `{ nlv: number | null, cash: number, lastUpdated: Date | null, loading: boolean }`
- If quotes unavailable: `nlv: null`, `cash: latestCash`, `lastUpdated: null`
- `NLV` type added to `/types/api.ts`

Acceptance criteria:
- NLV is computed correctly for a known account with known open positions
- hook returns `nlv: null` and does not throw when Schwab env vars are absent
- cash balance is always returned even when NLV is unavailable

---

## Issue KM-007 — Dashboard editable widget grid with drag-and-drop

Implement the core dashboard layout, edit mode, and widget persistence.

Deliverables:
- `/app/dashboard/page.tsx` — full dashboard layout with KPI strip + widget grid
- Widget grid: 3-column CSS Grid, widgets span 1 or 2 columns per `defaultColSpan` in registry
- Customize button in topbar toggles edit mode
- Edit mode: drag handles visible (`@dnd-kit/core` for reorder), remove (×) button on each widget, Add widget (+) tile at end
- Done button exits edit mode
- Widget layout persisted to `localStorage` key `kapman_dashboard_layout` as ordered array of widget IDs
- Default layout on first visit: `['equity-curve', 'account-balances', 'win-loss-flat', 'holding-dist', 'top-setups', 'import-health']`
- All widgets respect `AccountFilterContext`

Acceptance criteria:
- edit mode activates and deactivates cleanly
- dragging a widget to a new position persists on next page load
- removing a widget removes it from the grid and from `localStorage`
- the default 6-widget layout renders on first visit when `localStorage` has no saved layout
- `@dnd-kit/core` is listed in CHANGES.md

---

## Issue KM-021 — Widget picker panel

Implement the widget picker modal for adding new widgets in edit mode.

Deliverables:
- `components/WidgetPicker.tsx` — modal panel rendered within the dashboard page
- Opens when the Add widget (+) tile is clicked in edit mode
- Grid of all 15 widget types from `WIDGET_REGISTRY`, each showing name and description
- Clicking a widget type adds a new instance to the end of the grid and closes the picker
- Pressing Escape or clicking outside closes the picker without adding a widget
- Already-present widgets are not disabled — duplicates are allowed

Acceptance criteria:
- all 15 widget types appear in the picker
- adding a widget from the picker updates the grid and persists to `localStorage`
- picker is only reachable when in edit mode
- picker closes without side effects when dismissed

---

## Issue KM-008 — Widget: Equity Curve

Deliverables:
- `components/widgets/EquityCurveWidget.tsx`
- Data: `/api/overview/summary` → `snapshotSeries[]` (470 daily points, 2 accounts)
- Recharts `LineChart` with two series (one per account) and a combined sum series
- Toggle: "Combined" / "Per Account" view
- Y-axis labeled in `$K`
- Respects `AccountFilterContext` (filters to selected accounts)
- Spans 2 columns

Acceptance criteria:
- chart renders with real snapshot data
- combined and per-account toggle works
- account filter hides/shows the correct series

---

## Issue KM-009 — Widget: Account Balances + NLV

Deliverables:
- `components/widgets/AccountBalancesWidget.tsx`
- Uses `useNetLiquidationValue(accountId)` per account
- Shows per account: account ID, cash balance (from snapshot), NLV (cash + marks), progress bar scaled to $100K starting capital
- "Last quoted: HH:MM:SS" timestamp
- Manual refresh button re-fetches marks
- When NLV unavailable: shows "NLV unavailable" in amber, shows cash balance only
- Respects `AccountFilterContext`

Acceptance criteria:
- cash balance always renders
- NLV renders when Schwab env vars are set
- "NLV unavailable" state renders without error when env vars are absent
- refresh button triggers a new mark fetch

---

## Issue KM-010 — Widget: Win/Loss/Flat Donut

Deliverables:
- `components/widgets/WinLossFlatWidget.tsx`
- Data: `/api/matched-lots?pageSize=1000` → client-side aggregate `outcome` field → WIN/LOSS/FLAT counts
- Recharts `PieChart` with `Customized` center label showing win rate percentage
- Custom legend below chart with counts
- Respects `AccountFilterContext`

Acceptance criteria:
- donut renders with correct WIN/LOSS/FLAT counts
- win rate in center label matches `WIN / (WIN + LOSS)` excluding FLAT
- account filter correctly changes counts

---

## Issue KM-011 — Widget: Holding-Period Distribution

Deliverables:
- `components/widgets/HoldingDistributionWidget.tsx`
- Data: `/api/matched-lots?pageSize=1000` → client-side bucket `holdingDays` into `0–1d`, `2–5d`, `6–20d`, `21d+`
- Recharts horizontal `BarChart`
- Respects `AccountFilterContext`

Acceptance criteria:
- bars render with correct bucket counts
- matches the distribution shown on the TTS Evidence page for the same account selection

---

## Issue KM-012 — Widget: Top Setups by P&L

Deliverables:
- `components/widgets/TopSetupsWidget.tsx`
- Data: `/api/setups?pageSize=1000` → sorted by `realizedPnl` descending → top 10
- Horizontal bar list: `tag` + `underlyingSymbol` | bar | `realizedPnl`
- Green bars for positive, red bars for negative
- Respects `AccountFilterContext`

Acceptance criteria:
- lists top 10 setups by realized P&L correctly
- green/red coloring matches P&L sign

---

## Issue KM-013 — Widget: Symbol P&L Ranking

Deliverables:
- `components/widgets/SymbolPnlWidget.tsx`
- Data: `/api/matched-lots?pageSize=1000` → client-side GROUP BY `symbol` summing `realizedPnl`
- Two ranked bar lists: top 10 winners (green) and top 10 losers (red)
- Respects `AccountFilterContext`
- Spans 2 columns

Acceptance criteria:
- winners and losers lists render separately with correct values
- account filter changes both lists correctly

---

## Issue KM-014 — Widget: Monthly P&L Bars

Deliverables:
- `components/widgets/MonthlyPnlWidget.tsx`
- Data: `/api/matched-lots?pageSize=1000` → client-side GROUP BY `closeTradeDate.slice(0, 7)` (YYYY-MM) summing `realizedPnl`
- Recharts `BarChart`, green bars for positive months, red for negative
- X-axis labels: month abbreviations
- Respects `AccountFilterContext`
- Spans 2 columns

Acceptance criteria:
- correct monthly P&L totals render for all months in the dataset
- positive/negative color coding is correct

---

## Issue KM-015 — Widget: Setup Tag Rollup

Deliverables:
- `components/widgets/SetupTagRollupWidget.tsx`
- Data: `/api/setups?pageSize=1000` → client-side GROUP BY `tag` summing `realizedPnl` and counting setups
- Recharts `BarChart` or `PieChart` showing P&L per tag
- Respects `AccountFilterContext`

Acceptance criteria:
- all observed tags appear (long_call, stock, bull_vertical, diagonal, CUSTOM, COMBO, uncategorized)
- P&L per tag is correctly summed

---

## Issue KM-016 — Widget: Import Health Scorecard

Deliverables:
- `components/widgets/ImportHealthWidget.tsx`
- Data: `/api/overview/summary` → `importQuality`
- Shows: total imports, committed, failed, parsed rows, skipped rows
- Green indicator when `failedImports === 0` and `skippedRows === 0`; amber otherwise
- Link: "View imports →" navigates to `/imports`

Acceptance criteria:
- all five importQuality fields render with correct values
- green/amber indicator state is correct

---

## Issue KM-017 — Widget: TTS Readiness Scorecard

Deliverables:
- `components/widgets/TtsReadinessWidget.tsx`
- Data: `/api/tts/evidence`
- Shows 6 metrics in 2×3 grid: `tradesPerMonth`, `activeDaysPerWeek`, `annualizedTradeCount`, `averageHoldingPeriodDays`, `medianHoldingPeriodDays`, `grossProceedsProxy`
- Labels the content as "evidence/readiness signals — not legal determinations" (same disclaimer as TTS Evidence page)

Acceptance criteria:
- all 6 metrics render with correct values
- disclaimer text is present

---

## Issue KM-018 — Widget: Diagnostics Health Badge

Deliverables:
- `components/widgets/DiagnosticsWidget.tsx`
- Data: `/api/diagnostics`
- Shows: parse coverage, matching coverage (green if 1.0), warning count (amber if > 0), pair ambiguity count (amber if > 0), synthetic expiration count (amber if > 0)
- Summary line: "All clear" or "N warnings" with color coding
- Link: "View diagnostics →" navigates to `/diagnostics`

Acceptance criteria:
- green "All clear" renders when `warningsCount === 0` and both coverages are 1.0
- amber summary renders when any metric is non-zero

---

## Issue KM-019 — Widget: Recent Executions Feed

Deliverables:
- `components/widgets/RecentExecutionsWidget.tsx`
- Data: `/api/executions?pageSize=10` (most recent 10 by `eventTimestamp` descending)
- Compact list rows: `tradeDate`, symbol (bold), side badge, optionType badge, `strike + expirationDate` (condensed), `price`
- Link: "View all →" navigates to `/trade-records?tab=executions`
- Respects `AccountFilterContext`
- Spans 2 columns

Acceptance criteria:
- shows the 10 most recent executions from the selected accounts
- all badge variants render correctly

---

## Issue KM-020 — Widget: Expectancy vs Hold Days Scatter

Deliverables:
- `components/widgets/ExpectancyScatterWidget.tsx`
- Data: `/api/setups?pageSize=1000`
- Recharts `ScatterChart`: x = `averageHoldDays`, y = `expectancy`, bubble size proportional to `abs(realizedPnl)`
- Color by tag (long_call = blue, stock = green, bull_vertical = amber, etc.)
- Tooltip: full setup detail (tag, underlying, realizedPnl, winRate)
- Respects `AccountFilterContext`
- Spans 2 columns

Acceptance criteria:
- scatter renders with correct data points
- tooltip shows correct details on hover
- account filter reduces the visible data points

---

## Issue KM-024 — Widget: Open Positions Summary

Deliverables:
- `components/widgets/OpenPositionsSummaryWidget.tsx`
- Data: `useOpenPositions()` + `/api/quotes`
- Shows: total open position count, total cost basis, total mark value (live), total unrealized P&L (color-coded)
- "Last quoted: HH:MM:SS" timestamp
- Link: "View positions →" navigates to `/positions`
- Respects `AccountFilterContext`

Acceptance criteria:
- shows correct position count and cost basis when quotes are unavailable
- shows correct mark value and unrealized P&L when quotes are available
- link to positions page works

---

## Issue KM-005 — Analytics page (/analytics)

Create the Analytics page derived from existing API data.

Deliverables:
- `/app/analytics/page.tsx`
- KPI strip: total P&L, win rate, avg hold, pair ambiguities, short call paired, synth expires
- Section 1: P&L by setup tag bar chart (from `/api/setups?pageSize=1000` grouped by tag)
- Section 2: Win/Loss/Flat donut (from `/api/matched-lots?pageSize=1000`)
- Section 3: Setup analytics table (T3 full list — sortable by any column, with select-all toggle)
- All sections respect `AccountFilterContext`

Acceptance criteria:
- all three sections render with real data
- sorting works on the setups table
- select-all toggle works on the setups table
- account filter updates all three sections

---

## Issue KM-029 — Select-all / scrollable list toggle on all paginated tables

Add "Show all" mode to every paginated table in the app.

Deliverables:
- Toolbar button: `Show all N` where N = `meta.total` from the API response
- On activate: re-fetch with `pageSize=1000`, hide pagination controls, render in scrollable container `max-height: calc(100vh - 280px)`, `overflow-y: auto`
- On deactivate: re-fetch with `pageSize=25`, restore pagination controls
- Persist per-table preference in `localStorage` key `kapman_table_{tableName}_showAll`
- Tables: `executions`, `matched-lots`, `setups`, `imports`

Acceptance criteria:
- toggle activates and deactivates cleanly on all four tables
- all records are visible when activated (matches `meta.total` count)
- preference survives a page reload
- pagination controls are hidden when select-all is active

---

## Issue KM-030 — /api/overview/streaks and Win/Loss Streak widget

Create the streak analytics endpoint and widget.

Deliverables:
- `app/api/overview/streaks/route.ts`
- Queries all matched lots ordered by `closeTradeDate` ascending
- Walks sequentially to compute: current streak count + type (WIN/LOSS), longest win streak, longest loss streak
- Returns: `{ currentStreak: number, currentStreakType: 'WIN' | 'LOSS' | null, longestWinStreak: number, longestLossStreak: number }`
- Add type to `/types/api.ts`
- `components/widgets/StreakWidget.tsx`: shows current streak ("3W" or "2L") in large colored text, longest win and loss streaks below

Acceptance criteria:
- endpoint returns correct streak values for the test dataset
- widget renders correctly with streak data
- current streak displays green for WIN, red for LOSS

---

## Issue KM-023-positions-page — referenced above as KM-023

*(See KM-023 entry above.)*

---

## Notes on file placement

Follow the existing v6 project conventions:
- All new Next.js pages under `app/`
- All shared components under `components/`
- Widget components under `components/widgets/`
- Hooks under `hooks/`
- Server utilities under `lib/`
- All shared API types in `/types/api.ts`
- Record new npm packages in `CHANGES.md` with one-line justifications
- Design assets (if any) under `/design/`
