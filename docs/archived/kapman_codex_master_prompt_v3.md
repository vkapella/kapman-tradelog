You are building a production-ready repository named `kapman-ledger`.

Your goal is to create a containerized full-stack application that ingests **Schwab thinkorswim**, **Fidelity**, and later additional broker account statements; normalizes those imports into a broker-agnostic execution ledger; builds a FIFO matched-lot engine; infers trading strategy setups; and renders a dashboard for both trade analytics and Trader Tax Status evidence reporting.

Do not build a toy or static mock. Build a working skeleton with a real adapter-based ingestion layer, real Postgres schema, real API routes, real seeded demo data, real Docker configuration, real tests, and a clean deploy path to Fly.io.

## Product boundaries
- This app is an evidence and analysis system, not tax or legal advice.
- The system must never claim that the user qualifies for Trader Tax Status.
- The system may compute readiness or evidence metrics and present them as benchmarks.
- FIFO is the immutable ledger-of-record method.
- Scenario compare for HIFO/LIFO may be scaffolded but must be explicitly read-only and excluded from book-of-record outputs.

## Core platform direction
- **MVP parser**: Schwab thinkorswim
- **Next parser**: Fidelity
- **Architecture requirement**: broker adapter pattern from day one
- **Future requirement**: more brokers can be added without changing the ledger engine, analytics layer, or core UI workflow

All broker-specific logic must stop at the adapter boundary. Downstream services must operate on normalized broker-agnostic execution records.

## Users
Primary user: an active options/equity trader practicing a defined discretionary style called KapMan.

## Input data
The app must support:
- Schwab thinkorswim statement uploads first
- Fidelity statement uploads next
- future brokers via the same adapter contract

## Ingestion UX requirements
Create an **Imports & Connections** screen inspired by the workflow shape of TradesViz, but simpler and more product-specific.

The top action menu must include:
1. Upload File
2. Manual Trade Entry
3. Add Auto-sync Connection
4. View Auto-sync Connections
5. Manage/Export Data

For MVP:
- Upload File must work end to end
- Manual Trade Entry may be scaffolded
- Auto-sync connection flows may be scaffolded with placeholder UI and API boundaries
- Manage/Export Data may start as a minimal page

The statement-upload form must support:
- trading account selection or creation
- broker/platform selection
- reporting timezone
- reporting currency
- optional tags
- optional import-from date
- file upload
- import summary with duplicates, warnings, and flagged rows
- broker-specific export instructions panel driven by the selected adapter

## Required adapter contract
Implement a broker adapter registry with an interface similar to:
- `detect(file_bytes, file_name) -> confidence_score`
- `parse(file_bytes, import_context) -> ParsedImportResult`
- `normalize(raw_row, import_context) -> NormalizedExecutionCandidate | ParserFlag`
- `list_supported_file_types() -> list[str]`
- `platform_export_help() -> structured help content`

Implement these adapters:
1. `schwab_thinkorswim` — fully working MVP adapter
2. `fidelity` — scaffolded adapter with interface, tests/fixtures placeholders, and UI wiring for future implementation

## Required domain model
Implement these persistence layers:
1. `accounts`
2. `imports`
3. `executions`
4. `matched_lots`
5. `setups`
6. `daily_equity_snapshots`
7. `parser_flags`
8. `audit_events`
9. `broker_connections`
10. `scenario_runs`

### Executions
Each broker fill is one normalized execution row.
Store raw row payload and parsed normalized fields.
Persist parse status for unsupported rows.
Ensure dedupe is idempotent using a stable dedupe hash.

### Matched lots
Each FIFO-matched open-close pair is one matched-lot row.
This is the canonical realized P&L and holding-period table.
Support partial closes and open lots.

### Setups
Setups are named groupings of matched lots for business intelligence.
Strategy tags are inferred automatically and can be manually overridden.

## Ledger rules
- FIFO only for canonical matching.
- Long equity and long options: buy opens, sell closes.
- Short options: sell-to-open opens, buy-to-close closes.
- Worthless expiry: synthesize a close at 0 on expiration date.
- Assignment/exercise: create explicit lifecycle events and basis transfer behavior.
- Unsupported multi-leg custom broker rows must be preserved, flagged, and surfaced for reconciliation.

## Strategy inference rules v1
Implement deterministic strategy inference for:
- long_call
- long_put
- stock_long
- cash_secured_put
- covered_call
- bull_call_vertical
- bear_call_vertical
- bull_put_vertical
- bear_put_vertical
- roll
- unknown

Manual override field always wins over inferred tag in displayed analytics.

## TTS evidence metrics
Compute but do not overclaim:
- executions per month
- annualized execution pace
- active trading days per week
- mean holding period by matched lot
- median holding period by matched lot
- percent of matched lots closed within 31 days
- gross proceeds
- time-in-market distribution histogram

UI copy must describe these as evidence or readiness metrics, not IRS qualification rules.

## Important compliance/copy constraints
The UI must state that Trader Tax Status is a facts-and-circumstances determination.
Avoid phrasing that implies guaranteed qualification.

## Tech stack
Use:
- Frontend: Next.js + TypeScript + Tailwind + shadcn/ui
- Backend: FastAPI + SQLAlchemy + Pydantic
- Database: PostgreSQL
- Charts: Recharts
- Tables: TanStack Table
- Tests: Pytest and Playwright
- Containerization: Docker + docker-compose
- Deployment: Fly.io config and docs

## Repository structure
Create a monorepo with `apps/web` and `apps/api`.
Include:
- Dockerfiles
- docker-compose.yml
- Fly.io config
- `.env.example`
- seed script
- sample uploads folder
- migration tooling
- test fixtures
- README with architecture and local startup

## Pages / screens
1. Overview
2. Imports & Connections
3. Matched Lots
4. Executions
5. Setups
6. TTS Evidence
7. Reconciliation

## UX expectations
- Pragmatic trading workstation feel
- Fast filters, dense tables, drawer-based detail panels
- Clear traceability from KPI -> setup -> matched lot -> execution -> raw source row
- Upload flow with import results and duplicate detection
- Visible warnings for unsupported rows
- Broker instruction panel updates when broker selection changes

## API requirements
Create real endpoints for:
- POST `/imports`
- GET `/imports`
- GET `/imports/{id}`
- POST `/ledger/rebuild`
- GET `/executions`
- GET `/matched-lots`
- GET `/matched-lots/{id}`
- GET `/setups`
- PATCH `/matched-lots/{id}/tag`
- GET `/analytics/overview`
- GET `/analytics/tts`
- GET `/analytics/equity`
- GET `/broker-adapters`
- GET `/broker-adapters/{key}/help`
- GET `/broker-connections`

## Parser requirements
Create a working Schwab thinkorswim statement parser that:
- extracts execution timestamps
- identifies asset class and option metadata
- parses quantity, price, fees, net amount, and broker balance
- normalizes symbol/instrument identity into a stable matching key
- flags unsupported custom multi-leg rows instead of silently dropping them

Create a Fidelity adapter shell that:
- is registered in the adapter registry
- returns supported file metadata and help text
- includes placeholder fixtures/tests/TODOs for the next implementation pass

## Seed/demo expectations
Seed the app with a small realistic demo dataset and include one or two sample CSV files in a non-sensitive fixture folder.
The seeded experience must render charts and tables without additional user action.

## Test requirements
At minimum include automated tests for:
- adapter registry selection
- parser correctness on representative Schwab thinkorswim rows
- idempotent import dedupe
- FIFO matching with partial close
- short option open/close lifecycle
- expiry worthless synthetic close
- assignment/exercise basis bridge
- analytics endpoint smoke tests
- basic UI render and filter flow

## Delivery expectations
Generate repository files directly.
Write clean, typed, maintainable code.
Prefer explicitness over cleverness.
Document tradeoffs in the README.
Where a full feature is too large, scaffold it honestly with TODOs and tests around boundaries rather than faking completeness.

## First milestone output
The initial generated repo must be runnable locally with:
- `docker compose up --build`

and should provide:
- a working thinkorswim upload flow
- persisted imports and executions
- working FIFO matched-lot generation
- an Imports & Connections screen with broker selector and export instructions
- a dashboard with overview, matched lots, and TTS evidence screens
- a seeded demo dataset
- passing tests for the core ledger engine and adapter boundary
- a registered Fidelity adapter stub ready for the next issue
