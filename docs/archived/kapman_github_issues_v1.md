# KapMan Ledger — Suggested GitHub Issue Set

## 1. Bootstrap monorepo, local infra, and Fly.io deployment path
Set up the repo with `apps/web`, `apps/api`, Dockerfiles, `docker-compose.yml`, `.env.example`, migration tooling, and a basic Fly.io deployment configuration. Add a README with architecture, startup, and deployment instructions.

**Acceptance criteria**
- `docker compose up --build` starts web, api, and postgres
- healthcheck endpoints exist
- README documents local and Fly.io paths

## 2. Implement Schwab CSV import pipeline with idempotent dedupe
Build upload endpoint, import tracking, CSV parsing, dedupe hash generation, raw-row persistence, and parser flagging for unsupported rows.

**Acceptance criteria**
- importing same file twice creates no duplicate executions
- imports record total rows, parsed rows, duplicates, and flagged rows
- unsupported rows are visible in reconciliation UI/API

## 3. Design and migrate canonical Postgres schema
Create migrations for accounts, imports, executions, matched_lots, setups, daily_equity_snapshots, parser_flags, and audit_events.

**Acceptance criteria**
- schema migrates cleanly from empty database
- indexes support import dedupe and analytics filters
- foreign keys and enum strategy are documented

## 4. Build FIFO ledger engine for executions -> matched lots
Create deterministic ledger rebuild logic that converts executions into matched lots with partial closes, open lots, realized P&L, and holding-period calculations.

**Acceptance criteria**
- FIFO matching is deterministic and repeatable
- partial closes split lots correctly
- matched lot detail traces back to source executions

## 5. Add short-option lifecycle, expiry, assignment, and exercise handling
Extend the ledger for short option opening sells, buy-to-close, worthless expiry synthetic closes, and stock basis transfer on assignment/exercise.

**Acceptance criteria**
- short option premium flows correctly through realized P&L
- expired worthless options close at zero on expiration date
- assignment/exercise creates explicit related events

## 6. Implement strategy inference and manual override system
Infer strategy tags from matched-lot structure and related holdings; persist override field and effective tag resolution.

**Acceptance criteria**
- supported tags include long calls/puts, CSP, covered call, verticals, roll, stock long, unknown
- override tag supersedes inferred tag in analytics and UI
- inference decisions are explainable in code/comments

## 7. Build analytics endpoints and daily equity snapshot generation
Create overview analytics, TTS evidence metrics, account equity curves, gross proceeds, holding-period distributions, and monthly trade counts.

**Acceptance criteria**
- analytics endpoints power live dashboard views
- daily snapshots forward-fill balance history appropriately
- TTS screen uses evidence/readiness language, not qualification language

## 8. Ship dashboard UI for Overview, Matched Lots, Executions, Setups, and TTS Evidence
Build a usable workstation-style frontend with filters, tables, charts, detail drawers, and import/reconciliation surfaces.

**Acceptance criteria**
- user can drill from overview KPI to setup to matched lot to execution
- upload flow works end-to-end
- unsupported parser rows are visible and filterable

## 9. Seed realistic demo data and create test fixtures
Add non-sensitive sample statements or fixture data that exercise equities, long options, short options, partial closes, and at least one unsupported row.

**Acceptance criteria**
- fresh local environment shows populated UI after seed
- fixtures cover core ledger paths and parser edge cases

## 10. Add automated test suite and CI baseline
Create Pytest and Playwright coverage for core engine, analytics smoke tests, and critical UI flows. Add CI workflow to run tests and linting.

**Acceptance criteria**
- parser, dedupe, FIFO, short-option lifecycle, expiry, and assignment/exercise are tested
- basic UI upload/filter/navigation tests pass
- CI runs on pull requests
