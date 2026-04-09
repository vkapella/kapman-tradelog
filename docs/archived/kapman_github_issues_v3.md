# KapMan Ledger — Suggested GitHub Issue Set v3

## 1. Bootstrap monorepo, local infra, and Fly.io deployment path
Set up the repo with `apps/web`, `apps/api`, Dockerfiles, `docker-compose.yml`, `.env.example`, migration tooling, and a Fly.io deployment configuration. Add a README with architecture, startup, deployment instructions, and explicit notes on the broker-adapter architecture.

**Acceptance criteria**
- `docker compose up --build` starts web, api, and postgres
- healthcheck endpoints exist
- README documents local, container, and Fly.io paths
- repo structure supports separate web/api services cleanly

## 2. Create broker adapter registry and import orchestration boundary
Implement a broker-adapter registry and generic import pipeline that routes uploaded files through adapters instead of broker-specific route logic.

**Acceptance criteria**
- adapter interface is defined and documented
- `schwab_thinkorswim` adapter is registered as MVP
- `fidelity` adapter is registered as placeholder/next adapter
- generic import service can select adapter by explicit key or detection
- downstream services consume normalized records only

## 3. Design and migrate canonical Postgres schema
Create migrations for accounts, imports, executions, matched_lots, setups, daily_equity_snapshots, parser_flags, audit_events, broker_connections, and scenario_runs.

**Acceptance criteria**
- schema migrates cleanly from empty database
- indexes support dedupe and analytics filters
- foreign keys and enum strategy are documented
- imports table captures broker family and adapter key

## 4. Implement Schwab thinkorswim CSV import pipeline with idempotent dedupe
Build the working MVP adapter, upload endpoint, import tracking, CSV parsing, dedupe hash generation, raw-row persistence, and parser flagging for unsupported rows.

**Acceptance criteria**
- importing same file twice creates no duplicate executions
- imports record total rows, parsed rows, duplicates, and flagged rows
- unsupported rows are visible in reconciliation UI/API
- parser emits normalized broker-agnostic execution records

## 5. Build FIFO ledger engine for executions -> matched lots
Create deterministic ledger rebuild logic that converts executions into matched lots with partial closes, open lots, realized P&L, and holding-period calculations.

**Acceptance criteria**
- FIFO matching is deterministic and repeatable
- partial closes split lots correctly
- matched-lot detail traces back to source executions
- ledger logic is broker-agnostic

## 6. Add short-option lifecycle, expiry, assignment, and exercise handling
Extend the ledger for short option opening sells, buy-to-close, worthless expiry synthetic closes, and stock basis transfer on assignment/exercise.

**Acceptance criteria**
- short option premium flows correctly through realized P&L
- expired worthless options close at zero on expiration date
- assignment/exercise creates explicit related events
- these flows work without broker-specific branching in the ledger engine

## 7. Implement strategy inference and manual override system
Infer strategy tags from matched-lot structure and related holdings; persist override field and effective tag resolution.

**Acceptance criteria**
- supported tags include long calls/puts, CSP, covered call, verticals, roll, stock long, unknown
- override tag supersedes inferred tag in analytics and UI
- inference decisions are explainable in code/comments

## 8. Build analytics endpoints and daily equity snapshot generation
Create overview analytics, TTS evidence metrics, account equity curves, gross proceeds, holding-period distributions, and monthly trade counts.

**Acceptance criteria**
- analytics endpoints power live dashboard views
- daily snapshots forward-fill balance history appropriately
- TTS screen uses evidence/readiness language, not qualification language

## 9. Ship Imports & Connections UI plus dashboard workbench screens
Build a workstation-style frontend with a simplified TradesViz-inspired ingestion menu and the main analytics screens.

**Acceptance criteria**
- Imports & Connections screen has Upload File, Manual Trade Entry, Add Auto-sync Connection, View Auto-sync Connections, and Manage/Export Data actions
- broker selector changes export instructions panel
- upload flow works end to end for thinkorswim
- overview, matched lots, executions, setups, TTS evidence, and reconciliation screens render against live API data

## 10. Add Fidelity adapter stub, fixtures, tests, and CI baseline
Register the Fidelity adapter as the next supported broker, wire its UI help/instruction content, add placeholder fixtures/tests, and stand up CI with Pytest and Playwright.

**Acceptance criteria**
- Fidelity appears in broker selector and adapter registry
- Fidelity adapter returns help text and declared file support even if parser is not yet complete
- parser, dedupe, FIFO, short-option lifecycle, expiry, and assignment/exercise are tested
- basic UI upload/filter/navigation tests pass
- CI runs on pull requests
