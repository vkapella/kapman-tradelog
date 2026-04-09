# KapMan Codex Master Prompt v7

You are refactoring the KapMan Trading Journal from v6 to v7.

Your task is to:
1. Read the existing codebase thoroughly before writing any code
2. Create GitHub issues from the v7 backlog below
3. Execute the issues in phase order
4. Leave the repo in a runnable state with all v6 functionality intact and all v7 surfaces added

## What v7 is

v7 is a UX refactor. It does not change the data pipeline.
The adapter, FIFO ledger, T1/T2/T3 layers, Prisma schema, and all existing API route handlers are **preserved exactly**.
v7 adds new routes, components, hooks, and context on top of the existing system.

## What you must not touch

- Any file in `prisma/` (schema and migrations are frozen)
- Any existing API route handler logic or Prisma query
- T1/T2/T3 computation or FIFO matching logic
- Existing tests (you may add tests; never delete or modify existing ones)
- The thinkorswim adapter or adapter registry

If a change requires touching any of the above, stop and document the conflict instead of making the change.

## Product rules (same as v6)

- FIFO is the immutable ledger of record
- T2 matched lot is the canonical accounting/analytics unit
- T3 setup is the business-intelligence grouping layer
- Adapters stay lean: detect, parse, normalize, warn
- TTS outputs are evidence/readiness, not legal determination
- **New for v7:** all UI labels come from data, never from hardcoded strings

## Stack

Same as v6 with one addition:

- Next.js 14.2.x + TypeScript 5.4.x + Tailwind 3.4.x
- Prisma 5.14.x + PostgreSQL
- TanStack Table 8.17.x
- Recharts 2.12.x (use this for all charts — do not add another charting library)
- `@dnd-kit/core` — add this for dashboard drag-and-drop; document in CHANGES.md
- Docker / docker-compose

If you need to install a package not in the list above, add it to `CHANGES.md` with a one-line justification before using it.

## v7 information architecture

### Sidebar nav (replace existing)

```
WORKSPACE
  Dashboard          →  /dashboard   (replaces Overview placeholder)
  Analytics          →  /analytics   (new)
  Open Positions     →  /positions   (new)

TRADE RECORDS
  Executions / Lots / Setups  →  /trade-records  (merge T1, T2, T3 into tabs)

IMPORT & DATA
  Imports & Connections  →  /imports  (add tabs: Upload / History / Adapters)

EVIDENCE & AUDIT
  TTS Evidence    →  /tts-evidence
  Diagnostics     →  /diagnostics
```

### Design tokens (update globals.css and tailwind.config)

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
body { background: radial-gradient(circle at 0% 0%, #152245 0%, #090f1e 42%, #050913 100%); }
```

All new components must use these CSS variables, not hardcoded hex values.

## Execution rules

- Do not ask clarifying questions. Make the most conservative reasonable assumption and document it in a comment or CHANGES.md note.
- Never defer a feature with a TODO comment unless it is explicitly listed in "Non-goals for v7" in the build spec.
- Every new API route must have a corresponding shared type in `/types/api.ts`.
- Every page must handle loading, empty, and populated states.
- Every empty state must include a call to action or a link to the relevant data entry workflow.
- If an assumption is required because source data is incomplete, surface it in Diagnostics or CHANGES.md.
- Run `npm run typecheck` and `npm run lint` after each phase and resolve all errors before proceeding.
- Run existing tests after each phase and confirm they still pass.

## Existing API surface (do not modify)

All routes below exist in v6. Do not modify their handlers, query logic, or response shapes.
All support `pageSize=1000` to return the full dataset in a single call.

```
GET /api/page-stats
GET /api/overview/summary        → netPnl, executionCount, matchedLotCount, setupCount, averageHoldDays, snapshotSeries[], importQuality
GET /api/executions              → pageSize, page, symbol, accountId, importId, from, to, executionId
GET /api/matched-lots            → pageSize, page, symbol, accountId, outcome, from, to
GET /api/setups                  → pageSize, page, accountId, tag
GET /api/setups/:id
GET /api/tts/evidence            → tradesPerMonth, activeDaysPerWeek, annualizedTradeCount, averageHoldingPeriodDays, medianHoldingPeriodDays, grossProceedsProxy, holdingPeriodDistribution[]
GET /api/diagnostics             → parseCoverage, matchingCoverage, warningsCount, syntheticExpirationCount, warningSamples[], setupInference{}
POST /api/imports/upload
POST /api/imports/:id/commit
GET /api/imports
GET /api/health
```

## New routes to implement

```
GET /api/quotes?symbols=X,Y,Z
GET /api/option-quote?symbol=X&strike=N&expDate=YYYY-MM-DD&contractType=CALL|PUT
GET /api/overview/streaks
```

See build spec for full response shapes.

## Schwab OAuth

Implement `lib/schwab-auth.ts`:

```ts
// POST https://api.schwabapi.com/v1/oauth/token
// grant_type=refresh_token
// Reads: SCHWAB_CLIENT_ID, SCHWAB_CLIENT_SECRET, SCHWAB_REFRESH_TOKEN from env
// Caches access token in-process with expiry
// Auto-refreshes when within 60s of expiry
export async function getAccessToken(): Promise<string>
```

Used by `/api/quotes` and `/api/option-quote`.
If any of the three env vars are absent, these routes must return `{ "error": "unavailable" }` with HTTP 200 and not throw.

## Open positions hook

Implement `hooks/useOpenPositions.ts`:

```ts
// 1. Fetch /api/executions?pageSize=1000
// 2. Fetch /api/matched-lots?pageSize=1000
// 3. Build Set<string> of openExecutionId from all lots
// 4. Filter: openingClosingEffect === 'TO_OPEN' AND id NOT IN Set
// 5. Group by instrumentKey, net qty (BUY +, SELL -), sum costBasis (qty × price)
// 6. Exclude groups where netQty === 0
export function useOpenPositions(): { positions: OpenPosition[]; loading: boolean; error: string | null }
```

This hook performs no database access. It uses only the existing paginated API endpoints.

## NLV hook

Implement `hooks/useNetLiquidationValue.ts`:

```ts
// For each accountId:
//   latestCash = most recent snapshotSeries entry for that accountId
//   equityMarkValue = mark × netQty  (from /api/quotes)
//   optionMarkValue = mark × 100 × netQty  (from /api/option-quote)
//   NLV = latestCash + sum(equityMarkValue) + sum(optionMarkValue)
export function useNetLiquidationValue(accountId: string): { nlv: number | null; cash: number; lastUpdated: Date | null; loading: boolean }
```

If quote endpoints return `{ "error": "unavailable" }`, return `{ nlv: null, cash: latestCash, lastUpdated: null }`.

## Account selector context

Create `contexts/AccountFilterContext.tsx`:

```ts
interface AccountFilterContextValue {
  availableAccounts: string[];    // all distinct accountId values from the API
  selectedAccounts: string[];     // currently selected (default: all)
  setSelectedAccounts: (ids: string[]) => void;
}
```

Populate `availableAccounts` by fetching `/api/executions?pageSize=1` and reading the `accountId` field, then fetching all distinct values.
Wrap the app layout with this context.
Every widget, table, and chart must consume this context and filter its data accordingly.

## Hardcoded label purge

Before writing any new code, do a global search across the entire codebase for:
- `"Paper money"`
- `"paper trading"`
- `"paper_money"`
- `"MVP routing shell"`
- `"Placeholder"`
- `"OverviewPage"`
- `"ImportsConnectionsPage"`
- `"ExecutionsPage"`
- `"MatchedLotsPage"`
- `"SetupsPage"`
- `"TtsEvidencePage"`
- `"DiagnosticsPage"`

Remove all occurrences from rendered output. Page component names can stay; page heading text must not include these strings.

## Dashboard widget registry

Define a widget registry in `lib/widget-registry.ts`:

```ts
interface WidgetDefinition {
  id: string;
  name: string;
  description: string;
  defaultColSpan: 1 | 2;
  component: React.ComponentType;
}

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  { id: 'equity-curve',      name: 'Equity Curve',           defaultColSpan: 2, ... },
  { id: 'account-balances',  name: 'Account Balances',        defaultColSpan: 1, ... },
  { id: 'win-loss-flat',     name: 'Win / Loss / Flat',       defaultColSpan: 1, ... },
  { id: 'holding-dist',      name: 'Holding Distribution',    defaultColSpan: 1, ... },
  { id: 'top-setups',        name: 'Top Setups by P&L',      defaultColSpan: 1, ... },
  { id: 'symbol-pnl',        name: 'Symbol P&L Ranking',      defaultColSpan: 2, ... },
  { id: 'monthly-pnl',       name: 'Monthly P&L Bars',        defaultColSpan: 2, ... },
  { id: 'setup-tags',        name: 'Setup Tag Rollup',        defaultColSpan: 1, ... },
  { id: 'import-health',     name: 'Import Health',           defaultColSpan: 1, ... },
  { id: 'tts-scorecard',     name: 'TTS Readiness',           defaultColSpan: 1, ... },
  { id: 'diag-badge',        name: 'Diagnostics Badge',       defaultColSpan: 1, ... },
  { id: 'recent-execs',      name: 'Recent Executions',       defaultColSpan: 2, ... },
  { id: 'open-pos-summary',  name: 'Open Positions Summary',  defaultColSpan: 1, ... },
  { id: 'scatter',           name: 'Expectancy vs Hold',      defaultColSpan: 2, ... },
  { id: 'streaks',           name: 'Win / Loss Streak',       defaultColSpan: 1, ... },
]
```

Widget layout (ordered array of widget ids) is persisted to `localStorage` under key `kapman_dashboard_layout`.
Default layout on first visit: `['equity-curve', 'account-balances', 'win-loss-flat', 'holding-dist', 'top-setups', 'import-health']`.

## Select-all table toggle

Every paginated table must have a toolbar button labeled `Show all N` where N is `meta.total` from the API response.

On activate:
- re-fetch with `pageSize=1000`
- hide pagination controls
- render table in `<div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>`
- show "Showing all N records" in toolbar

On deactivate:
- re-fetch with `pageSize=25`
- restore pagination controls

Persist per-table in `localStorage` key `kapman_table_{tableName}_showAll`.
Tables: `executions`, `matched-lots`, `setups`, `imports`.

## Phase execution order

Execute phases in order. Do not start a phase until the previous phase is typecheck-clean and all existing tests pass.

### Phase 1 — Foundation
KM-031, KM-003, KM-002, KM-034, KM-035

These unblock all other work. The account selector context (KM-002) must exist before any widget is built.

### Phase 2 — Navigation and Shell
KM-032, KM-033, KM-001, KM-004, KM-006

Redesign sidebar and topbar. Create `/dashboard` route. Merge T1/T2/T3 into `/trade-records`. Add tabs to `/imports`.

### Phase 3 — Schwab Quotes and Open Positions
KM-028, KM-025, KM-026, KM-022, KM-023, KM-027

Implement Schwab auth, proxy routes, open positions hook, positions page, and NLV hook.
This phase can proceed in parallel with Phase 2 if needed, but depends on Phase 1.

### Phase 4 — Dashboard and Widgets
KM-007, KM-021, KM-008 through KM-020, KM-024

Implement dashboard layout, widget grid, edit mode, widget picker, and all 15 widget components.
Depends on Phases 1, 2, and 3 (some widgets need open positions and NLV hooks).

### Phase 5 — Analytics Page and Polish
KM-005, KM-029, KM-030

Analytics page, select-all toggle on all tables, streak endpoint and widget.

## Backlog to create and execute

1. KM-001 — Scaffold /dashboard route (replace Overview placeholder)
2. KM-002 — Global account selector context and topbar dropdown
3. KM-003 — Purge all hardcoded placeholder and account label strings
4. KM-004 — Consolidated /trade-records page with T1/T2/T3 tabs
5. KM-005 — Analytics page (/analytics)
6. KM-006 — Add tabs to /imports page
7. KM-007 — Dashboard editable widget grid with drag-and-drop
8. KM-008 — Widget: Equity Curve
9. KM-009 — Widget: Account Balances + NLV
10. KM-010 — Widget: Win/Loss/Flat Donut
11. KM-011 — Widget: Holding-Period Distribution
12. KM-012 — Widget: Top Setups by P&L
13. KM-013 — Widget: Symbol P&L Ranking
14. KM-014 — Widget: Monthly P&L Bars
15. KM-015 — Widget: Setup Tag Rollup
16. KM-016 — Widget: Import Health Scorecard
17. KM-017 — Widget: TTS Readiness Scorecard
18. KM-018 — Widget: Diagnostics Health Badge
19. KM-019 — Widget: Recent Executions Feed
20. KM-020 — Widget: Expectancy vs Hold Scatter
21. KM-021 — Widget picker panel
22. KM-022 — useOpenPositions hook (client-side computation)
23. KM-023 — Open Positions page (/positions)
24. KM-024 — Widget: Open Positions Summary
25. KM-025 — /api/quotes proxy endpoint (Schwab equity marks)
26. KM-026 — /api/option-quote proxy endpoint (Schwab option marks)
27. KM-027 — useNetLiquidationValue hook
28. KM-028 — lib/schwab-auth.ts token lifecycle
29. KM-029 — Select-all / scrollable list toggle on all paginated tables
30. KM-030 — /api/overview/streaks endpoint and Streak widget
31. KM-031 — v7 color system and design tokens
32. KM-032 — Sidebar v7 redesign
33. KM-033 — Topbar v7 redesign
34. KM-034 — KpiCard shared component
35. KM-035 — Badge shared component

## Definition of runnable

The app is runnable when:
- `docker compose up` starts the app and database and seeds fixture data identically to v6
- the app is available at `http://localhost:3002`
- all existing v6 pages render without console errors
- `/dashboard` renders with at least the KPI strip and one working widget

## Definition of done

v7 is done when:
- the dashboard is the landing page with a working editable widget grid
- the account selector populates from real data and filters all widgets and tables
- the open positions page lists all unmatched TO_OPEN executions with cost basis
- live mark prices and NLV display when Schwab env vars are configured
- `/trade-records` renders T1, T2, and T3 in tabs with all existing filter functionality
- every paginated table has a working select-all / scrollable-list toggle
- no hardcoded account labels, "Paper money", or "Placeholder" strings appear anywhere in the rendered UI
- the sidebar shows 4 groups matching the v7 navigation structure
- TypeScript compiles clean, lint passes, all v6 tests pass
