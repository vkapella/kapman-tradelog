# KapMan Codex Master Prompt v5

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

Use these pinned package families for MVP stability:
- Next.js 14.2.x
- TypeScript 5.4.x
- Prisma / @prisma/client 5.14.x
- PostgreSQL
- Tailwind CSS 3.4.x
- Zod 3.23.x
- TanStack Table 8.17.x
- Recharts 2.12.x
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
Use the dashboard mock HTML at `/design/kapman_dashboard_mock_v5.html` as the visual target.
Match the color scheme, card layout, and table structure as closely as practical in MVP.

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

## thinkorswim CSV format contract

The thinkorswim "Account Statement" export produces a multi-section CSV.
The relevant section header is: `Account Trade History`.

Expected columns for the trade-history section (exact header names):
- Exec Time
- Spread
- Side
- Qty
- Pos Effect
- Symbol
- Exp
- Strike
- Type
- Price
- Net Price
- Order Type

Key parsing rules:
- rows before any section header are account metadata and must be skipped
- `Spread` values may include: `STOCK`, `SINGLE`, `VERTICAL`, `DIAGONAL`
- `Pos Effect` values may include: `TO OPEN`, `TO CLOSE`, `EXPIRED`, `ASSIGNED`, `EXERCISED`
- symbol for options may appear as an encoded instrument key such as `AAPL 240119C150`; preserve raw symbol and derive normalized option metadata
- `Qty` is negative for sells/short and positive for buys/long
- fees may appear in a separate `Fees & Commissions` section and should be joined by Order ID when available
- paper account exports may have the same trade-history format with different account metadata prefixes
- emit one canonical execution per row
- do not merge vertical or diagonal legs inside the adapter

## Canonical event requirement

The adapter must emit canonical leg-level execution events.
For verticals and diagonals, parse the legs correctly and let downstream logic infer the setup type.

Each canonical event must carry enough data for ledger correctness, including:
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

## API route contract

Implement these routes before building the data-backed UI.
All route request/response types must be shared between frontend and backend via `/types/api.ts`.

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

Response contract:
- success responses: `{ data, meta: { total, page, pageSize } }`
- error responses: `{ error: { code, message, details[] } }`

## Ledger requirements

Implement a broker-neutral FIFO matcher that:
- creates matched lots from canonical executions
- computes realized P&L
- computes holding days
- supports short option open/close matching
- handles expiration where supported by source data
- treats wash sale handling as a warning/flag only in MVP

## FIFO edge cases that must be implemented and tested

| Scenario | Rule |
|---|---|
| Partial close | Create one matched lot for the closed portion and leave remainder open |
| Roll (close + reopen same symbol same day) | Match the close to the prior open; the new open starts a fresh lot |
| Short option close | A closing BUY matches to the prior selling OPEN |
| Expiration | Close lot at $0 on expiration date; surface resulting P&L from the opening premium/cost basis |
| Assignment/exercise | Treat as forced close at strike price when strike/equity settlement data is present in export |
| Multiple opens, one close | FIFO match to the oldest open first |
| Wash sale | Flag only; do not adjust P&L in MVP |

Every row in this table must have at least one unit test.

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

## Setup grouping algorithm

A setup group is a collection of matched lots sharing:
- the same underlying symbol
- the same inferred strategy tag
- entry dates within a configurable window with default `5` calendar days

Tag inference rules, evaluated in order:
1. if all lots have `asset_class=STOCK`, infer `stock`, unless paired short calls cause `covered_call`
2. if a single option lot has side `BUY` and type `CALL`, infer `long_call`
3. if a single option lot has side `BUY` and type `PUT`, infer `long_put`
4. if a single option lot has side `SELL` and type `PUT` and appears cash-secured, infer `cash_secured_put`
5. if a single option lot has side `SELL` and type `CALL` and is paired with stock, infer `covered_call`
6. if two option lots share underlying and expiry but have different strikes, infer `bull_vertical` or `bear_vertical` based on net direction
7. if two option lots share underlying but have different expirations, infer `diagonal`
8. if a close event matches an open with the same symbol and a new open exists within 5 days, infer `roll`
9. otherwise infer `uncategorized`

Diagnostics must track tag inference failures via `uncategorized_count`.

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
- adapter warnings surfaced to the user

## Data model expectations

Create database support for:
- imports
- accounts
- executions
- matched_lots
- setup_groups
- setup_group_lots
- daily_account_snapshots

## daily_account_snapshots expectation

`daily_account_snapshots` may be sparse in MVP, but the schema must be purposeful.
Use it for future equity-curve and account-balance snapshots.
If it is not yet populated by imports, note that clearly in the README and Diagnostics UI rather than leaving it ambiguous.

## Fixture and seed requirements

Create a fixture at `/fixtures/sample_tos_export.csv` representing a minimal but realistic thinkorswim export containing:
- 2 stock round trips
- 2 single-leg option round trips: 1 long call and 1 short put
- 1 vertical spread with both legs visible
- 1 expiration event

This fixture must:
- be used in parser tests
- seed the dev database on `docker compose up`
- make the app immediately usable without private account files

## Development workflow requirements

1. Initialize repo with app, db, containers, linting, and README
2. Create/record issues from the backlog below
3. Execute issues in order
4. Keep commits/PRs small and coherent
5. Prefer testable, incremental implementation
6. Use fixture/seed data so the app is runnable without private files
7. Make the app runnable locally with `docker compose up`

## Execution rules for Codex

- Do not ask clarifying questions. Make the most conservative reasonable assumption and document it in a comment or README note.
- Never defer a feature with a TODO comment unless it is explicitly listed in `Non-goals for MVP`.
- Every API route must have a corresponding shared type definition in `/types/api.ts`.
- All database queries go through Prisma. No raw SQL in MVP.
- Every page must handle three states: loading, empty, and populated.
- Every empty state must include a call to action.
- Use the dashboard mock HTML at `/design/kapman_dashboard_mock_v5.html` as the visual target.
- Prefer deterministic fixtures and unit tests over ad hoc manual testing.
- If an assumption is required because source data is incomplete, surface it in Diagnostics or README.

## Backlog to create and execute

1. Scaffold repo, app shell, containers, fixtures, and developer workflow
2. Define canonical schema, persistence layer, API contracts, and shared types
3. Build adapter registry and lean broker adapter contract
4. Implement thinkorswim adapter MVP parser
5. Build Imports & Connections workflow
6. Implement FIFO ledger and matched-lot engine
7. Build Executions and Matched Lots pages
8. Build setup inference and Setups (T3) analytics page
9a. Build Overview, TTS Evidence, and Diagnostics pages
9b. Add Fly.io deployment configuration and smoke test readiness

## Definition of runnable

The app is runnable when:
- `docker compose up` starts the app and database successfully
- the app is available at `http://localhost:3000`
- fixture data is already seeded
- all seven navigation pages render without console errors
- a thinkorswim CSV upload produces canonical executions in T1
- matched lots appear in T2
- setups appear in T3 with win rate and expectancy populated

## Definition of done

The MVP is done when:
- thinkorswim import works end-to-end
- Fidelity is represented as a stubbed next adapter
- executions persist
- matched lots are computed with FIFO
- setup groups are computed and show performance summary, win rate, expectancy, and average hold time
- Overview, Imports, Executions, Matched Lots, Setups, TTS Evidence, and Diagnostics all exist as real routed screens
- each page handles loading, empty, and populated states
- the application runs in containers locally with seeded data
- the repo is ready for Fly.io deployment with a passing `/api/health` endpoint
