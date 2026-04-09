# KapMan Ledger + TTS Dashboard Build Spec v3

## Product intent
Build a containerized web application that ingests **Schwab thinkorswim, Fidelity, and in the future possibly other broker account statements**; normalizes executions into a broker-agnostic ledger; produces a FIFO record-of-book matched-lot engine; infers KapMan strategy setups; and surfaces analytics for trading performance and Trader Tax Status (TTS) evidence.

The app is not a tax opinion engine. It is an evidence, recordkeeping, and analysis system.

## Platform direction
The ingestion layer must be **adapter-based from day one**.

- **MVP broker/parser**: Schwab thinkorswim
- **Next broker/parser**: Fidelity
- **Future state**: additional brokers added by implementing the same adapter contract
- **Non-goal for MVP**: embedding broker-specific parsing or UI logic directly into routes, analytics, or ledger code

The architectural rule is simple: **all broker-specific parsing stops at the adapter boundary. Everything after normalization is broker-agnostic.**

## Locked design decisions
1. Accounting method of record: FIFO only
2. Scenario compare: optional read-only HIFO/LIFO sandbox, never book of record
3. Canonical holding-period grain: matched lot
4. Short option sells: opening transactions
5. Expired worthless options: synthetic close at $0 on expiration date
6. Assignment/exercise: explicit lifecycle events that bridge option lots into stock lots
7. Primary drill-down object: matched round-trip lot
8. Strategy classification: infer automatically, allow manual override
9. TTS outputs are labeled as evidence/readiness, not qualification
10. Broker ingestion is plugin-oriented from day one

## Supported-broker roadmap

### v1 supported
- Schwab thinkorswim statement import
- Manual account creation
- Manual broker/account metadata management
- Import history and reconciliation queue

### next after v1
- Fidelity statement import using the exact same import workflow and normalized ledger target

### designed for later
- Additional broker statement adapters
- Direct connection sync adapters
- Expanded manual-entry tools for corrections and missing rows

## Ingestion UX and information architecture
The application needs a dedicated **Imports & Connections** workspace inspired by tools like TradesViz, but materially simpler.

### Top-level ingestion actions
- **Upload File** — primary production path for MVP
- **Manual Trade Entry** — scaffolded for later/manual corrections
- **Add Auto-sync Connection** — scaffold only in MVP
- **View Auto-sync Connections** — scaffold only in MVP
- **Manage/Export Data** — exports, deletes, backups, data controls

### Statement upload flow
1. Choose trading account or create one
2. Choose broker/platform
3. Choose reporting timezone and reporting currency
4. Optionally enter tags and import-start date
5. Upload file
6. Review parsed import summary, duplicates, warnings, and flagged rows
7. Trigger ledger rebuild or auto-run it after successful import

### Broker instruction panel
The selected adapter must supply broker-specific export instructions to the UI. The UI shell stays the same; the content changes by broker.

Examples:
- thinkorswim export instructions shown when `broker_family=schwab_thinkorswim`
- Fidelity export instructions shown when `broker_family=fidelity`
- unsupported future brokers can show a placeholder instruction block until their adapter is implemented

## Adapter contract
Each broker adapter must implement a consistent contract. Suggested interface:

- `detect(file_bytes, file_name) -> confidence_score`
- `parse(file_bytes, import_context) -> ParsedImportResult`
- `normalize(raw_row, import_context) -> NormalizedExecutionCandidate | ParserFlag`
- `list_supported_file_types() -> list[str]`
- `platform_export_help() -> BrokerExportHelp`
- `sample_mapping() -> AdapterMetadata`

### Contract requirements
- adapters own file detection and row parsing
- adapters emit broker-agnostic normalized execution candidates
- adapters preserve raw row payloads for audit and debugging
- adapters may flag unsupported rows but may not silently discard them
- ledger engine, analytics engine, and setup inference must not know which broker produced the row

## Import pipeline stages
1. File uploaded and checksum computed
2. Broker adapter chosen explicitly or by detection
3. Raw rows extracted
4. Raw rows normalized into execution candidates
5. Dedupe hash applied
6. Supported rows persisted to `executions`
7. Unsupported or ambiguous rows persisted to `parser_flags`
8. Import summary persisted to `imports`
9. Ledger rebuild generates `matched_lots`, `setups`, and `daily_equity_snapshots`
10. Analytics materializations/cache refreshed as needed

## Canonical data model

### `accounts`
Tracks logical trading accounts independent of any single broker upload.

Core fields:
- `id` UUID
- `owner_label` text
- `display_name` text
- `broker_family_default` text nullable
- `account_kind` enum: `paper`, `live`, `ira`, `margin`, `cash`, `other`
- `base_currency` text
- `reporting_timezone` text
- `is_active` boolean
- `created_at` timestamptz
- `updated_at` timestamptz

### `imports`
One row per uploaded import job.

Core fields:
- `id` UUID
- `account_id` UUID
- `broker_family` enum: `schwab_thinkorswim`, `fidelity`, `other`
- `adapter_key` text
- `source_type` enum: `statement_upload`, `manual_entry`, `connection_sync`
- `file_name` text
- `file_sha256` text
- `file_type` text
- `started_at` timestamptz
- `completed_at` timestamptz nullable
- `status` enum: `queued`, `parsing`, `parsed`, `flagged`, `failed`
- `total_rows` integer
- `parsed_rows` integer
- `duplicate_rows` integer
- `flagged_rows` integer
- `notes` text nullable
- `metadata_json` jsonb

### T1 `executions`
One row per normalized broker fill.

Core fields:
- `id` UUID
- `import_id` UUID
- `broker_family` text
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

### T2 `matched_lots`
One row per FIFO-matched open-close pair.

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

### Supporting tables
- `daily_equity_snapshots`
- `parser_flags`
- `audit_events`
- `scenario_runs`
- `broker_adapters`
- `broker_connections`
- `calendar_market_days`

## Broker adapter implementation plan

### MVP: Schwab thinkorswim adapter
Must support:
- statement upload parsing
- equities and options
- quantity, price, fees, net amount, timestamp, balances when present
- normalized position keys
- parser flagging for unsupported complex rows
- adapter-owned export help text shown in UI

### next: Fidelity adapter
Must be implemented against the same contract.

Requirements:
- same upload flow
- same normalized target schema
- adapter-owned export instructions in UI
- broker-specific tests and fixtures
- no changes required to matched-lot or analytics services

### extensibility rules
- no broker-specific conditionals in analytics endpoints
- no broker-specific columns in matched-lot logic unless surfaced through normalization
- broker adapters own parsing
- ledger engine owns economic meaning after normalization

## Ledger rules

### FIFO of record
- matching is always FIFO at the matched-lot level
- matching partition key is account + normalized instrument identity
- partial fills and partial closes must split lots cleanly

### short options
- sell-to-open creates a short lot with premium received
- buy-to-close reduces or closes that short lot FIFO
- expire worthless creates synthetic close at price 0 on expiration date
- assignment/exercise must create both a close event on the option lot and a related stock opening or closing event with basis adjustment

### unsupported / ambiguous rows
- preserve raw row
- flag in `parser_flags`
- exclude from canonical analytics until resolved
- expose a reconciliation queue in admin/dev tooling

## Dashboard information architecture

### 1. Overview
- combined equity curve
- account equity comparison
- realized P&L MTD/QTD/YTD/custom
- open positions count
- strategy mix
- active warnings: unsupported rows, unmatched assignments, stale imports

### 2. Imports & Connections
Primary ingestion workbench.
- TradesViz-inspired simplified top action menu
- statement upload form
- broker export instruction panel
- import history
- duplicate counts
- flagged-row counts
- scaffolded connection-management surfaces

### 3. Matched Lots
Primary analytics drill-down.
- searchable T2 table
- filters: account, symbol, setup, strategy, holding bucket, close reason, date range
- detail drawer: open fill, close fill, cash impact, P&L, holding period, linked executions

### 4. Executions
Raw audit log.
- import lineage
- broker balances
- parse status
- raw row view

### 5. Setups
- grouped strategy-level performance
- win rate
- average hold
- realized P&L
- underlying exposure
- manual override/tag maintenance

### 6. TTS Evidence Pack
Label as evidence, not determination.
- monthly execution count
- weekly active trading days
- annualized execution pace
- average and median holding period
- percent of matched lots closed within 31 days
- time-in-market histogram
- gross proceeds
- exportable year summary PDF/CSV later

### 7. Reconciliation
- unsupported row review
- rerun ledger build
- parser flag triage
- future manual corrections

## Core metrics
- executions per trade day
- matched lots per trade day
- realized P&L by setup and symbol
- mean and median time in trade by matched lot
- percent of closes within 31 days
- active trading days per week
- monthly execution count
- annualized execution pace
- gross proceeds
- open-lot aging

## Copy and compliance posture
- never state that the user qualifies for Trader Tax Status
- present TTS-related outputs as evidence or readiness indicators
- describe TTS as a facts-and-circumstances determination

## Delivery expectation
The first production repo should be runnable locally via Docker, seeded with demo data, able to import thinkorswim statements, and structurally ready for Fidelity to be added without refactoring the core ledger architecture.
