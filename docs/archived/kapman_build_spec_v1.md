# KapMan Ledger + TTS Dashboard Build Spec v1

## Product intent
Build a containerized web application that ingests Schwab paper-trading account statements, normalizes executions, produces a FIFO ledger of matched lots, infers KapMan strategy setups, and surfaces analytics focused on both trading performance and Trader Tax Status (TTS) evidence.

The app is not a tax opinion engine. It is an evidence, recordkeeping, and analysis system.

## What the current source data supports
Using the two uploaded Schwab paper-trading CSV statements currently in scope, the prototype dataset contains:
- 461 parsed executions
- 114 trade days
- 4.04 executions per trade day
- 17.01 mean holding days on currently derived closes
- 13.0 median holding days
- 87.4% of currently derived closes within 31 days
- 8 same-day closes
- 18 of 32 calendar weeks with at least 4 trade days
- combined ending balance of $170,333.20

These figures are useful for product direction, but production reporting should be recomputed from the canonical matched-lot ledger rather than from the prototype close-side derivation.

## Design decisions locked in
1. Accounting method of record: FIFO only
2. Scenario compare: optional read-only HIFO/LIFO sandbox, never book of record
3. Canonical holding-period grain: matched lot
4. Short option sells: opening transactions
5. Expired worthless options: synthetic close at $0 on expiration date
6. Assignment/exercise: explicit lifecycle events that bridge option lots into stock lots
7. Primary drill-down object: matched round-trip lot
8. Strategy classification: infer automatically, allow manual override

## Canonical data model

### T1 `executions`
One row per broker fill.

Core fields:
- `id` UUID
- `import_id` UUID
- `broker_execution_id` text nullable
- `account_id` UUID
- `broker_account_label` text
- `occurred_at` timestamptz
- `trade_date` date
- `asset_class` enum: `equity`, `option`, `cash`, `adjustment`
- `raw_action` text
- `economic_side` enum: `buy`, `sell`, `short_sell`, `buy_to_cover`, `open_short_option`, `close_short_option`, `open_long_option`, `close_long_option`, `assignment`, `exercise`, `expiration`, `journal`
- `symbol` text
- `underlying_symbol` text nullable
- `option_right` enum nullable: `call`, `put`
- `expiry_date` date nullable
- `strike` numeric(12,4) nullable
- `multiplier` integer default 1
- `quantity` numeric(18,6)
- `price` numeric(18,6)
- `gross_amount` numeric(18,2)
- `commission` numeric(18,2)
- `fees` numeric(18,2)
- `net_amount` numeric(18,2)
- `broker_cash_balance` numeric(18,2) nullable
- `position_key` text
- `raw_description` text
- `raw_row_json` jsonb
- `parse_status` enum: `parsed`, `flagged`, `unsupported`
- `parse_notes` text nullable
- `dedupe_hash` text unique
- `created_at` timestamptz

Notes:
- `position_key` should be stable enough for FIFO matching: account + underlying + asset class + right + expiry + strike + side family.
- Multi-leg broker rows should be preserved raw even if also decomposed into child legs later.

### T2 `matched_lots`
One row per FIFO-matched open-close pair. This is the tax-lot ledger.

Core fields:
- `id` UUID
- `account_id` UUID
- `open_execution_id` UUID
- `close_execution_id` UUID nullable
- `open_occurred_at` timestamptz
- `close_occurred_at` timestamptz nullable
- `position_key` text
- `symbol` text
- `underlying_symbol` text nullable
- `asset_class` enum
- `option_right` enum nullable
- `expiry_date` date nullable
- `strike` numeric(12,4) nullable
- `open_side` enum: `long`, `short`
- `quantity_opened` numeric(18,6)
- `quantity_closed` numeric(18,6)
- `open_price` numeric(18,6)
- `close_price` numeric(18,6) nullable
- `open_net_cash` numeric(18,2)
- `close_net_cash` numeric(18,2) nullable
- `realized_pnl` numeric(18,2) nullable
- `holding_minutes` integer nullable
- `holding_days_decimal` numeric(12,4) nullable
- `holding_days_calendar` integer nullable
- `closed_reason` enum nullable: `sell`, `buy_to_close`, `assignment`, `exercise`, `expiry_worthless`, `forced_close`, `manual_adjustment`
- `status` enum: `open`, `closed`, `partially_closed`
- `strategy_tag_inferred` text nullable
- `strategy_tag_override` text nullable
- `strategy_tag_effective` text nullable
- `setup_id` UUID nullable
- `created_at` timestamptz
- `updated_at` timestamptz

### T3 `setups`
Named groups of matched lots for strategy analytics.

Core fields:
- `id` UUID
- `account_id` UUID nullable
- `setup_name` text
- `underlying_symbol` text
- `strategy_tag_primary` enum
- `opened_at` timestamptz
- `closed_at` timestamptz nullable
- `status` enum: `open`, `closed`, `mixed`
- `tag_source` enum: `inferred`, `manual`, `hybrid`
- `notes` text nullable
- `created_at` timestamptz
- `updated_at` timestamptz

### Supporting tables
`accounts`, `imports`, `daily_equity_snapshots`, `calendar_market_days`, `scenario_runs`, `parser_flags`, `audit_events`.

## Ledger rules

### FIFO of record
- Matching is always FIFO at the matched-lot level.
- Matching partition key is account + instrument identity.
- Partial fills and partial closes must split lots cleanly.

### Short options
- Sell-to-open creates a short lot with premium received.
- Buy-to-close reduces or closes that short lot FIFO.
- Expire worthless creates synthetic close at price 0 on expiration date.
- Assignment/exercise must create both a close event on the option lot and a related stock opening or closing event with basis adjustment.

### Unsupported / ambiguous rows
- Preserve raw row.
- Flag in `parser_flags`.
- Exclude from canonical analytics until resolved.
- Expose a reconciliation queue in admin/dev tooling.

## Strategy inference engine v1
Deterministic inference first, manual override second.

Minimum supported inferred tags:
- `long_call`
- `long_put`
- `cash_secured_put`
- `covered_call`
- `bull_call_vertical`
- `bear_call_vertical`
- `bull_put_vertical`
- `bear_put_vertical`
- `stock_long`
- `roll`
- `unknown`

Inference precedence:
1. explicit paired spread structure
2. covered call / CSP tests against same-account holdings and cash posture proxy
3. single-leg long/short option logic
4. fallback `unknown`

## Dashboard information architecture

### 1. Overview
- Combined equity curve
- Account equity comparison
- Realized P&L MTD/QTD/YTD/custom
- Open positions count
- Strategy mix donut
- Active warnings: unsupported rows, unmatched assignments, stale imports

### 2. Matched Lots
Primary workbench.
- searchable table of T2 rows
- filters: account, symbol, setup, strategy, holding bucket, close reason, date range
- detail drawer: open fill, close fill, cash impact, P&L, holding period, linked executions

### 3. Executions
Raw audit log.
- import lineage
- broker balances
- parse status
- raw row view

### 4. Setups
- grouped strategy-level performance
- win rate
- average hold
- realized P&L
- underlying exposure
- manual override/tag maintenance

### 5. TTS Evidence Pack
Label this as evidence, not determination.
- monthly execution count
- weekly active trading days
- annualized execution pace
- average and median holding period
- percent of matched lots closed within 31 days
- time-in-market histogram
- gross proceeds
- exportable year summary PDF/CSV later

### 6. Imports & Reconciliation
- upload statements
- import history
- duplicate counts
- unsupported row review
- rerun ledger build

## Core metrics

### Trading performance
- realized P&L
- win rate by matched lot
- expectancy
- average winner / average loser
- max holding period
- symbol concentration
- account-level running balance

### TTS evidence metrics
Software should calculate these, but not declare qualification.
- executions per month
- total annual executions
- trade days per week
- matched-lot mean and median holding period
- percent closed within 31 days
- gross proceeds
- days with activity / total market days

## Caution on TTS thresholds
Use the app language carefully:
- IRS Topic No. 429 describes trader status as a facts-and-circumstances test focused on seeking to profit from daily market movements and trading with substantial, regular, frequent, and continuous activity; it does not provide a numeric safe harbor. citeturn224607search1
- Schwab likewise states there is no bright-line test for trader tax status. citeturn224607search1
- Metrics like 60 trades per month, 4 trading days per week, and 720 annual trades should therefore be labeled as practitioner heuristics or readiness benchmarks, not IRS rules. GreenTraderTax presents those figures as recommendations. citeturn224607search2turn224607search5

## Recommended stack
- Frontend: Next.js 15 + TypeScript + Tailwind + shadcn/ui + TanStack Table + Recharts
- Backend: FastAPI or NestJS; preference FastAPI for parser/ledger ergonomics
- Database: PostgreSQL 16
- Jobs: lightweight internal job runner for reprocessing imports
- ORM: SQLAlchemy or Prisma; preference SQLAlchemy if FastAPI
- Validation: Pydantic
- Auth: simple local auth for v1, pluggable later
- Infra: Docker Compose locally, Fly.io deploy target
- Testing: Pytest + Playwright

## API shape
- `POST /imports`
- `GET /imports`
- `POST /ledger/rebuild`
- `GET /executions`
- `GET /matched-lots`
- `GET /matched-lots/:id`
- `GET /setups`
- `PATCH /matched-lots/:id/tag`
- `GET /analytics/overview`
- `GET /analytics/tts`
- `GET /analytics/equity`

## Non-negotiable acceptance criteria
- Idempotent imports
- Deterministic FIFO matching
- Partial close correctness
- Separate persistence of executions and matched lots
- Explicit lifecycle handling for expiration, assignment, and exercise
- Every dashboard number traceable back to source executions
- Unsupported broker rows surfaced, not silently dropped
- One-command local startup via Docker Compose
- Fly.io deployment path committed in repo
