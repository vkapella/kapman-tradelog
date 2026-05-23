# KapMan Data Model

This document describes the as-built Prisma data model in `prisma/schema.prisma` and the API-facing shapes in `types/api.ts`.

## Model Map

| Model | Table | Purpose |
|---|---|---|
| `Account` | `accounts` | Broker account identity, labels, broker metadata, paper-money flag, and starting capital. |
| `Import` | `imports` | Uploaded broker statement, source text, parse/commit status, row counts, and warnings. |
| `Execution` | `executions` | Canonical T1 execution/event rows produced by imports and ledger-generated expiration closes. |
| `ImportExecution` | `import_executions` | Join table that preserves import-to-execution ownership even when duplicate handling reuses rows. |
| `MatchedLot` | `matched_lots` | T2 FIFO open-to-close matched lots with realized P&L, hold days, and outcome. |
| `SetupGroup` | `setup_groups` | T3 inferred setup groups with tag, underlying, realized P&L, win rate, expectancy, and average hold. |
| `SetupGroupLot` | `setup_group_lots` | Join table linking setup groups to matched lots. |
| `DailyAccountSnapshot` | `daily_account_snapshots` | Imported daily broker balance, total cash, and broker NLV snapshots. |
| `PositionSnapshot` | `position_snapshots` | Quote-backed open-position snapshot and reconciliation totals for an account scope. |
| `CashEvent` | `cash_events` | Cash ledger rows parsed from broker statements, including balances, funds, liquidations, dividends, transfers, and money-market events. |
| `ManualAdjustment` | `manual_adjustments` | Auditable overlays for splits, position overrides, add/remove position, and execution qty/price corrections. |

## Core Relationships

`Account` is the root of most domain data. One account owns many imports, executions, daily snapshots, cash events, manual adjustments, setup groups, and matched lots.

`Import` owns committed executions directly through `Execution.importId` and also through `ImportExecution` links. The join table is used so import deletion and duplicate handling can reason about execution ownership without relying only on a direct foreign key.

`Execution` participates in matched lots through two named relations:

- `openMatchedLots` via `MatchedLot.openExecutionId`
- `closeMatchedLots` via `MatchedLot.closeExecutionId`

`MatchedLot` is linked to zero or more setup groups through `SetupGroupLot`. A setup group is deleted and rebuilt during account-level setup rebuilds.

`DailyAccountSnapshot`, `CashEvent`, and `Execution` use `sourceRef` or `importId` to tie imported facts back to an import.

`PositionSnapshot` is independent of the import lifecycle. It stores a JSON string of priced open positions plus reconciliation totals for a normalized account scope.

`ManualAdjustment` has a self-relation for reversals. Reversing an adjustment creates a new adjustment row and links the original through `reversedByAdjustmentId`.

## Important Identifiers

| Identifier | Meaning |
|---|---|
| `Account.id` | Internal Prisma id used by most account scoping APIs. |
| `Account.accountId` | External broker account id parsed from statements and shown in account-facing UI when no display label exists. |
| `Execution.brokerTxId` | Per-account dedupe hash. It uses broker reference number when available, otherwise normalized execution fields. |
| `Execution.instrumentKey` | Canonical matching key for equity or option instruments. FIFO matching groups open lots by this key. |
| `Execution.spreadGroupId` | Adapter-assigned id shared by legs from the same multi-leg spread group. |
| `Execution.sourceRowRef` | Source row or synthetic source reference for auditability. |
| `DailyAccountSnapshot.sourceRef` | Import id that last wrote the snapshot. |
| `CashEvent.refNumber` | Broker or generated cash-event reference. Unique per account. |
| `PositionSnapshot.accountIds` | Serialized normalized internal account-id array for snapshot lookup. |

## Enums

The main Prisma enums are:

- `Broker`: `SCHWAB_THINKORSWIM`, `FIDELITY`
- `ImportStatus`: `UPLOADED`, `PARSED`, `COMMITTED`, `FAILED`
- `AssetClass`: `EQUITY`, `OPTION`, `CASH`, `OTHER`
- `EventType`: `TRADE`, `EXPIRATION_INFERRED`, `ASSIGNMENT`, `EXERCISE`
- `Side`: `BUY`, `SELL`
- `OpeningClosingEffect`: `TO_OPEN`, `TO_CLOSE`, `UNKNOWN`
- `AdjustmentType`: `SPLIT`, `QTY_OVERRIDE`, `PRICE_OVERRIDE`, `ADD_POSITION`, `REMOVE_POSITION`, `EXECUTION_QTY_OVERRIDE`, `EXECUTION_PRICE_OVERRIDE`
- `AdjustmentStatus`: `ACTIVE`, `REVERSED`
- `PositionSnapshotStatus`: `PENDING`, `COMPLETE`, `FAILED`

## Account

`Account` stores both broker identity and UI/reconciliation metadata.

Important fields:

- `accountId`: external broker account id, unique
- `label`: adapter-provided label
- `displayLabel`: user-facing override label
- `brokerName`: display name such as Schwab or Fidelity
- `broker`: enum value used by imports and executions
- `paperMoney`: whether the account is paper-money data
- `startingCapital`: per-account baseline for return and reconciliation metrics

Accounts are created or updated during upload. Defaults are ensured by `ensureAccountDefaults()` when `/api/accounts` is loaded.

## Import

`Import` stores the upload lifecycle and audit trail.

Important fields:

- `filename`
- `broker`
- `status`
- `parsedRows`
- `persistedRows`
- `skippedRows`
- `skippedDuplicateRows`
- `failedRows`
- `sourceFileText`
- `warnings`
- `accountId`

Upload creates a row with status `UPLOADED`. Commit reparses `sourceFileText`, persists data, rebuilds derived data, and sets status `COMMITTED`. Parse or commit failures set status `FAILED`.

## Execution

`Execution` is the canonical event table used by ledger matching and audit tables.

Important fields:

- `eventTimestamp` and `tradeDate`
- `eventType`
- `assetClass`
- `symbol`
- `brokerTxId`
- `instrumentKey`
- `side`
- `quantity`
- `price`
- `grossAmount`
- `fees`
- `netAmount`
- `openingClosingEffect`
- option metadata: `underlyingSymbol`, `optionType`, `strike`, `expirationDate`, `multiplier`
- `spreadGroupId`
- `rawRowJson`

The uniqueness rule is `(accountId, brokerTxId)`. Synthetic expiration executions are stored as normal executions with event type `EXPIRATION_INFERRED` and `rawRowJson` marking them as ledger-generated.

## MatchedLot

`MatchedLot` records FIFO match results.

Important fields:

- `openExecutionId`
- `closeExecutionId`
- `quantity`
- `realizedPnl`
- `holdingDays`
- `outcome`

Outcomes are string values currently emitted as `WIN`, `LOSS`, or `FLAT`. Realized P&L is computed from the opening side, closing side, prices, quantity, and asset multiplier.

## SetupGroup

`SetupGroup` stores inferred T3 analytics.

Important fields:

- `tag`
- `overrideTag`
- `underlyingSymbol`
- `realizedPnl`
- `winRate`
- `expectancy`
- `averageHoldDays`

The persisted metrics are recalculated from linked matched lots during `rebuildAccountSetups()`. `winRate` is stored as a ratio, not a percentage. UI components multiply it by `100` for display.

## DailyAccountSnapshot

Daily snapshots come from broker balance sections.

Important fields:

- `snapshotDate`
- `balance`
- `totalCash`
- `brokerNetLiquidationValue`
- `sourceRef`

The unique key is `(accountId, snapshotDate)`. Replacement chooses the strongest snapshot for a date, preferring rows with total cash and broker NLV, then total cash, then balance only.

## CashEvent

Cash events preserve non-trade cash movements and money-market activity.

Important fields:

- `eventDate`
- `rowType`
- `refNumber`
- `description`
- `amount`
- `sourceRef`

The unique key is `(accountId, refNumber)`. Cash events feed account-balance fallback cash, reconciliation cash adjustments, Fidelity total-cash hydration, and diagnostics.

## PositionSnapshot

Position snapshots store quote-backed open-position and reconciliation state.

Important fields:

- `accountIds`: serialized normalized account scope
- `snapshotAt`
- `status`
- `errorMessage`
- `positionsJson`
- `unrealizedPnl`
- `realizedPnl`
- `cashAdjustments`
- `manualAdjustments`
- `currentNlv`
- `startingCapital`
- `totalGain`
- `unexplainedDelta`

`positionsJson` stores priced open positions with marks. The current implementation persists this JSON as a string rather than normalized rows.

## ManualAdjustment

Manual adjustments are audit overlays that avoid mutating raw executions.

Important fields:

- `createdBy`
- `symbol`
- `effectiveDate`
- `adjustmentType`
- `payloadJson`
- `reason`
- `evidenceRef`
- `status`
- `reversedByAdjustmentId`

Ledger rebuilds apply active split, execution quantity, and execution price adjustments before FIFO matching. Position computation also applies position-level adjustments.

## API Contracts

Shared API types live in `types/api.ts`.

Standard response shapes are:

- list: `{ data, meta: { total, page, pageSize } }`
- detail: `{ data }`
- error: `{ error: { code, message, details[] } }`

Primary API records include:

- `AccountRecord`
- `ImportRecord`
- `ExecutionRecord`
- `MatchedLotRecord`
- `SetupSummaryRecord`
- `OverviewSummaryResponse`
- `ReconciliationResponse`
- `TtsEvidenceResponse`
- `DiagnosticsResponse`
- `OpenPosition`
- `PositionSnapshotResponseData`
- `ManualAdjustmentRecord`

