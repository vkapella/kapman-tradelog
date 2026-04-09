# KapMan MVP Build Spec v4

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
   - Surface performance summary, win rate, expectancy
   - Notes/journaling may be deferred, but the setup analytics must exist in MVP

6. **TTS Evidence**
   - Evidence/readiness metrics and exports
   - Must be clearly labeled as evidence/readiness, not legal qualification logic

7. **Diagnostics**
   - Parse quality, unsupported rows, matching coverage, classifier confidence

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

## Data model

Core tables:
- imports
- accounts
- executions
- matched_lots
- setup_groups
- setup_group_lots
- daily_account_snapshots

## FIFO matching rules

- FIFO is the permanent record-of-book matching method
- Matching occurs at the lot level
- Closing buys match to prior short option opens FIFO
- Expired options can close at zero on expiration date when data supports it
- Assignment/exercise should be represented if present in the broker export
- Matching engine must be broker-neutral and test-covered

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

The UI must already show T3 setup analytics:
- performance summary
- win rate
- expectancy

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

## UI / UX specification

Navigation:
- Overview
- Imports & Connections
- Executions
- Matched Lots
- Setups
- TTS Evidence
- Diagnostics

The mock and real app should follow a routed multi-screen shell, not one giant page.

## Technical stack recommendation

- Frontend: Next.js + TypeScript + Tailwind
- Tables: TanStack Table
- Charts: Recharts
- DB: PostgreSQL
- ORM: Prisma
- Validation: Zod
- Containerization: Docker, docker-compose
- Deploy target: Fly.io

## Non-goals for MVP

- broker API live sync
- journaling/notes editor
- advanced auth / multi-user SaaS
- options Greeks analytics
- tax form generation
- mobile-native app

## Acceptance criteria

The MVP is successful when:
1. A user can upload a thinkorswim export and get canonical executions persisted.
2. The adapter handles equities, single-leg options, verticals, diagonals, open/close effects, expiration, and assignment/exercise if present.
3. FIFO matching generates T2 matched lots correctly.
4. The system computes setup groups (T3) and shows performance summary, win rate, expectancy.
5. The app provides routed screens for Overview, Imports, Executions, Matched Lots, Setups, TTS Evidence, and Diagnostics.
6. The codebase is containerized and runnable locally.
7. The codebase includes a Fidelity adapter stub that can be extended next.
