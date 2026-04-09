# KapMan GitHub Issues v4

## Issue 1 — Scaffold repo, app shell, containers, and developer workflow
Create the base repo and local/dev deployment workflow.

Deliverables:
- Next.js + TypeScript app
- Tailwind styling
- PostgreSQL + Prisma
- Dockerfile
- docker-compose for local dev
- Fly.io config scaffold
- README with setup commands
- app shell with routed pages:
  - Overview
  - Imports & Connections
  - Executions
  - Matched Lots
  - Setups
  - TTS Evidence
  - Diagnostics

Acceptance criteria:
- `docker compose up` starts app + db
- empty routed pages render in app shell
- lint/typecheck scripts exist

## Issue 2 — Define canonical schema and persistence layer
Create the persistent data model for imports, accounts, executions, matched lots, setup groups, and snapshots.

Core tables:
- imports
- accounts
- executions
- matched_lots
- setup_groups
- setup_group_lots
- daily_account_snapshots

Acceptance criteria:
- migrations run cleanly
- schema supports T1, T2, T3 and import lineage
- raw row preservation is supported for execution records

## Issue 3 — Build adapter registry and lean broker adapter contract
Create the ingestion foundation for broker-specific parsing.

Adapters included:
- `schwab_thinkorswim` active
- `fidelity` stub

Acceptance criteria:
- uploaded file can be routed through detect → adapter selection
- registry can list available adapters in the UI/API
- Fidelity exists as stub without parser logic

## Issue 4 — Implement thinkorswim adapter MVP parser
Must support:
- equities
- single-leg options
- vertical spreads
- diagonal spreads
- opening vs closing effects
- expirations
- assignments/exercises if present
- paper and real-money variants if formats differ

Design rule:
- emit leg-level canonical execution events
- do not implement spread accounting inside the adapter

Acceptance criteria:
- known thinkorswim sample files parse successfully
- parsed rows are persisted to T1 executions
- unsupported rows are surfaced, not silently dropped

## Issue 5 — Build Imports & Connections workflow
Ship the detailed MVP ingestion page and supporting endpoints.

Acceptance criteria:
- Imports page is the most detailed workflow surface in MVP
- user can upload, parse, validate, and commit a thinkorswim file
- import history is queryable and visible

## Issue 6 — Implement FIFO ledger and matched-lot engine
Convert canonical executions into matched-lot accounting records.

Acceptance criteria:
- T2 matched lots are generated from T1 executions
- holding days and realized P&L are computed
- close events are explainably linked to open events
- matcher has tests for stock, long option, short option cases

## Issue 7 — Build Executions and Matched Lots pages
Provide usable audit and accounting views.

Acceptance criteria:
- user can inspect T1 and T2 data from imported files
- filters work for symbol/account/date
- matched-lot records show realized P&L and holding period

## Issue 8 — Build setup inference and Setups (T3) analytics page
Supported tags:
- long_call
- long_put
- covered_call
- cash_secured_put
- bull_vertical
- bear_vertical
- diagonal
- roll
- uncategorized

Acceptance criteria:
- T3 setup groups are generated from T2 matched lots
- Setups page visibly includes performance summary, win rate, and expectancy
- override_tag field is supported in schema even if edit UI is minimal

## Issue 9 — Build Overview, TTS Evidence, Diagnostics, and deployment readiness
TTS Evidence requirements:
- label as evidence/readiness, not legal determination
- trades per month
- active days per week
- average and median holding period
- annualized trade count
- time-in-market / holding-period distribution
- gross proceeds proxy

Diagnostics requirements:
- parse coverage
- unsupported row count
- matching coverage
- setup inference gaps

Acceptance criteria:
- all MVP pages are functional
- local containerized deployment works
- app is ready for initial Fly.io deployment
