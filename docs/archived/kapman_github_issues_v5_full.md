# KapMan GitHub Issues v5

## Issue 1 — Scaffold repo, app shell, containers, fixtures, and developer workflow
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
- fixture file at `/fixtures/sample_tos_export.csv`
- `.env.example`
- global error boundary
- reusable loading skeleton component
- dashboard mock file committed at `/design/kapman_dashboard_mock_v5.html`

Acceptance criteria:
- `docker compose up` starts app + db
- fixture data seeds automatically on startup
- navigation shell renders with all 7 routes active and no 404s
- each page renders a `<PageName>Page` component with a placeholder heading
- the mock HTML file is committed and referenced in README as the UI target
- global error boundary is in place
- loading skeleton component exists and is used on all data-fetching pages
- `.env.example` documents all required variables
- lint and typecheck scripts exist

## Issue 2 — Define canonical schema, persistence layer, API contracts, and shared types
Create the persistent data model for imports, accounts, executions, matched lots, setup groups, and snapshots.

Core tables:
- imports
- accounts
- executions
- matched_lots
- setup_groups
- setup_group_lots
- daily_account_snapshots

Also deliver:
- `/types/api.ts` shared route contracts
- baseline paginated response envelope
- `/api/health` contract

Acceptance criteria:
- migrations run cleanly
- schema supports T1, T2, T3, import lineage, and raw row preservation
- `daily_account_snapshots` purpose is documented in README or schema comments
- all planned API routes have shared request/response types
- Prisma is the only DB access path

## Issue 3 — Build adapter registry and lean broker adapter contract
Create the ingestion foundation for broker-specific parsing.

Adapters included:
- `schwab_thinkorswim` active
- `fidelity` stub

Acceptance criteria:
- uploaded file can be routed through detect → adapter selection
- registry can list available adapters in the UI/API
- Fidelity exists as stub without parser logic
- adapter warnings and coverage data have a typed shape

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

Design rules:
- emit leg-level canonical execution events
- do not implement spread accounting inside the adapter
- parse against the explicit thinkorswim CSV contract below, not guessed columns

thinkorswim CSV contract:
- section header: `Account Trade History`
- columns: `Exec Time`, `Spread`, `Side`, `Qty`, `Pos Effect`, `Symbol`, `Exp`, `Strike`, `Type`, `Price`, `Net Price`, `Order Type`
- rows before section headers are metadata and must be skipped
- `Qty` negative means sell/short; positive means buy/long
- `Fees & Commissions` may need joining by Order ID when available
- emit one canonical execution per row
- never merge spread legs inside the adapter

Acceptance criteria:
- `/fixtures/sample_tos_export.csv` parses successfully
- parser tests use the fixture file
- known thinkorswim sample files parse successfully
- parsed rows are persisted to T1 executions
- unsupported rows are surfaced, not silently dropped
- parse warnings include row references and reasons

## Issue 5 — Build Imports & Connections workflow
Ship the detailed MVP ingestion page and supporting endpoints.

Acceptance criteria:
- Imports page is the most detailed workflow surface in MVP
- user can upload, parse, validate, preview, and commit a thinkorswim file
- file upload shows progress indicator
- after upload, the user sees detection result: broker detected, format version if known, and row-count estimate
- the user sees a parse preview with the first 10 normalized rows before commit
- commit step shows rows parsed, rows persisted, and rows skipped with reasons
- import history table shows filename, broker, import date, row counts, status, and link to executions filtered by import
- failed imports are recoverable and do not orphan persisted data
- import history is queryable and visible

## Issue 6 — Implement FIFO ledger and matched-lot engine
Convert canonical executions into matched-lot accounting records.

Required edge cases:
- partial close
- roll: close + reopen same symbol same day
- short option close via buy-to-close
- expiration at zero
- assignment/exercise as forced close when data exists
- multiple opens with one close matched FIFO
- wash sale flagged only

Acceptance criteria:
- T2 matched lots are generated from T1 executions
- holding days and realized P&L are computed
- close events are explainably linked to open events
- matcher has unit tests for each required edge case
- open remainder quantities are preserved correctly after partial closes
- wash sale warnings are surfaced without altering MVP P&L

## Issue 7 — Build Executions and Matched Lots pages
Provide usable audit and accounting views.

Acceptance criteria:
- user can inspect T1 and T2 data from imported files and seeded fixture data
- filters work for symbol, account, date, and import where relevant
- Executions table shows normalized fields needed for auditability
- Matched Lots table shows realized P&L, holding period, outcome, and links back to source executions
- loading, empty, and populated states are implemented on both pages
- default sort orders are meaningful and stable

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

Setup grouping algorithm:
- same underlying symbol
- same inferred strategy tag
- entry dates within a configurable window, default 5 calendar days

Inference rules, in order:
1. all stock unless paired short calls imply `covered_call`
2. single bought call → `long_call`
3. single bought put → `long_put`
4. single sold put, cash-secured → `cash_secured_put`
5. single sold call paired with stock → `covered_call`
6. two option lots, same expiry, different strikes → `bull_vertical` or `bear_vertical`
7. two option lots, different expirations → `diagonal`
8. close plus new open within 5 days → `roll`
9. fallback → `uncategorized`

Acceptance criteria:
- T3 setup groups are generated from T2 matched lots
- Setups page visibly includes performance summary, win rate, expectancy, and average hold time
- setup detail drill-through shows linked matched lots and executions
- `override_tag` field is supported in schema even if edit UI is minimal
- inference misses are counted in Diagnostics as `uncategorized_count`

## Issue 9a — Build Overview, TTS Evidence, and Diagnostics pages
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
- uncategorized count
- surfaced assumptions and warnings

Acceptance criteria:
- Overview page shows headline P&L/activity counts and import quality summary
- TTS Evidence page shows all required metrics with clear evidence/readiness labeling
- Diagnostics page shows parse, match, and setup coverage stats
- all three pages support loading, empty, and populated states

## Issue 9b — Add Fly.io deployment configuration and smoke-test readiness
Acceptance criteria:
- `fly.toml` includes app name placeholder, region `iad`, and HTTP health-check on `/api/health`
- `/api/health` returns `{ status: "ok", db: "connected" }` when healthy
- deployment expects `DATABASE_URL` from Fly secrets or managed Postgres
- README includes `fly auth login` → `fly launch` → `fly deploy` sequence
- local containerized deployment still works after deployment config is added
