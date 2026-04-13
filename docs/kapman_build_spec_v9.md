# KapMan v9.0 Build Spec — UX, Usability & Data Integrity Upgrade

**Version:** 9.0
**Date:** 2026-04-12
**Baseline:** v7.2 as-built inventory (`docs/kapman_v7_2_as_built_inventory.md`)
**Predecessor docs:** `docs/kapman_build_spec_v7.md`, `docs/kapman_codex_master_prompt_v7.md`, `docs/kapman_github_issues_v7.md`

---

## 1. Release Objectives

v9.0 is a UX, usability, and data-integrity release. It does not add new trading analysis features or new import adapters. Every issue targets one of four goals:

1. **Data correctness** — eliminate hardcoded env vars, normalize account IDs, fix formatting bugs, unify data sources.
2. **Table UX** — bring Excel-style column filter/sort to every list surface, sticky headers, and persistent cached quotes.
3. **Dashboard customization** — customizable KPI strip, resizable widgets, info tooltips, and layout presets.
4. **TTS readiness** — RAG indicators on the TTS widget and a detailed TTS evidence page with all six court-relevant metrics.

No new database tables are required. The `Account` model gains optional columns for `startingCapital`, `displayLabel`, and `brokerName`. All other changes are frontend, API response formatting, or widget refactors.

---

## 2. Architecture Decisions

### 2.1 Accounts Management Replaces STARTING_CAPITAL Env Var

**Current state (v7.2):**
- `STARTING_CAPITAL` is a single env var read by `/api/overview/reconciliation` (portfolio reconciliation widget).
- The Account Balances widget uses `progressReference` derived from the earliest snapshot, not from starting capital.
- The dashboard KPI strip has no total-return calculation.
- There is no UI to configure per-account constants.

**v9.0 target:**
- New `/accounts` page under Import & Data in the sidebar.
- The `Account` Prisma model adds nullable columns: `startingCapital` (Decimal), `displayLabel` (String), `brokerName` (String).
- On first load, the page seeds defaults from distinct `Account` rows: $100,000 each for the two Schwab accounts, $0 (placeholder) for the Fidelity account.
- `/api/overview/reconciliation` reads `sum(Account.startingCapital)` instead of the env var. Per-account reconciliation uses `Account.startingCapital` for that account.
- Account Balances NLV `progressReference` reads `Account.startingCapital` when set, falling back to earliest snapshot only when `startingCapital` is null.
- The `STARTING_CAPITAL` env var is deprecated and ignored. A console warning is emitted if it is still set.

### 2.2 Universal DataTable Component

**Current state (v7.2):**
Six distinct table implementations exist, each with different filter/sort patterns:
1. Open Positions — client-side filter by account selector
2. T1 Executions — server-side filter by symbol, account, import, date range, execution ID; sort by event time, symbol, qty, price
3. T2 Matched Lots — server-side filter by symbol, account, import, outcome, date range; sort by close date, symbol, P&L, hold days
4. T3 Setups — server-side filter by account, tag; sort by P&L, win rate, expectancy, hold
5. Import History — account filter, show-all toggle
6. Adjustments Ledger — page-driven, account picker

**v9.0 target:**
- New reusable `DataTableHeader` component.
- Each column header renders a clickable filter icon that opens a selector panel.
- Panel contents vary by column data type:
  - **Discrete values** (symbol, account, outcome, tag, type, status): multi-select checkboxes with search-within-list.
  - **Numeric values** (qty, price, P&L, hold days, DTE): sort asc/desc toggle.
  - **Date values** (trade date, event time, expiry, created): sort asc/desc toggle.
- Active filters are indicated by a highlighted icon on the column header.
- A "Clear all filters" button appears in the table toolbar when any filter is active.
- Filter state is persisted per table in `sessionStorage` (not `localStorage` — filters reset on tab close).
- All six tables adopt the same component. Existing per-table filter UIs (dropdowns, search fields) are replaced by the column header panels.
- Sticky headers are built into the base component: `position: sticky; top: 0; z-index: 10` on the `<thead>`.

### 2.3 TTS Readiness Data Source Unification

**Current state (v7.2):**
- The TTS Readiness dashboard widget (`TtsReadinessWidget.tsx`) fetches `/api/executions?pageSize=1000` and `/api/matched-lots?pageSize=1000` and recomputes all six metrics client-side.
- The TTS Evidence page (`/tts-evidence`) consumes `/api/tts/evidence`, which performs server-side aggregation without the 1000-row cap.
- The two code paths can produce different numbers for the same metrics when the dataset exceeds 1000 rows.

**v9.0 target:**
- The TTS Readiness dashboard widget is refactored to consume `/api/tts/evidence` exclusively.
- The widget no longer fetches executions or matched lots directly.
- The `/api/tts/evidence` route is extended to accept optional `accountIds` query parameter for selector-aware filtering (currently global only).
- Both the widget and the TTS Evidence page consume the same server-side source of truth.

### 2.4 Account ID Normalization

**Current state (v7.2):**
- `toExternalAccountId()` mapping exists and is used by Account Balances and some snapshot views.
- T1 executions table, T3 setup records, and open positions table display raw internal DB UUIDs.
- The global account selector dropdown shows raw account IDs via `font-mono`.

**v9.0 target:**
- Every surface that displays an account identifier uses `toExternalAccountId()` or, when `Account.displayLabel` is set (from KM-101), the display label.
- The account selector dropdown shows display labels when available, broker account numbers as fallback, internal IDs only as last resort.
- Affected surfaces: account selector, T1 account column, T3 account records, open positions account column, adjustments ledger, import history, sidebar footer.

### 2.5 Open Positions Quote Caching

**Current state (v7.2):**
- Open positions page fetches live quotes on every page load.
- `refreshCounter` state variable controls re-fetch.
- No cached values persist across page navigations or browser refreshes.
- `Last quoted: HH:MM:SS` is a browser timestamp set after the last successful mark load.

**v9.0 target:**
- On successful quote fetch, mark prices and timestamp are cached to `localStorage` under `kapman_positions_cache`.
- On page load, cached values are displayed immediately with "as of [MMM DD, YYYY HH:MM:SS]" label.
- NLV does not recalculate until the user clicks Refresh Quotes.
- The "Last quoted" label shows the full date and time from the cache, not just `HH:MM:SS`.
- Cache is per-position keyed by instrument key, so partial quote availability is handled gracefully.

### 2.6 Dashboard Customization Extensions

**Current state (v7.2):**
- Dashboard has a 6-tile KPI strip (hardcoded, not configurable).
- 16 widgets are supported with drag-and-drop reorder, add/remove, and localStorage persistence.
- Widgets span 1 or 2 columns; span is fixed per widget type (`defaultColSpan` in registry).
- No info tooltips on any widget or KPI.

**v9.0 target:**

**KPI strip:**
- KPI strip becomes a configurable zone with its own picker.
- `KPI_REGISTRY` parallel to `WIDGET_REGISTRY` defines available KPI types.
- Available KPI types: Realized P&L, Execution Count, Matched Lot Count, Setup Count, Avg Hold Days, Win Rate, Total Return %, Profit Factor, Expectancy, Max Drawdown, Snapshot Count.
- Users can add/remove/reorder KPI tiles in edit mode.
- KPI layout persisted to `localStorage` under `kapman_kpi_layout`.

**Resizable widgets:**
- Widgets gain a resize handle (bottom-right corner drag).
- Supported spans: 1-column, 2-column, full-width.
- Persisted per widget instance in the layout config.
- Charts and tables re-render on resize using a `ResizeObserver`.

**Info tooltips:**
- Every widget card and KPI tile gains a "?" icon in the upper-right corner.
- Hover/click opens a tooltip/popover containing:
  1. Calculation formula (from the as-built inventory documentation).
  2. Data source (API endpoint).
  3. Interpretation guide (1-2 sentences).
- Content is defined per widget/KPI in the registry as a `helpText` object.

### 2.7 TTS RAG Indicators

**Dashboard widget (KM-110):**
- Each of the six metrics displays current value, target, and a Red/Amber/Green status dot.
- RAG thresholds:

| Metric | Green | Amber | Red |
|---|---|---|---|
| Trades/month | ≥60 | 40–59 | <40 |
| Active days/week | ≥4 | 3 | <3 |
| Avg hold (days) | ≤31 | 32–45 | >45 |
| Annual trades | ≥720 | 480–719 | <480 |
| Gross proceeds | Display as-is | — | — |
| Time-in-market distribution | Display as-is | — | — |

- Widget is compact: 2×3 grid of metric cells, each with value + RAG dot.
- Overall RAG header: green only if all four threshold-based metrics are green.

**TTS Evidence page (KM-111):**
- Replaces the generic `DataPagePanel` header with TTS-specific KPI cards.
- Each metric gets a full card: current value, target, RAG status, trend sparkline (last 6 months when data permits).
- Holding-period distribution rendered as a horizontal bar chart (buckets already exist server-side).
- Gross proceeds shown with a substantiality note.

### 2.8 Analytics Page Parity

**Current state (v7.2):**
- Analytics has a hardcoded layout: KPI strip (6 tiles, mixed selector awareness), P&L by setup tag chart, win/loss/flat pie (no center label), and setup analytics table.
- Win/loss/flat pie is a separate implementation from the dashboard widget (missing center label and count).

**v9.0 target:**
- Analytics page adopts the same configurable grid as the dashboard.
- Reuses `WIDGET_REGISTRY`, `KPI_REGISTRY`, widget picker, KPI picker, edit mode, drag-and-drop, and layout persistence.
- Default analytics layout: Total P&L KPI, Win Rate KPI, Avg Hold KPI + P&L by Setup Tag widget, Win/Loss/Flat widget (reused from dashboard), Setup Analytics Table widget.
- The separate analytics win/loss/flat pie implementation is removed. The shared `WinLossFlatWidget` is used everywhere.
- Analytics layout persisted to `localStorage` under `kapman_analytics_layout`.

---

## 3. Sprint Structure

### Sprint 1 — Foundation: Data Layer, Accounts, and Table UX
Issues: KM-101, KM-102, KM-105, KM-122, KM-119, KM-103, KM-104
Focus: Get the data right before building UX on top of it.

### Sprint 2 — Dashboard UX: KPI Customization, Info Overlays, TTS RAG
Issues: KM-106, KM-107, KM-108, KM-109, KM-121, KM-110, KM-111
Focus: Dashboard becomes fully customizable; TTS gets RAG indicators.

### Sprint 3 — Analytics Page Parity and Component Consistency
Issues: KM-112, KM-113, KM-123, KM-114
Focus: Analytics becomes a first-class configurable page; eliminate code duplication.

### Sprint 4 — Polish and Quality of Life (Suggested)
Issues: KM-115, KM-116, KM-117, KM-118, KM-120, KM-124, KM-125
Focus: Power-user shortcuts, export, layout presets, consistency fixes.

---

## 4. Files Expected to Change

### New files
- `src/app/accounts/page.tsx` — accounts management page
- `src/components/accounts/AccountsManager.tsx` — accounts CRUD component
- `src/components/data-table/DataTableHeader.tsx` — reusable column filter/sort header
- `src/components/data-table/ColumnFilterPanel.tsx` — filter dropdown panel
- `src/components/widgets/KpiPicker.tsx` — KPI strip picker modal
- `src/components/widgets/InfoTooltip.tsx` — widget/KPI help tooltip
- `src/components/shared/MoneyCell.tsx` — consistent monetary formatting component
- `src/lib/registries/kpi-registry.ts` — KPI type definitions and help text

### Modified files
- `prisma/schema.prisma` — add `startingCapital`, `displayLabel`, `brokerName` to Account model
- `src/app/api/overview/reconciliation/route.ts` — read from Account model instead of env var
- `src/app/api/tts/evidence/route.ts` — add optional `accountIds` query parameter
- `src/components/widgets/TtsReadinessWidget.tsx` — refactor to consume `/api/tts/evidence`
- `src/components/widgets/WidgetCard.tsx` — add resize handle and info tooltip anchor
- `src/components/account-selector.tsx` — display labels, not raw IDs
- `src/components/widgets/AccountBalancesWidget.tsx` — read `startingCapital` for progress reference
- `src/components/widgets/ExpectancyScatterWidget.tsx` — add legend
- `src/components/widgets/EquityCurveWidget.tsx` — support 3+ account colors
- `src/components/widgets/RecentExecutionsWidget.tsx` — fetch only 10 rows
- `src/app/dashboard/page.tsx` — configurable KPI strip, resizable widgets
- `src/app/analytics/page.tsx` — configurable grid layout
- `src/app/tts-evidence/page.tsx` — full RAG detail page
- `src/app/positions/page.tsx` — quote cache, full datetime display
- `src/lib/navigation.ts` — add Accounts page to sidebar
- All table components in trade-records, positions, imports, adjustments — adopt DataTableHeader

### Deprecated
- `STARTING_CAPITAL` environment variable — replaced by Account model column

---

## 5. Testing Strategy

### Per-issue acceptance criteria
Every issue in `kapman_github_issues_v9.md` includes specific acceptance criteria. Use these as the primary test checklist.

### Cross-cutting regression checks
After each sprint, verify:
1. Dashboard widgets still render correctly with the default first-visit layout.
2. Account selector still filters all selector-aware surfaces.
3. Open positions page loads cached quotes, then refreshes on button click.
4. TTS widget and TTS page show the same numbers for the same account selection.
5. All monetary values display with `$` prefix and comma formatting.
6. No surface displays a raw internal UUID where a broker account number or display label is available.

### Known limitations carried forward from v7.2
These are not addressed in v9.0:
- Client-side aggregation capped at `pageSize=1000` (except TTS, which moves to server-side).
- Quote integration via MCP wrapper, not direct Schwab OAuth.
- Global-only behavior on Diagnostics Badge, Win/Loss Streak, and Portfolio Reconciliation widgets.
- Trade Records tabs use local filters only, not the global account selector (partially addressed by KM-103 which replaces local filter UIs with the universal DataTable column filters, but the data scope question remains).

---

## 6. Documentation Updates Required

After v9.0 is complete:
1. Update `docs/kapman_v7_2_as_built_inventory.md` → create `docs/kapman_v9_as_built_inventory.md`.
2. Archive `docs/kapman_build_spec_v7.md` as historical reference.
3. Remove `STARTING_CAPITAL` from any `.env.example` or README instructions.
4. Add Accounts page to any user-facing documentation or onboarding guide.
