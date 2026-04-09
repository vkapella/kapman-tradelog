# KapMan Codex Master Prompt v4

You are building an MVP product called KapMan Trading Journal.

Your task is to:
1. create a GitHub repo structure for the MVP
2. create a concise issue/story backlog from the included issue plan
3. execute the stories iteratively in code
4. leave the repo in a state that runs locally in containers and is ready for Fly.io deployment

## Product objective

Build a containerized web application that ingests Schwab thinkorswim, Fidelity, and later other broker account statements/exports, normalizes them into a canonical trading ledger, and provides an MVP dashboard for:
- Imports & Connections
- Overview
- Executions (T1)
- Matched Lots (T2)
- Setups (T3)
- TTS Evidence
- Diagnostics

The MVP must start with Schwab thinkorswim as the first fully working adapter.
The architecture must make Fidelity easy to add next via the same adapter boundary.

## Product rules

- FIFO is the immutable ledger of record
- matched lots (T2) are the canonical accounting/analytics unit
- setups (T3) are a grouping/analytics layer above matched lots
- adapters stay lean: detect, parse, normalize, warn
- adapters do not own FIFO, expectancy, setup analytics, or TTS logic
- TTS outputs must be labeled as evidence/readiness, not legal determination

## MVP must include more than ingestion

Do not narrow the MVP to ingestion only.
The MVP must include the other product layers too:
- Imports must be correct and be the most detailed workflow surface
- Overview must exist and summarize the system
- Executions must display normalized T1 events
- Matched Lots must display FIFO T2 records
- Setups must visibly include:
  - performance summary
  - win rate
  - expectancy
- TTS Evidence must exist
- Diagnostics must exist

## Recommended stack

Use:
- Next.js
- TypeScript
- Tailwind
- Prisma
- PostgreSQL
- TanStack Table
- Recharts
- Docker / docker-compose

## Information architecture

Build a routed application shell with persistent navigation for:
- Overview
- Imports & Connections
- Executions
- Matched Lots
- Setups
- TTS Evidence
- Diagnostics

Do not build the UI as one giant scrolling page.

## Broker adapter strategy

### Active MVP adapter
`schwab_thinkorswim`

Must fully support:
- equities
- single-leg options
- vertical spreads
- diagonal spreads
- opening vs closing effects
- expirations
- assignments/exercises if present in export
- paper and real-money variants if formats differ

### Next adapter
`fidelity`

In MVP, include:
- adapter registration
- stub implementation
- ability to extend parser later without changing ledger logic

## Lean adapter contract

Implement this approximate contract:

```ts
interface BrokerAdapter {
  id: string;
  displayName: string;
  detect(file: UploadedFile): DetectionResult;
  parse(file: UploadedFile, options?: ParseOptions): ParseResult;
  coverage(): AdapterCoverage;
}
```

For MVP, keep the adapter simple:
- detect
- parse
- normalize
- report warnings/errors

Do not put spread accounting or lot matching inside the adapter.

## Canonical event requirement

The adapter must emit canonical leg-level execution events.
For verticals and diagonals, parse the legs correctly and let downstream logic infer the setup type.

Each canonical event should carry enough data for ledger correctness, including:
- import id
- broker
- account reference
- timestamp
- event type
- asset class
- symbol / instrument key
- side
- quantity
- price
- gross / net / fees
- opening vs closing effect if known
- raw description and row reference
- option metadata when applicable

## Ledger requirements

Implement a broker-neutral FIFO matcher that:
- creates matched lots from canonical executions
- computes realized P&L
- computes holding days
- supports short option open/close matching
- handles expiration where supported by source data

## Setup analytics requirements

Implement a downstream setup classifier / grouping layer that supports:
- long_call
- long_put
- covered_call
- cash_secured_put
- bull_vertical
- bear_vertical
- diagonal
- roll
- uncategorized

The Setups page must clearly show:
- performance summary
- win rate
- expectancy
- average hold time
- drill-through to matched lots and executions

Notes/journaling can be deferred.

## TTS evidence requirements

Build a TTS Evidence page, but label it carefully as evidence/readiness.

Include:
- trades per month
- active days per week
- average holding period
- median holding period
- annualized trade count
- time-in-market / holding-period distribution
- gross proceeds proxy

Do not present these as legal safe harbors.

## Diagnostics requirements

Build a Diagnostics page showing:
- parse coverage
- unsupported row count
- matching coverage
- setup inference gaps / uncategorized rate

## Data model expectations

Create database support for:
- imports
- accounts
- executions
- matched_lots
- setup_groups
- setup_group_lots
- daily_account_snapshots

## Development workflow requirements

1. Initialize repo with app, db, containers, linting, and README
2. Create/record issues from the backlog below
3. Execute issues in order
4. Keep commits/PRs small and coherent
5. Prefer testable, incremental implementation
6. Use seed/sample data or fixtures where needed
7. Make the app runnable locally with `docker compose up`

## Backlog to create and execute

1. Scaffold repo, app shell, containers, and developer workflow
2. Define canonical schema and persistence layer
3. Build adapter registry and lean broker adapter contract
4. Implement thinkorswim adapter MVP parser
5. Build Imports & Connections workflow
6. Implement FIFO ledger and matched-lot engine
7. Build Executions and Matched Lots pages
8. Build setup inference and Setups (T3) analytics page
9. Build Overview, TTS Evidence, Diagnostics, and deployment readiness

## Definition of done

The MVP is done when:
- thinkorswim import works end-to-end
- Fidelity is represented as a stubbed next adapter
- executions persist
- matched lots are computed with FIFO
- setups show performance summary, win rate, expectancy
- Overview, Imports, Executions, Matched Lots, Setups, TTS Evidence, and Diagnostics all exist as real routed screens
- the application runs in containers locally
- the repo is ready for Fly.io deployment
