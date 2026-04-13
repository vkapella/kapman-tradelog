# KapMan v9.0 GitHub Issues

**Release:** v9.0 — UX, Usability & Data Integrity Upgrade
**Date:** 2026-04-12
**Build spec:** `docs/kapman_build_spec_v9.md`
**Baseline:** v7.2 as-built inventory (`docs/kapman_v7_2_as_built_inventory.md`)
**Total issues:** 25 (18 core + 7 suggested polish)

---

## Sprint Tagging Convention

Every issue title is prefixed with its sprint tag for resumability:

- `[v9.0-S1]` — Sprint 1: Foundation
- `[v9.0-S2]` — Sprint 2: Dashboard UX
- `[v9.0-S3]` — Sprint 3: Analytics Parity
- `[v9.0-S4]` — Sprint 4: Polish (suggested)

If work is interrupted, search issues by tag to resume at the correct sprint.

---

## Effort Key

| Code | Hours | Typical scope |
|---|---|---|
| XS | <2h | Single-file fix, formatting, config |
| S | 2–4h | Small component, refactor, or bug fix |
| M | 4–8h | New component, multi-file refactor |
| L | 8–16h | New page, complex component, multi-surface change |
| XL | 16–24h | Cross-cutting infrastructure, all-table refactor |

---

## Sprint 1 — Foundation: Data Layer, Accounts, and Table UX

Sprint 1 establishes the data-layer prerequisites that all later sprints depend on. The accounts management page replaces the hardcoded env var. The universal DataTable component replaces six different filter/sort implementations. Quote caching and formatting fixes round out the foundation.

---

### KM-101 — [v9.0-S1] Accounts management page

**Type:** feat | **Priority:** P0 | **Effort:** L

**Context:**
The app currently uses a single `STARTING_CAPITAL` environment variable to set the portfolio baseline. With three accounts (two Schwab, one Fidelity), this no longer works — each account needs its own starting capital and display metadata. The v7.2 inventory confirms three consumers of this value: the portfolio reconciliation widget, the Account Balances NLV progress bar, and any total-return calculation.

**Deliverables:**

1. Prisma schema change — add to the `Account` model:
   - `startingCapital Decimal? @default(0)` — per-account starting capital
   - `displayLabel String?` — human-friendly account name (e.g., "Schwab IRA", "Schwab Margin", "Fidelity")
   - `brokerName String?` — broker identifier (e.g., "Schwab", "Fidelity")

2. New API route — `GET /api/accounts` and `PATCH /api/accounts/:id`:
   - GET returns all Account rows with id, accountId (external), startingCapital, displayLabel, brokerName, createdAt.
   - PATCH accepts partial updates to startingCapital, displayLabel, brokerName.
   - Validate startingCapital is non-negative.

3. New page — `/accounts` (`src/app/accounts/page.tsx`):
   - Sidebar entry under "Import & Data" group, between Imports and Adjustments.
   - Table showing all accounts: display label (editable inline), broker account number (read-only), broker name (editable), starting capital (editable), created date.
   - Save button per row or auto-save on blur.
   - Seed defaults on first visit: $100,000 each for the two Schwab accounts, $0 for Fidelity with a visual prompt to set it.

4. Deprecation — emit `console.warn("STARTING_CAPITAL env var is deprecated. Use the Accounts page to set per-account starting capital.")` if the env var is still set. Do not read it for any calculation.

**Acceptance criteria:**
- [ ] `/accounts` page renders all accounts from the database.
- [ ] Starting capital is editable and persists on save.
- [ ] Display label is editable and persists on save.
- [ ] Broker name is editable and persists on save.
- [ ] Default seed values are $100,000 each for Schwab accounts when startingCapital is null.
- [ ] Console warning emitted when `STARTING_CAPITAL` env var is present.
- [ ] `prisma migrate dev` succeeds with the schema change.

**Depends on:** nothing
**Blocks:** KM-102

---

### KM-102 — [v9.0-S1] Refactor all starting-capital consumers to use Account model

**Type:** fix | **Priority:** P0 | **Effort:** M

**Context:**
Three surfaces currently read starting capital from sources other than the Account model. All must be updated to use `Account.startingCapital` from KM-101.

**Deliverables:**

1. `/api/overview/reconciliation` route:
   - Replace `parseFloat(process.env.STARTING_CAPITAL || "0")` with `sum(Account.startingCapital)` for combined view.
   - For per-account reconciliation, use that account's `startingCapital`.

2. `AccountBalancesWidget.tsx` — `progressReference`:
   - When `Account.startingCapital` is set and > 0 for the given account, use it as the progress bar denominator.
   - Fall back to earliest snapshot balance only when `startingCapital` is null or zero.

3. Dashboard KPI strip total return (if present):
   - Any KPI showing total return % must use `sum(Account.startingCapital)` as the denominator.

4. New API route or extension — `GET /api/accounts/starting-capital`:
   - Returns `{ total: number, byAccount: Record<string, number> }`.
   - Consumed by the reconciliation route and any client-side total-return calculation.
   - Alternatively, the existing `/api/accounts` route from KM-101 can serve this data.

**Acceptance criteria:**
- [ ] Portfolio reconciliation widget shows "Starting Capital" from Account model, not env var.
- [ ] Account Balances progress bar uses per-account starting capital when set.
- [ ] Removing the `STARTING_CAPITAL` env var does not break any surface.
- [ ] Setting Schwab account starting capital to $100,000 each produces a $200,000 combined starting capital in reconciliation.

**Depends on:** KM-101

---

### KM-105 — [v9.0-S1] KPI strip: format realized P&L as currency

**Type:** fix | **Priority:** P0 | **Effort:** S

**Context:**
The dashboard KPI strip displays realized P&L as a raw decimal number (e.g., `-6641.00`) instead of currency format (e.g., `-$6,641.00`). The v7.2 inventory confirms the server-side calculation is `sum(Number(matchedLot.realizedPnl))` formatted to 2 decimals — the issue is purely display formatting.

**Deliverables:**

1. Apply `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` to the Realized P&L KPI tile.
2. Audit all 6 current KPI tiles for consistent formatting:
   - Realized P&L → currency
   - Executions → integer with comma separators
   - Matched Lots → integer with comma separators
   - Setups → integer with comma separators
   - Average Hold Days → 1 decimal + "d" suffix
   - Snapshots → integer with comma separators
3. Create or use a shared formatting utility (`formatCurrency`, `formatInteger`, `formatDays`) to ensure consistency. If `MoneyCell` (KM-118) is implemented first, use that.

**Acceptance criteria:**
- [ ] Realized P&L displays as `-$6,641.00` format, not `-6641.00`.
- [ ] All KPI tiles use consistent formatting appropriate to their data type.
- [ ] No raw decimal numbers appear in the KPI strip.

**Depends on:** nothing

---

### KM-122 — [v9.0-S1] Normalize account ID display across all screens

**Type:** fix | **Priority:** P1 | **Effort:** M

**Context:**
The v7.2 inventory documents that account identifiers are displayed inconsistently across the app. The `toExternalAccountId()` mapping exists but is not used everywhere. Specific surfaces showing raw internal UUIDs: T1 executions table account column, T3 setup records, open positions table account column.

**Deliverables:**

1. Identify all surfaces that display account identifiers. The inventory documents these:
   - Account selector dropdown labels
   - T1 executions table "Account" column
   - T2 matched lots table (if account column exists)
   - T3 setups table/detail
   - Open positions table "Account" column
   - Adjustments ledger "Account" column
   - Import history "Account" column
   - Sidebar footer account count
   - Account Balances widget (already uses external IDs — verify only)

2. For each surface, apply this resolution order:
   - `Account.displayLabel` (from KM-101) when set → e.g., "Schwab IRA"
   - `Account.accountId` (external broker number) → e.g., "D-68011053"
   - Internal `Account.id` as last resort → truncated with tooltip for full UUID

3. Update `account-selector.tsx`:
   - The dropdown currently renders `<span className="truncate font-mono">{accountId}</span>` with raw IDs.
   - Replace with display label or external ID.
   - Keep `font-mono` only for broker account numbers, not display labels.

4. Create a shared `AccountLabel` component or utility function that encapsulates the resolution logic, so all surfaces use it consistently.

**Acceptance criteria:**
- [ ] No surface displays a raw internal UUID when a display label or broker account number is available.
- [ ] Account selector dropdown shows display labels when set.
- [ ] T1, T3, and open positions account columns show resolved labels.
- [ ] Hovering an account label shows the full external account number in a tooltip.

**Depends on:** KM-101 (for displayLabel column)

---

### KM-119 — [v9.0-S1] Sticky table headers on scroll

**Type:** ux | **Priority:** P1 | **Effort:** XS

**Context:**
When "show all" is enabled on tables with 500+ rows, the column headers scroll out of view. This is a prerequisite for KM-103 — the sticky header should be built into the base table component before the column filter panels are added.

**Deliverables:**

1. Add `position: sticky; top: 0; z-index: 10; background: var(--panel)` to `<thead>` on all table components.
2. If KM-103 creates a new `DataTableHeader` component, build sticky behavior into it from the start.
3. If tables are refactored incrementally, add sticky headers to the current implementations now and they'll carry forward.

**Acceptance criteria:**
- [ ] On every table with "show all" enabled, scrolling down keeps the header row pinned at the top.
- [ ] Header background is opaque (not transparent) so content doesn't bleed through.
- [ ] Filter dropdowns (from KM-103, when implemented) render above the sticky header, not behind it.

**Depends on:** nothing
**Blocks:** KM-103

---

### KM-103 — [v9.0-S1] Universal column filter/sort on all list views (Excel-style auto-filter)

**Type:** feat | **Priority:** P0 | **Effort:** XL

**Context:**
The user wants every table header to behave like Excel's data selectors: click a column header to open a panel that allows multi-select filtering and sorting. Currently, six distinct table implementations exist with different filter/sort patterns. This issue unifies them into a single reusable component.

**Deliverables:**

1. `src/components/data-table/DataTableHeader.tsx`:
   - Renders column headers with a filter icon button.
   - Click opens `ColumnFilterPanel` positioned below the header cell.
   - Active filters indicated by highlighted/filled icon.

2. `src/components/data-table/ColumnFilterPanel.tsx`:
   - **Discrete columns** (symbol, account, outcome, tag, type, status, side, effect, broker):
     - Multi-select checkboxes listing all distinct values in the column.
     - "Select all" / "Clear all" buttons.
     - Text search to filter the checkbox list.
     - Apply/close buttons.
   - **Numeric columns** (qty, price, P&L, hold days, DTE, cost basis, mark, mkt value):
     - Sort ascending / descending toggle.
     - Optional min/max range filter (stretch goal — sort-only is acceptable for v9.0).
   - **Date columns** (trade date, event time, expiry, created, close date):
     - Sort ascending / descending toggle.
     - Optional date range filter (stretch goal).

3. `src/components/data-table/DataTableToolbar.tsx`:
   - "Clear all filters" button, visible only when any filter is active.
   - Active filter count badge.
   - Integrates with existing "Show all" toggle.

4. Apply to all six table implementations:

   | Table | Location | Current filters to replace |
   |---|---|---|
   | Open Positions | `/positions` | Account selector integration |
   | T1 Executions | `/trade-records?tab=executions` | Symbol, account, import, date range, execution ID dropdowns |
   | T2 Matched Lots | `/trade-records?tab=matched-lots` | Symbol, account, import, outcome, date range dropdowns |
   | T3 Setups | `/trade-records?tab=setups` | Account, tag dropdowns |
   | Import History | `/imports?tab=history` | Account filter |
   | Adjustments Ledger | `/adjustments` | Account picker |

5. Persist filter state per table in `sessionStorage` under `kapman_table_filters_{tableName}`.

6. Keyboard support: Escape closes the filter panel. Tab moves between checkboxes.

**Acceptance criteria:**
- [ ] Every column header on all six tables shows a clickable filter icon.
- [ ] Clicking the icon opens a filter panel with appropriate controls for the column type.
- [ ] Multi-select filtering works: selecting "WIN" and "LOSS" on outcome column shows only those rows.
- [ ] Sort toggles work: clicking sort asc on P&L sorts the table ascending by P&L.
- [ ] Active filters are visually indicated on the column header.
- [ ] "Clear all filters" resets the table to unfiltered state.
- [ ] Filter state persists within a browser session (survives page navigation, not tab close).
- [ ] Existing per-table filter UIs (dropdowns, search fields) are removed — the column headers are the sole filter mechanism.
- [ ] The global account selector continues to work as a scope limiter; column filters operate within the scoped data.

**Depends on:** KM-119 (sticky headers)

---

### KM-104 — [v9.0-S1] Open positions: persist last-quoted values until manual refresh

**Type:** feat | **Priority:** P1 | **Effort:** M

**Context:**
Currently, the open positions page fetches live quotes on every page load, causing NLV to "float" as the user navigates away and back. The user wants cached values to persist until an explicit refresh.

**Deliverables:**

1. After each successful quote fetch, cache to `localStorage` under `kapman_positions_cache`:
   ```json
   {
     "timestamp": "2026-04-12T14:30:00Z",
     "quotes": {
       "instrumentKey1": { "mark": 132.05, "bid": 131.90, "ask": 132.10 },
       "instrumentKey2": { "mark": 16.70, "bid": 16.50, "ask": 16.80 }
     }
   }
   ```

2. On page load:
   - Read cached quotes from `localStorage`.
   - Display cached mark prices immediately in the table.
   - Display "Last quoted: Apr 12, 2026 2:30:00 PM" in the page header (full date and time, not just HH:MM:SS).
   - Do NOT auto-fetch live quotes.

3. Refresh Quotes button:
   - Fetches fresh quotes from `/api/quotes` and `/api/option-quote`.
   - Overwrites the cache with new values and timestamp.
   - Updates the "Last quoted" display.

4. Cache invalidation:
   - Cache entries for positions that no longer exist (closed since last quote) are ignored gracefully.
   - New positions without cached quotes show "—" in the mark column until refreshed.

**Acceptance criteria:**
- [ ] Navigating away from `/positions` and back shows the same mark prices without re-fetching.
- [ ] "Last quoted" shows full date and time (e.g., "Apr 12, 2026 2:30:00 PM").
- [ ] Clicking Refresh Quotes fetches live data and updates the cache.
- [ ] Browser refresh (F5) loads cached values, not live quotes.
- [ ] New positions without cached quotes show "—" gracefully.

**Depends on:** nothing

---

## Sprint 2 — Dashboard UX: KPI Customization, Info Overlays, TTS RAG

Sprint 2 makes the dashboard fully customizable and upgrades TTS readiness with RAG indicators. The TTS data source is unified first (KM-121) before the RAG UI is built on top of it.

---

### KM-106 — [v9.0-S2] Customizable KPI strip with KPI widgets

**Type:** feat | **Priority:** P0 | **Effort:** L

**Context:**
The dashboard KPI strip currently has 6 hardcoded tiles. The user wants to customize which KPIs appear and in what order, similar to how widgets can be added/removed from the grid.

**Deliverables:**

1. `src/lib/registries/kpi-registry.ts`:
   - Define `KPI_REGISTRY` as an array of KPI type definitions.
   - Each entry: `{ id, name, description, dataSource, formatFn, helpText }`.
   - Available KPI types:
     - `realized-pnl` — sum of matched lot realized P&L (currency)
     - `execution-count` — total T1 rows (integer)
     - `matched-lot-count` — total T2 rows (integer)
     - `setup-count` — total T3 rows (integer)
     - `avg-hold-days` — average holding period (1 decimal + "d")
     - `win-rate` — WIN / (WIN + LOSS) percentage
     - `total-return-pct` — (current NLV - starting capital) / starting capital percentage
     - `profit-factor` — gross wins / gross losses ratio
     - `expectancy` — average P&L per trade (currency)
     - `max-drawdown` — largest peak-to-trough decline (currency or %)
     - `snapshot-count` — total snapshot rows (integer)

2. `src/components/widgets/KpiPicker.tsx`:
   - Modal grid of available KPI types (similar to existing WidgetPicker).
   - Shows name and description for each.
   - Click adds a new KPI tile to the strip.

3. Dashboard KPI strip modifications:
   - In edit mode: KPI tiles are draggable for reorder, show × to remove, and a + tile opens the KPI picker.
   - In view mode: static display as current.
   - Layout persisted to `localStorage` under `kapman_kpi_layout`.
   - Default layout (first visit): `realized-pnl`, `execution-count`, `matched-lot-count`, `setup-count`, `avg-hold-days`, `snapshot-count` (matching current v7.2 strip).

**Acceptance criteria:**
- [ ] Edit mode allows drag-to-reorder, remove (×), and add (+) on KPI tiles.
- [ ] KPI picker modal shows all available KPI types with names and descriptions.
- [ ] Adding a KPI from the picker appends it to the strip.
- [ ] Layout persists across page loads via localStorage.
- [ ] Default first-visit layout matches current v7.2 strip.
- [ ] Each KPI tile renders with the correct format for its data type (currency, integer, percentage, etc.).

**Depends on:** KM-105 (for consistent formatting)

---

### KM-107 — [v9.0-S2] Resizable widgets

**Type:** feat | **Priority:** P1 | **Effort:** M

**Context:**
Dashboard widgets currently have a fixed column span set by `defaultColSpan` in the widget registry. The user wants to resize widgets by dragging.

**Deliverables:**

1. Add a resize handle to `WidgetCard.tsx`:
   - Small draggable handle on the bottom-right corner (visible in edit mode, hidden in view mode).
   - Drag horizontally to change column span: 1-col, 2-col, or full-width (3-col if grid supports it).

2. Widget grid layout update:
   - Use CSS Grid with `grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))` or a fixed 2-column grid.
   - Widget `colSpan` stored per instance in the layout config (not per type).

3. Re-render on resize:
   - Charts (Recharts) must re-render when container width changes.
   - Use `ResizeObserver` on the widget container to trigger chart reflow.

4. Persist per-widget span in the layout config alongside position.

**Acceptance criteria:**
- [ ] In edit mode, widgets show a resize handle on the bottom-right.
- [ ] Dragging the handle changes the widget's column span.
- [ ] Charts re-render correctly at the new size.
- [ ] Resize preference persists across page loads.
- [ ] In view mode, the resize handle is not visible.

**Depends on:** nothing

---

### KM-108 — [v9.0-S2] Info tooltip (?) on all widgets and KPI tiles

**Type:** ux | **Priority:** P1 | **Effort:** M

**Context:**
The user wants every widget and KPI tile to have a "?" icon that explains what the metric is, how it's calculated, and how to interpret it. The v7.2 as-built inventory provides exact formulas and interpretations for all 16 widgets and 6 KPIs — these should be the source content.

**Deliverables:**

1. `src/components/widgets/InfoTooltip.tsx`:
   - Renders a "?" icon (12px, muted color, absolute-positioned top-right of the card/tile).
   - On hover (desktop) or click (mobile): shows a popover with structured content.
   - Popover content structure:
     ```
     [Metric name]
     Formula: [calculation formula]
     Source: [API endpoint]
     Interpretation: [1-2 sentences]
     ```
   - Popover dismisses on click outside or Escape.

2. Add `helpText` to `WIDGET_REGISTRY` entries:
   - Each widget type gets a `helpText: { formula, source, interpretation }` object.
   - Content sourced from the v7.2 inventory "Calculation" and "Interpretation" columns.
   - Example for Win/Loss/Flat:
     ```
     formula: "WIN count / (WIN + LOSS count) × 100. FLAT lots excluded from denominator."
     source: "/api/matched-lots"
     interpretation: "Shows the percentage of closed lots that ended profitably. Higher is better. FLAT lots (zero P&L) are excluded."
     ```

3. Add `helpText` to `KPI_REGISTRY` entries (from KM-106).

4. Integrate `InfoTooltip` into `WidgetCard.tsx` and the KPI tile component.

**Acceptance criteria:**
- [ ] Every widget card shows a "?" icon in the upper-right corner.
- [ ] Every KPI tile shows a "?" icon.
- [ ] Hovering/clicking the icon shows a popover with formula, source, and interpretation.
- [ ] Popover content is accurate per the v7.2 inventory documentation.
- [ ] Popover dismisses on click outside or Escape.

**Depends on:** nothing

---

### KM-109 — [v9.0-S2] Expectancy vs. hold time chart: add legend

**Type:** fix | **Priority:** P2 | **Effort:** XS

**Context:**
The Expectancy vs. Hold Time scatter chart has no legend. The v7.2 inventory confirms only 4 tags have explicit colors (`long_call`, `stock`, `bull_vertical`, `diagonal`), with all others using a muted fallback.

**Deliverables:**

1. Add a Recharts `<Legend>` component below or to the right of the scatter chart.
2. Legend entries:
   - X axis: "Average hold days"
   - Y axis: "Expectancy ($)"
   - Bubble size: "Realized P&L magnitude"
   - Color entries: `long_call` (color swatch + label), `stock`, `bull_vertical`, `diagonal`, "other" (muted swatch)
3. Position the legend so it doesn't overlap the chart area.

**Acceptance criteria:**
- [ ] Legend is visible below or beside the chart.
- [ ] All 5 color categories are represented with correct swatches.
- [ ] Legend does not overlap chart data points.

**Depends on:** nothing

---

### KM-121 — [v9.0-S2] TTS widget: consume /api/tts/evidence instead of client recomputation

**Type:** fix | **Priority:** P0 | **Effort:** S

**Context:**
Code review of `TtsReadinessWidget.tsx` confirms the widget fetches `/api/executions?pageSize=1000` and `/api/matched-lots?pageSize=1000` and recomputes all six metrics client-side in a `useMemo`. The server-side `/api/tts/evidence` route performs the same calculations without the 1000-row cap. The two can produce different results on large datasets. This must be fixed before adding RAG indicators (KM-110).

**Current code pattern (to be replaced):**
```typescript
// Current: fetches 2000 rows and computes client-side
const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
const [lots, setLots] = useState<MatchedLotRecord[]>([]);
// ... fetch /api/executions?pageSize=1000 and /api/matched-lots?pageSize=1000
// ... useMemo computes tradesPerMonth, activeDaysPerWeek, etc.
```

**Deliverables:**

1. Extend `/api/tts/evidence` route to accept an optional `accountIds` query parameter:
   - When present, filter executions and matched lots to those account IDs before aggregation.
   - When absent, behave as current (global).

2. Refactor `TtsReadinessWidget.tsx`:
   - Remove the two `fetch` calls to executions and matched lots.
   - Remove the `useMemo` computation block.
   - Replace with a single `fetch` to `/api/tts/evidence?accountIds=...` using `selectedAccounts` from `AccountFilterContext`.
   - Map the response fields directly to the display grid.

3. Verify that the widget and the TTS Evidence page show identical numbers for the same account selection.

**Acceptance criteria:**
- [ ] Widget no longer fetches `/api/executions` or `/api/matched-lots`.
- [ ] Widget fetches `/api/tts/evidence` with account IDs from the global selector.
- [ ] Widget displays the same values as the TTS Evidence page for the same account selection.
- [ ] Widget works correctly with "all accounts" selected and with a single account selected.
- [ ] No client-side metric computation remains in the widget.

**Depends on:** nothing
**Blocks:** KM-110

---

### KM-110 — [v9.0-S2] TTS readiness widget: RAG indicators with baseline targets

**Type:** feat | **Priority:** P0 | **Effort:** M

**Context:**
After KM-121 unifies the data source, the TTS widget should display Red/Amber/Green indicators showing how each metric compares to court-relevant target thresholds.

**Deliverables:**

1. Define RAG thresholds as constants (co-located with the widget or in a shared TTS config):

   | Metric | Green | Amber | Red |
   |---|---|---|---|
   | Trades/month | ≥60 | 40–59 | <40 |
   | Active days/week | ≥4 | 3 | <3 |
   | Avg hold (days) | ≤31 | 32–45 | >45 |
   | Annual trades | ≥720 | 480–719 | <480 |
   | Gross proceeds | Display only | — | — |
   | Median hold | Display only | — | — |

2. Widget layout:
   - 2×3 grid of metric cells.
   - Each cell: metric label, current value, target value (muted text), RAG dot (colored circle).
   - Overall RAG header: green background tint if all threshold-based metrics are green, amber if any is amber, red if any is red.

3. RAG dot component: `<span>` with 8px colored circle, using CSS variables `--color-text-success`, `--color-text-warning`, `--color-text-danger`.

4. Keep the existing disclaimer text: "evidence/readiness signals — not legal determinations".

**Acceptance criteria:**
- [ ] Each metric shows a colored RAG dot next to its value.
- [ ] Target values are displayed in muted text below or beside the current value.
- [ ] RAG colors match the threshold table above.
- [ ] Overall widget header reflects the worst RAG status across all threshold-based metrics.
- [ ] Disclaimer text is preserved.
- [ ] Widget consumes `/api/tts/evidence` (from KM-121), not client-side computation.

**Depends on:** KM-121

---

### KM-111 — [v9.0-S2] TTS evidence page: full RAG detail with all 6 documentation metrics

**Type:** feat | **Priority:** P0 | **Effort:** L

**Context:**
The TTS Evidence page currently uses a generic `DataPagePanel` wrapper with basic metric display. It needs to become the definitive TTS documentation surface with full detail on all six court-relevant metrics.

**TTS Documentation Metrics (from user requirements):**
1. Trade count per month (target ≥60/month)
2. Active trading days per week (target ≥4 of 5 market days)
3. Average holding period across all matched lots (must be ≤31 days)
4. Total annual trades (target ≥720/year)
5. Time-in-market distribution histogram
6. Gross trading proceeds (substantiality proxy)

**Deliverables:**

1. Replace the generic `DataPagePanel` header with TTS-specific KPI cards:
   - 4 cards with RAG indicators: trades/month, active days/week, avg hold, annual trades.
   - 2 cards with values only: gross proceeds, median hold.
   - Same RAG thresholds as KM-110.

2. Detailed metric sections below the KPI cards:
   - Each metric gets its own section with:
     - Current value (large, prominent).
     - Target value and RAG status.
     - Trend sparkline showing the metric's value over the last 6 months (if sufficient data exists).
     - Explanatory text describing what courts look for.

3. Time-in-market distribution histogram:
   - Horizontal bar chart using the existing server-side buckets: `0-1d`, `2-5d`, `6-20d`, `21d+`.
   - Color coding: `0-1d` and `2-5d` bars in green (short-duration, favorable for TTS), `6-20d` in amber, `21d+` in red.
   - Label each bar with count and percentage.
   - Brief annotation: "Courts use this to verify activity is short-duration, not appreciation-seeking."

4. Gross trading proceeds section:
   - Display the compact-formatted value.
   - Note: "Courts have used gross proceeds as a substantiality proxy. This value intentionally excludes the option ×100 multiplier."

5. Account selector integration:
   - The page should respect the global account selector (via the `accountIds` parameter added in KM-121).
   - When a single account is selected, metrics reflect that account only.

**Acceptance criteria:**
- [ ] TTS page shows all 6 documentation metrics with current values.
- [ ] 4 metrics display RAG indicators matching the threshold table.
- [ ] Holding-period distribution renders as a horizontal bar chart with color coding.
- [ ] Gross proceeds section includes the substantiality note.
- [ ] Page respects the global account selector.
- [ ] Generic `DataPagePanel` header is replaced with TTS-specific KPI cards.
- [ ] Trend sparklines appear when sufficient historical data exists.

**Depends on:** KM-121

---

## Sprint 3 — Analytics Page Parity and Component Consistency

Sprint 3 makes the analytics page a first-class configurable surface and eliminates widget code duplication.

---

### KM-112 — [v9.0-S3] Analytics page: reconfigurable layout with KPI + widget zones

**Type:** feat | **Priority:** P1 | **Effort:** L

**Context:**
The analytics page currently has a hardcoded layout with mixed selector awareness (first 3 KPIs are selector-aware, last 3 are global diagnostics counts). The user wants the same configurable grid as the dashboard.

**Deliverables:**

1. Refactor `/analytics` to use the same layout engine as `/dashboard`:
   - Configurable KPI strip (reuses `KPI_REGISTRY` and KPI picker from KM-106).
   - Configurable widget grid (reuses `WIDGET_REGISTRY` and WidgetPicker).
   - Edit mode with drag-and-drop, add/remove, resize (from KM-107).

2. Default analytics layout (first visit):
   - KPI strip: `realized-pnl`, `win-rate`, `avg-hold-days`
   - Widgets: P&L by Setup Tag (existing chart, wrapped as a widget), Win/Loss/Flat (shared component), Setup Analytics Table (existing table, wrapped as a widget)

3. Layout persisted to `localStorage` under `kapman_analytics_layout` (separate from dashboard).

4. Ensure the P&L by Setup Tag chart and Setup Analytics Table are available in `WIDGET_REGISTRY` if not already.

**Acceptance criteria:**
- [ ] Analytics page renders a configurable KPI strip and widget grid.
- [ ] Edit mode allows the same customization as the dashboard.
- [ ] Default first-visit layout includes the three KPIs and three widgets listed above.
- [ ] Analytics layout persists independently from dashboard layout.
- [ ] Existing analytics functionality (P&L chart, win/loss pie, setup table) is preserved.

**Depends on:** KM-106 (KPI registry), KM-107 (resizable widgets)

---

### KM-113 — [v9.0-S3] Win/loss/flat: unify component across dashboard and analytics

**Type:** fix | **Priority:** P1 | **Effort:** S

**Context:**
The v7.2 inventory confirms the analytics page has its own win/loss/flat pie implementation that is missing the center win-rate label and total count present in the dashboard widget.

**Deliverables:**

1. Remove the analytics-specific win/loss/flat pie component (likely in `src/app/analytics/` or a co-located component file).
2. Ensure the shared `WinLossFlatWidget` from `src/components/widgets/WinLossFlatWidget.tsx` is used on both surfaces.
3. If the analytics page uses the reconfigurable grid (KM-112), the widget comes from `WIDGET_REGISTRY` automatically. If KM-112 is not yet complete, directly import the shared widget.

**Acceptance criteria:**
- [ ] Analytics page renders the same win/loss/flat donut as the dashboard, including center win-rate label and count legend.
- [ ] Only one `WinLossFlatWidget` component exists in the codebase.
- [ ] Both dashboard and analytics show identical output for the same data and account selection.

**Depends on:** nothing (but naturally sequenced after KM-112)

---

### KM-123 — [v9.0-S3] Analytics win/loss/flat: add center label and total count (if KM-113 insufficient)

**Type:** fix | **Priority:** P2 | **Effort:** XS

**Context:**
Defensive issue. If KM-113 fully replaces the analytics pie with the dashboard widget, this issue is absorbed and can be closed. If the analytics page retains a separate pie for layout reasons, this issue ensures the center label and total count are added.

**Deliverables:**

1. If a separate analytics pie still exists after KM-113:
   - Add center label showing win rate percentage (matching dashboard format).
   - Add total count below the chart or in the center label subtitle.

2. If KM-113 eliminated the separate pie: close this issue as "absorbed by KM-113."

**Acceptance criteria:**
- [ ] Analytics win/loss/flat visualization shows a center win-rate label.
- [ ] Total matched lot count is displayed.
- [ ] OR: issue is closed as absorbed by KM-113.

**Depends on:** KM-113

---

### KM-114 — [v9.0-S3] Widget component library audit and dedup

**Type:** ux | **Priority:** P2 | **Effort:** M

**Context:**
Beyond the win/loss/flat divergence, there may be other widget implementations that differ between surfaces. This issue is a systematic audit.

**Deliverables:**

1. Audit every component in `src/components/widgets/` and compare against any page-specific implementations in:
   - `src/app/analytics/` (or co-located files)
   - `src/app/dashboard/` (or co-located files)
   - `src/app/tts-evidence/`
   - `src/app/positions/`

2. For each duplicate found:
   - Determine which implementation is more complete or correct.
   - Consolidate into the `src/components/widgets/` version.
   - Remove the page-specific variant.
   - Update all imports.

3. Verify all 16 registered widgets in `WIDGET_REGISTRY` point to the canonical component.

4. Document findings: create a brief audit report as a PR comment listing what was found and consolidated.

**Acceptance criteria:**
- [ ] No page-specific widget variants exist outside `src/components/widgets/`.
- [ ] All `WIDGET_REGISTRY` entries point to `src/components/widgets/` components.
- [ ] PR includes an audit summary of what was found and changed.

**Depends on:** KM-113

---

## Sprint 4 — Polish and Quality of Life (Suggested)

Sprint 4 issues are recommendations based on the inventory review and code analysis. They are valuable but not critical for the v9.0 core goals. Implement if time permits or defer to v9.1.

---

### KM-115 — [v9.0-S4] Keyboard shortcuts for power-user actions

**Type:** feat | **Priority:** P3 | **Effort:** S

**Deliverables:**

1. Register global keyboard handlers (via `useEffect` on the root layout or a dedicated `useKeyboardShortcuts` hook):
   - `Ctrl+E` / `Cmd+E`: toggle edit mode on dashboard/analytics.
   - `Ctrl+R` / `Cmd+R`: refresh quotes on open positions page (prevent browser refresh).
   - `Ctrl+/` / `Cmd+/`: open a command palette (stretch goal — can be a simple search modal).

2. Display shortcut hints in button tooltips: "Customize (Ctrl+E)".

3. Do not register shortcuts on pages where they conflict with browser defaults.

**Acceptance criteria:**
- [ ] Ctrl+E toggles edit mode on the dashboard.
- [ ] Ctrl+R refreshes quotes on the positions page.
- [ ] Shortcut hints appear in button tooltips.

---

### KM-116 — [v9.0-S4] Export filtered table views to CSV

**Type:** feat | **Priority:** P2 | **Effort:** S

**Deliverables:**

1. Add an "Export CSV" button to the DataTableToolbar (from KM-103).
2. Export the currently visible rows (respecting all active filters and sort order).
3. Filename format: `kapman_{tableName}_{filterSummary}_{YYYYMMDD_HHMMSS}.csv`.
4. Use the browser `Blob` API and `URL.createObjectURL` for client-side download.
5. Include all displayed columns. Format monetary values as plain numbers (no $ prefix) for Excel compatibility.

**Acceptance criteria:**
- [ ] "Export CSV" button appears on every filterable table.
- [ ] Exported file contains only the filtered/sorted rows.
- [ ] Filename includes table name and timestamp.
- [ ] CSV opens correctly in Excel.

**Depends on:** KM-103

---

### KM-117 — [v9.0-S4] Dashboard layout presets (save/load named layouts)

**Type:** feat | **Priority:** P3 | **Effort:** M

**Deliverables:**

1. Add a "Presets" dropdown to the dashboard topbar (next to Customize button).
2. Options:
   - "Save current as..." — prompts for a preset name, saves current KPI + widget layout.
   - List of saved presets — click to load.
   - "Delete" option per preset.
3. Persist presets to `localStorage` under `kapman_dashboard_presets`.
4. Suggested default presets (user can modify):
   - "Default" — the first-visit layout.

**Acceptance criteria:**
- [ ] User can save the current layout as a named preset.
- [ ] User can switch between presets and the layout updates immediately.
- [ ] User can delete a preset.
- [ ] Presets persist across browser sessions.

**Depends on:** KM-106, KM-107

---

### KM-118 — [v9.0-S4] Consistent monetary value formatting via shared MoneyCell component

**Type:** ux | **Priority:** P2 | **Effort:** S

**Deliverables:**

1. `src/components/shared/MoneyCell.tsx`:
   - Props: `value: number | null`, `showSign?: boolean`, `compact?: boolean`.
   - Renders with `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`.
   - Color: positive = `text-green-400`, negative = `text-red-400`, zero = default text color.
   - Compact mode uses `formatCompactCurrency` for large values (e.g., "$1.2M").
   - Null/undefined renders "—".

2. Replace all inline currency formatting across the app with `MoneyCell`:
   - KPI tiles, widget values, table cells, summary cards.
   - Audit and replace: `toFixed(2)`, `toLocaleString(...)`, `formatCompactCurrency(...)` where they format for display.

**Acceptance criteria:**
- [ ] A single `MoneyCell` component exists and is used for all monetary display.
- [ ] Positive values render green, negative red, zero neutral.
- [ ] No raw decimal numbers appear in monetary contexts.

---

### KM-120 — [v9.0-S4] Global date range selector in shell

**Type:** feat | **Priority:** P2 | **Effort:** M

**Deliverables:**

1. Add a date range picker to the shell topbar, adjacent to the account selector.
2. Preset options: MTD, QTD, YTD, Last 30 days, Last 60 days, Last 90 days, All time, Custom range.
3. Store selected range in a new `DateRangeContext` provider.
4. All widgets, KPIs, and tables that accept date-range parameters should consume this context.
5. Default: "All time" (matches current behavior).

**Acceptance criteria:**
- [ ] Date range picker appears in the shell topbar.
- [ ] Selecting "Last 30 days" filters all selector-aware surfaces to the last 30 days.
- [ ] "All time" matches current behavior (no filter).
- [ ] Date range persists during the session.

---

### KM-124 — [v9.0-S4] Equity curve: support 3+ account line colors

**Type:** fix | **Priority:** P2 | **Effort:** XS

**Context:**
The v7.2 inventory notes that more than two accounts reuse the same two line colors on the equity curve chart.

**Deliverables:**

1. Define a 5-color palette for account lines (e.g., blue, teal, coral, purple, amber).
2. Assign colors by account index, cycling only after exhaustion.
3. Update the chart legend to show the correct color per account.

**Acceptance criteria:**
- [ ] Three accounts render with three distinct line colors.
- [ ] Legend matches the line colors.
- [ ] Combined line retains its current color/style.

---

### KM-125 — [v9.0-S4] Recent executions widget: fetch only 10 rows instead of 1000

**Type:** fix | **Priority:** P2 | **Effort:** XS

**Context:**
The v7.2 inventory confirms the Recent Executions widget fetches `pageSize=1000` and then slices to 10 client-side. This wastes bandwidth and processing.

**Deliverables:**

1. Change the widget's fetch to `/api/executions?pageSize=10&sort=eventTimestamp:desc`.
2. Verify the API supports this sort parameter. If not, add server-side support for `sort=eventTimestamp:desc`.
3. Remove the client-side sort and slice logic.

**Acceptance criteria:**
- [ ] Widget fetches only 10 rows from the API.
- [ ] Displayed rows are the 10 most recent by event timestamp.
- [ ] Network payload is ~99% smaller than current.

---

## Issue Dependency Graph

```
KM-101 (Accounts page)
  └─▸ KM-102 (Refactor starting-capital consumers)
  └─▸ KM-122 (Account ID normalization — needs displayLabel)

KM-119 (Sticky headers)
  └─▸ KM-103 (Universal column filter/sort)
       └─▸ KM-116 (Export CSV — needs DataTableToolbar)

KM-121 (TTS data source unification)
  └─▸ KM-110 (TTS RAG widget)
  └─▸ KM-111 (TTS evidence page)

KM-106 (Customizable KPI strip)
  └─▸ KM-112 (Analytics reconfigurable layout)
  └─▸ KM-117 (Dashboard presets)

KM-107 (Resizable widgets)
  └─▸ KM-112 (Analytics reconfigurable layout)

KM-113 (Win/loss/flat unification)
  └─▸ KM-123 (Analytics pie center label — may be absorbed)
  └─▸ KM-114 (Widget audit and dedup)

Independent (no blockers):
  KM-104, KM-105, KM-108, KM-109, KM-115, KM-118, KM-120, KM-124, KM-125
```

---

## Resumption Guide

If work is interrupted mid-release:

1. Search GitHub issues for the sprint tag (e.g., `[v9.0-S2]`) to find remaining work.
2. Check the dependency graph above — do not start a blocked issue before its blocker is merged.
3. Within a sprint, independent issues can be worked in any order.
4. The v7.2 as-built inventory remains the baseline reference for "what exists today."
5. This issues document and the v9.0 build spec together are the complete specification.
