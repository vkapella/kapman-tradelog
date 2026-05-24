# KapMan Architecture

This document describes the current as-built architecture of KapMan Trading Journal.
Use it with `docs/data_model.md`, `docs/metrics_calcs.md`, and `docs/recommendations.md`.

## System Shape

KapMan is a containerized Next.js 14 application with the App Router, TypeScript, Prisma, and PostgreSQL.

- The browser UI lives under `src/app/` and `src/components/`.
- API routes live under `src/app/api/`.
- Database access goes through Prisma in `src/lib/db/prisma.ts`.
- Broker parsing lives under `src/lib/adapters/`.
- FIFO matching lives under `src/lib/ledger/`.
- Setup grouping and tag inference live under `src/lib/analytics/`.
- Quote-backed position snapshots use the MCP market-data wrapper under `src/lib/mcp/`.

The Docker workflow starts the app and database together. The app container runs `prisma generate`, `prisma migrate deploy`, `prisma db seed`, then `next dev` on container port `3000`, mapped to host port `3002`.

## Layer Boundaries

The codebase keeps the major concerns separate:

| Layer | Primary Files | Responsibility |
|---|---|---|
| Broker adapters | `src/lib/adapters/**` | Detect broker files and normalize rows into executions, snapshots, cash events, warnings, and preview rows. |
| Import persistence | `src/app/api/imports/**`, `src/lib/imports/**` | Store uploaded source text, commit parsed rows transactionally, replace import-owned data, and track row counts. |
| Ledger | `src/lib/ledger/**` | Match opening and closing executions FIFO, infer option expirations, calculate realized P&L, and emit ledger warnings. |
| Analytics | `src/lib/analytics/**` | Build setup inference lots, classify setup groups, calculate setup metrics, and produce setup diagnostics. |
| Presentation | `src/app/**`, `src/components/**` | Fetch typed API outputs and render tables, widgets, drill-through panels, and dashboard views. |

Pages do not parse broker files, run FIFO matching, or infer setup tags directly. They consume API contracts from `types/api.ts`.

## Runtime Data Flow

### Import Upload And Preview

1. The Imports page posts a CSV file to `POST /api/imports/upload`.
2. `detectAdapter()` selects the active adapter from `src/lib/adapters/index.ts`.
3. The adapter parses the file into normalized executions, daily snapshots, cash events, warning records, account metadata, and preview rows.
4. The API upserts the broker account, creates an `Import` row with status `UPLOADED`, stores the source CSV text, and returns detection plus preview data.

The upload step does not persist executions, matched lots, setup groups, snapshots, or cash events beyond the upload record and account row.

### Import Commit

1. The Imports page posts to `POST /api/imports/[id]/commit`.
2. The route reloads the stored source text and parses it again through the adapter registry.
3. A Prisma transaction replaces import-linked executions, snapshots, and cash events.
4. Fidelity imports apply additional cross-import duplicate filtering before persistence.
5. `rebuildAccountLedger()` deletes and rebuilds matched lots and synthetic expiration executions for the account.
6. `rebuildAccountSetups()` deletes and rebuilds setup groups for the account.
7. Combined parser, ingest, ledger, and setup warnings are stored on the import.
8. The route fires an asynchronous position snapshot compute request for the affected account.

The transaction protects against partial import commits. If commit fails, the import is marked `FAILED`.

### Ledger Rebuild

`rebuildAccountLedger()` reads source executions for one account, applies active split, execution quantity, and execution price adjustments, then calls `runFifoMatcher()`.

The matcher:

- sorts executions by event timestamp, open/unknown/close priority, and id
- tracks open lots by instrument key
- treats explicit `TO_CLOSE`, assignment, and exercise rows as closes
- treats some unknown equity rows as closes when they offset an open lot
- calculates realized P&L using an option multiplier of `100` and an equity multiplier of `1`
- creates `EXPIRATION_INFERRED` option closes at price `0` after expiration
- emits unmatched-close, side-mismatch, synthetic-expiration, and potential wash-sale warnings

Persisted `MatchedLot` rows store quantity, realized P&L, hold days, outcome, and open/close execution links.

### Setup Rebuild

`rebuildAccountSetups()` builds inference lots from matched lots, calls `inferSetupGroups()`, persists `SetupGroup` rows, and links matched lots through `SetupGroupLot`.

Inference currently supports:

- stock
- long call
- long put
- covered call
- cash-secured put
- bull vertical
- bear vertical
- diagonal
- calendar
- roll
- short call
- uncategorized

Grouping is by account, underlying, inferred structure, and a default five-day entry window, with special handling for rolls and overlapping stock anchors.

## Application Surfaces

| Route | Purpose | Main Data Sources |
|---|---|---|
| `/dashboard` | Configurable KPI strip and widget grid. | `/api/overview/summary`, widgets' own endpoints, position snapshots. |
| `/analytics` | Setup-oriented analytics and charts. | `/api/setups`, `/api/matched-lots`, `/api/diagnostics`. |
| `/positions` | Open positions with cached quote marks and unrealized P&L. | `openPositionsStore`, `/api/positions/snapshot`, `/api/positions/snapshot/compute`. |
| `/trade-records?tab=executions` | T1 execution audit table and row drill-through. | `/api/executions`, `/api/imports`, `/api/executions/[id]`. |
| `/trade-records?tab=matched-lots` | T2 FIFO matched-lot table. | `/api/matched-lots`, `/api/imports`. |
| `/trade-records?tab=setups` | T3 setup table and setup drill-through. | `/api/setups`, `/api/setups/[id]`. |
| `/imports` | Upload, preview, commit, delete, and inspect import history. | `/api/imports/upload`, `/api/imports/[id]/commit`, `/api/imports`, `/api/imports/adapters`. |
| `/accounts` | Account display metadata and starting capital. | `/api/accounts`, `/api/accounts/[id]`. |
| `/adjustments` | Manual adjustments, preview, reverse, and ledger rebuild. | `/api/adjustments`, `/api/adjustments/preview`, `/api/accounts/[id]/rebuild-ledger`. |
| `/tts-evidence` | Evidence-oriented trader tax status metrics. | `/api/tts/evidence`. |
| `/diagnostics` | Parser, ledger, cash, and setup inference diagnostics. | `/api/diagnostics`, `/api/diagnostics/case-file`. |

Legacy convenience routes `/executions`, `/matched-lots`, and `/setups` redirect to the corresponding Trade Records tabs.

## Shared UI Infrastructure

The app uses shared table and widget infrastructure:

- `DataTableHeader`, `ColumnFilterPanel`, `DataTableToolbar`, and `useDataTableState` provide sortable and filterable virtualized tables.
- `WidgetCard`, `WidgetPicker`, `KpiPicker`, `WIDGET_REGISTRY`, and `KPI_REGISTRY` define configurable dashboard surfaces.
- Dashboard widget layout is stored in `localStorage` under `kapman_dashboard_layout`.
- Dashboard KPI layout is stored in `localStorage` under `kapman_kpi_layout`.
- Open position snapshots and quote marks are cached per account in `localStorage` under `kapman_positions_{accountId}`.

## Scoping

Most routes support account scoping through an `accountIds` query parameter. This parameter generally carries internal Prisma `Account.id` values, while display surfaces use broker account numbers or configured labels through `AccountLabel` and `AccountFilterContext`.

Many routes also support date range parameters from `RangeFilterContext`. Current date semantics are:

- executions filter by execution timestamp or trade date
- matched lots and strategy analytics use a trade-entry cohort, filtering by `openExecution.tradeDate`
- setups filter through linked matched lots; with an active range, a setup must have at least one linked lot and every linked lot must have an opening trade date in range
- portfolio return and Return on Capital use period boundaries: latest snapshot at or before the start date, latest value at or before the end date, and external capital flows inside the range
- snapshots filter by snapshot date or snapshot compute time where the route is snapshot-oriented

These differences mean NLV-based portfolio return and strategy analytics may not reconcile exactly for the same selected range.

## External Integrations

Quote-backed position snapshots use `src/lib/mcp/market-data.ts`, which calls an MCP client wrapper for equity and option quotes. Position snapshot compute persists the quoted mark values, marked positions, current NLV, unrealized P&L, realized P&L, cash adjustments, manual adjustments, total gain, starting capital, and unexplained delta in `PositionSnapshot`.

If quote retrieval fails, snapshot status becomes `FAILED` and the UI keeps the previous cached open-position view where available.
