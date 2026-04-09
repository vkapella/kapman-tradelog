# KapMan MVP Build Spec v6

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
- equities and ETFs
- single-leg options
- vertical spreads
- diagonal spreads
- calendar spreads
- opening vs closing effects
- inferred expirations when lots remain open past expiry
- assignments/exercises if present in export
- paper and real-money file variants if formats differ
- multiple accounts across separate uploaded CSVs

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

## thinkorswim CSV format contract (verified against real exports)

### File structure
The thinkorswim Account Statement export is a multi-section CSV.
Sections are identified by title rows that do not begin with a comma.
Known sections relevant to MVP:
- `Cash Balance`
- `Account Order History`
- `Account Trade History`

### Account Trade History section
Exact header row:
`,Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type`

Important parsing rule:
- the first column is blank
- column alignment must account for the leading comma on the header row and all data rows

Known spread values observed in real files:
- `SINGLE`
- `STOCK`
- `VERTICAL`
- `DIAGONAL`
- `CALENDAR`
- `COMBO`
- `CUSTOM`

Parser behavior:
- unknown spread values must generate warnings
- unknown spread values must not be silently dropped
- conservative fallback is allowed, but it must be visible in Diagnostics

Known `Pos Effect` values in Trade History:
- `TO OPEN`
- `TO CLOSE`

Do not assume `EXPIRED`, `ASSIGNED`, or `EXERCISED` rows exist in Trade History.

### Multi-leg spread rows
Trade History multi-leg orders use an anchor row and continuation rows.
Rules:
- anchor row has `Exec Time`
- continuation rows may have blank `Exec Time`
- continuation rows may have blank `Order Type`
- continuation rows may use string `Net Price` values such as `DEBIT` or `CREDIT`
- continuation rows immediately following an anchor row belong to the same spread group
- emit each leg as its own canonical execution
- assign a shared `spread_group_id` to all legs in the same grouped order

### Price and type edge cases
- `Price` may be `~` and must be treated as null/unknown
- `Net Price` may be numeric, `DEBIT`, or `CREDIT` and must initially be parsed as string
- `Type` may be `CALL`, `PUT`, `ETF`, or blank
- derive `asset_class` as `OPTION` for `CALL`/`PUT`, otherwise `EQUITY` when the row is stock/ETF-like

### Expirations
Expired options do not reliably appear in Trade History.
They may appear in `Account Order History` or need inference.
For MVP:
- expiration logic must not depend on a Trade History `EXPIRED` row
- if an open option lot has no matching close and its expiration date is in the past, create a synthetic close at `0`
- synthetic close event type: `EXPIRATION_INFERRED`
- all synthetic expirations must be surfaced in Diagnostics

### Fees and cash balance linkage
Trade History contains no fee columns.
Fees and account-balance effects appear in `Cash Balance` rows.
Use `REF #` as the join key when available.
Before matching:
- strip wrappers like `="5229435487"`
- strip annotation prefixes like `tIP` and `tIPAD` from descriptions

### Cash Balance and snapshots
The `Cash Balance` section contains `BAL` rows for every calendar day in the real exports.
Those rows should populate `daily_account_snapshots` in MVP.
This is the source for the Overview equity curve.

### Account metadata and multi-account
The first account statement line contains the account identifier and date range.
Each uploaded CSV is one account import.
The system must support multiple accounts without mixing imports, executions, matched lots, or setup analytics across accounts.

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

This table must be populated from `Cash Balance` `BAL` rows in MVP.
Use it to power the Overview equity curve and account-balance snapshots.
Document any skipped or inferred snapshot logic in Diagnostics/README.

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
| Expiration | If an open option lot has no matching close and expiration date is past, create a synthetic close at $0 with event type `EXPIRATION_INFERRED` and compute resulting P&L from opening premium/cost basis |
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
- calendar
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
7. two option lots, same underlying, same strike, different expirations → `calendar`
8. two option lots, same underlying, different expirations and different strikes → `diagonal`
9. close event matches prior open and a new open exists within 5 days → `roll`
10. otherwise → `uncategorized`

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

Fixtures under `/fixtures/` must include:
- `/fixtures/sample_tos_export.csv` with:
  - 2 stock round trips
  - 2 single-leg option round trips: 1 long call and 1 short put
  - 1 vertical spread with both legs visible
  - 1 inferred-expiration scenario
- `/fixtures/2026-04-06-AccountStatement.csv`
- `/fixtures/2026-04-06-AccountStatement-2.csv`

Fixture requirements:
- the synthetic file and both real-format files must be used in parser tests
- seeded dev data must be enough to show populated states on all major pages without a private upload
- the two real-format files must validate multi-account parsing, continuation-leg parsing, and snapshot extraction

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
Use `/design/kapman_dashboard_mock_v6.html` as the visual target.

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
3. The adapter handles equities/ETFs, single-leg options, verticals, diagonals, calendars, open/close effects, inferred expiration, and assignment/exercise if present.
4. FIFO matching generates T2 matched lots correctly, including the explicit edge cases in this spec.
5. The system computes setup groups (T3) and shows performance summary, win rate, expectancy, and average hold time.
6. The app provides routed screens for Overview, Imports, Executions, Matched Lots, Setups, TTS Evidence, and Diagnostics.
7. Each data page handles loading, empty, and populated states without console errors.
8. The codebase includes a Fidelity adapter stub that can be extended next.
9. The codebase is containerized, runnable locally, and ready for initial Fly.io deployment.
