# KapMan MVP Build Spec v5

## Product statement

Build a containerized web application that ingests **Schwab thinkorswim**, **Fidelity**, and later other broker account statements/exports, normalizes them into a canonical trading ledger, and presents an MVP dashboard for trade review, matched-lot accounting, setup analytics, and TTS evidence reporting.

The MVP must start with **Schwab thinkorswim** as the first fully working adapter.
The architecture must make it easy to bolt on **Fidelity next** and additional brokers later without rewriting the ledger or analytics layers.

## MVP goals

The MVP is not ingestion-only. It must deliver these end-to-end surfaces:

1. **Imports & Connections**
   - Upload broker files
   - Detect broker/export type
   - Route to adapter
   - Parse and validate
   - Show preview before commit
   - Commit canonical executions into the ledger
   - Show import history and QA/warnings

2. **Overview**
   - High-level P&L and activity summary
   - Counts for executions, matched lots, and setup groups
   - Simple readiness/evidence summary for short-duration active trading

3. **Executions (T1)**
   - Canonical execution/event table after import normalization
   - Search/filter by symbol, account, broker, asset class, date

4. **Matched Lots (T2)**
   - FIFO-matched open/close pairs
   - Realized P&L
   - Holding period / days in trade
   - Win/loss outcome

5. **Setups (T3)**
   - Group matched lots into strategy/setup views
   - Surface performance summary, win rate, expectancy, and average hold time
   - Notes/journaling may be deferred, but setup analytics must exist in MVP

6. **TTS Evidence**
   - Evidence/readiness metrics and exports
   - Must be clearly labeled as evidence/readiness, not legal qualification logic

7. **Diagnostics**
   - Parse quality, unsupported rows, matching coverage, classifier confidence, and uncategorized counts

## Product principles

- FIFO is the immutable ledger of record
- T2 matched lot is the canonical tax/analytics unit
- T3 setup is the business-intelligence grouping layer
- Adapters stay lean
- Ledger/accounting logic is broker-neutral
- Setup inference is downstream from parsing
- TTS outputs are evidence/readiness, not legal determination

## Architecture

### High-level layers

1. Frontend app
2. API / application layer
3. Ingestion layer
4. Ledger layer
5. Analytics layer
6. Database
7. Containerization / deploy

## Broker adapter strategy

### MVP adapter scope: `schwab_thinkorswim`

The first working adapter must fully support:
- equities
- single-leg options
- vertical spreads
- diagonal spreads
- opening vs closing effects
- expirations
- assignments/exercises if present in export
- paper and real-money file variants if formats differ

### Next adapter target: `fidelity`

The MVP codebase must include:
- a registered Fidelity adapter stub
- adapter interface compliance
- a path to bolt in parser logic later without touching ledger logic

## Lean adapter contract for MVP

```ts
interface BrokerAdapter {
  id: string;
  displayName: string;
  detect(file: UploadedFile): DetectionResult;
  parse(file: UploadedFile, options?: ParseOptions): ParseResult;
  coverage(): AdapterCoverage;
}
```

The adapter is responsible for:
- detecting whether a file belongs to that broker/export format
- parsing rows
- normalizing rows into canonical events
- surfacing warnings/errors

The adapter is not responsible for:
- FIFO matching
- setup inference
- expectancy logic
- TTS metrics
- dashboard summaries

## thinkorswim CSV format contract

The thinkorswim `Account Statement` export is a multi-section CSV.
The section used for execution ingestion is headed by `Account Trade History`.

Expected trade-history columns (exact header names):
- `Exec Time`
- `Spread`
- `Side`
- `Qty`
- `Pos Effect`
- `Symbol`
- `Exp`
- `Strike`
- `Type`
- `Price`
- `Net Price`
- `Order Type`

Parsing rules:
- rows before any section header are account metadata and must be skipped
- `Spread` can include `STOCK`, `SINGLE`, `VERTICAL`, `DIAGONAL`
- `Pos Effect` can include `TO OPEN`, `TO CLOSE`, `EXPIRED`, `ASSIGNED`, `EXERCISED`
- option symbols may also be represented in encoded form such as `AAPL 240119C150`; preserve the raw value and derive normalized option metadata where possible
- `Qty` is negative for sells and positive for buys
- fees may appear in a separate `Fees & Commissions` section and should be joined by Order ID when available
- paper-account exports may use different account metadata prefixes but the same core trade-history structure
- emit one canonical execution per row
- do not merge legs for verticals or diagonals inside the adapter

## Canonical event model (MVP)

Required fields:
- id
- import_id
- broker
- broker_account_id
- account_label
- event_timestamp
- trade_date
- event_type
- asset_class
- symbol
- instrument_key
- description_raw
- side
- quantity
- price
- gross_amount
- fees
- net_amount
- opening_closing_effect
- underlying_symbol
- option_type
- strike
- expiration_date
- multiplier
- source_row_ref
- raw_row_json

For spreads, the adapter emits leg-level events. Spread recognition and grouping happen later in the analytics/classification layer.

## API routes (MVP)

These routes are required before the UI is built against live data:

```text
POST   /api/imports/upload          — multipart, returns import_id + detection result
POST   /api/imports/:id/commit      — runs adapter parse + persists executions
GET    /api/imports                 — paginated list with status
GET    /api/executions              — ?symbol=&account=&date_from=&date_to=&page=
GET    /api/matched-lots            — ?symbol=&outcome=&page=
GET    /api/setups                  — ?tag=&page=
GET    /api/setups/:id              — detail with lots + executions
GET    /api/overview/summary        — P&L, counts, avg hold time
GET    /api/tts/evidence            — all TTS metrics as JSON
GET    /api/diagnostics             — parse/match/setup coverage stats
GET    /api/health                  — deployment/database health check
```

Response conventions:
- success: `{ data, meta: { total, page, pageSize } }`
- error: `{ error: { code, message, details[] } }`

## Data model

Core tables:
- imports
- accounts
- executions
- matched_lots
- setup_groups
- setup_group_lots
- daily_account_snapshots

### Purpose of `daily_account_snapshots`

This table exists for future account-balance and equity-curve snapshots.
In MVP it may be minimally populated or deferred, but its purpose must be documented and visible in Diagnostics/README so it is not an orphan table.

## FIFO matching rules

- FIFO is the permanent record-of-book matching method
- matching occurs at the lot level
- closing buys match to prior short option opens FIFO
- expired options can close at zero on expiration date when data supports it
- assignment/exercise should be represented if present in the broker export
- matching engine must be broker-neutral and test-covered
- wash sales are warnings only in MVP and do not adjust P&L

## FIFO edge cases the engine must handle

| Scenario | Rule |
|---|---|
| Partial close | Create one matched lot for the closed portion and leave the remainder open |
| Roll (close + reopen same symbol same day) | Match the close to the prior open; the new open starts a fresh lot |
| Short option close | Closing BUY matches to the prior selling OPEN |
| Expiration | Close lot at $0 on expiration date and compute resulting P&L from opening premium/cost basis |
| Assignment/exercise | Treat as forced close at strike price when settlement data exists in export |
| Multiple opens, one close | FIFO matches oldest open first |
| Wash sale | Flag only; do not adjust P&L in MVP |

Every scenario above must have a dedicated unit test.

## Setup inference rules for MVP

Initial supported tags:
- long_call
- long_put
- covered_call
- cash_secured_put
- bull_vertical
- bear_vertical
- diagonal
- roll
- uncategorized

## Setup grouping algorithm

A setup group is a collection of matched lots sharing:
- the same underlying symbol
- the same inferred strategy tag
- entry dates within a configurable grouping window, default `5` calendar days

Inference order:
1. all lots are `asset_class=STOCK` → infer `stock`, unless paired short calls make the group `covered_call`
2. single option lot, side `BUY`, type `CALL` → `long_call`
3. single option lot, side `BUY`, type `PUT` → `long_put`
4. single option lot, side `SELL`, type `PUT`, cash-secured → `cash_secured_put`
5. single option lot, side `SELL`, type `CALL`, paired with stock → `covered_call`
6. two option lots, same underlying, same expiry, different strikes → `bull_vertical` or `bear_vertical`
7. two option lots, same underlying, different expirations → `diagonal`
8. close event matches prior open and a new open exists within 5 days → `roll`
9. otherwise → `uncategorized`

Tag inference failures must be counted in Diagnostics as `uncategorized_count`.

The UI must already show T3 setup analytics:
- performance summary
- win rate
- expectancy
- average hold time

## MVP analytics

Overview:
- net P&L
- closed matched lots
- average time in trade
- active trade days
- import quality summary

Matched Lots:
- realized P&L
- holding days
- win/loss outcome
- drill through to underlying executions

Setups:
- setup performance summary
- win rate
- expectancy
- average hold time
- setup counts
- drill through from setup to matched lots to executions

TTS Evidence:
- trades per month
- active trading days per week
- average holding period
- median holding period
- annualized trade count
- time-in-market / holding-period distribution
- gross proceeds proxy

Diagnostics:
- parse coverage
- unsupported row count
- matching coverage
- setup inference confidence / uncategorized count
- surfaced parser assumptions and warnings

## Fixture and seed requirements

A fixture file at `/fixtures/sample_tos_export.csv` must exist and represent a minimal but realistic thinkorswim export containing:
- 2 stock round trips
- 2 single-leg option round trips: 1 long call and 1 short put
- 1 vertical spread with both legs visible
- 1 expiration event

This fixture must be:
- used in all parser tests
- seeded into the dev DB on `docker compose up`
- sufficient to render populated states for all major pages without private files

## UI / UX specification

Navigation:
- Overview
- Imports & Connections
- Executions
- Matched Lots
- Setups
- TTS Evidence
- Diagnostics

The app must follow a routed multi-screen shell, not one giant page.
Use `/design/kapman_dashboard_mock_v5.html` as the visual target.

Page expectations:
- all data pages handle loading, empty, and populated states
- empty states include a clear call to action
- imports workflow shows progress, preview, validation result, and commit summary
- tables declare default columns and meaningful default sorts

## Technical stack recommendation

- Frontend: Next.js 14.2.x + TypeScript 5.4.x + Tailwind 3.4.x
- Tables: TanStack Table 8.17.x
- Charts: Recharts 2.12.x
- DB: PostgreSQL
- ORM: Prisma 5.14.x
- Validation: Zod 3.23.x
- Containerization: Docker, docker-compose
- Deploy target: Fly.io

## Environment and deployment contract

Provide a `.env.example` containing every required variable, including at minimum:
- `DATABASE_URL`
- `NODE_ENV`
- any upload/storage settings required by the chosen implementation
- any app URL/base URL variable required by Next.js runtime behavior

Fly.io deployment must include:
- `fly.toml` with app name placeholder
- primary region `iad`
- HTTP health check against `/api/health`
- README steps for `fly auth login`, `fly launch`, `fly deploy`
- `DATABASE_URL` expected via Fly secrets or managed Postgres integration

## Non-goals for MVP

- broker API live sync
- journaling/notes editor
- advanced auth / multi-user SaaS
- options Greeks analytics
- tax form generation
- mobile-native app
- legal determination of TTS qualification

## Acceptance criteria

The MVP is successful when:
1. `docker compose up` starts the app and database and seeds fixture data.
2. A user can upload a thinkorswim export, preview it, commit it, and get canonical executions persisted.
3. The adapter handles equities, single-leg options, verticals, diagonals, open/close effects, expiration, and assignment/exercise if present.
4. FIFO matching generates T2 matched lots correctly, including the explicit edge cases in this spec.
5. The system computes setup groups (T3) and shows performance summary, win rate, expectancy, and average hold time.
6. The app provides routed screens for Overview, Imports, Executions, Matched Lots, Setups, TTS Evidence, and Diagnostics.
7. Each data page handles loading, empty, and populated states without console errors.
8. The codebase includes a Fidelity adapter stub that can be extended next.
9. The codebase is containerized, runnable locally, and ready for initial Fly.io deployment.
