# Story: Think or Swim 260727

## User Story

As a trader importing a Schwab thinkorswim Account Statement CSV,
I want KapMan to recognize the trade-history header exported on July 27, 2026,
so that I can preview and commit the statement without editing the broker file.

## Context

The files below are valid thinkorswim paperMoney Account Statement exports, but
both fail during upload:

- `2026-07-27-AccountStatement53.csv`
- `2026-07-27-AccountStatement54.csv`

The upload API returns `PARSE_ERROR` because the current adapter requires this
legacy `Account Trade History` header:

```csv
,Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type
```

The July 27, 2026 exports add `Total Cost` between `Qty` and `Pos Effect`:

```csv
,Exec Time,Spread,Side,Qty,Total Cost,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type
```

The importer currently rejects that header before parsing any executions. Merely
relaxing the header comparison is unsafe because positional parsing would shift
every field after `Qty` by one column.

## Goal

Extend the Schwab thinkorswim adapter to parse both known trade-history layouts
by resolving fields from the detected header, while preserving all existing
normalization, warning, fee matching, multi-account, and commit behavior.

## Scope

- Recognize the legacy header and the July 27, 2026 header containing
  `Total Cost`.
- Map trade-history values by normalized header name or by an explicitly
  selected, tested schema definition. Do not silently rely on legacy offsets
  after recognizing the new layout.
- Treat `Total Cost` as optional source data. It must not replace execution
  `Price` or `Net Price`, and it must not be interpreted as a fee.
- Preserve the leading empty column in both header layouts.
- Preserve one canonical execution per trade-history leg.
- Preserve continuation-leg grouping and existing handling for blank
  `Exec Time`, blank `Order Type`, `DEBIT`, `CREDIT`, and `~`.
- Preserve account metadata parsing, Cash Balance fee/reference matching,
  daily snapshots, cash events, broker detection, and duplicate handling.
- Return a specific, actionable API error when a future header cannot be mapped.
- Surface the server-provided parse error in the upload UI instead of replacing
  it with only `Upload failed. Review the file and retry.`

## Out of Scope

- Using `Total Cost` in P&L, fee, or ledger calculations.
- Parsing canceled rows from `Account Order History`.
- Merging spread legs in the adapter.
- Changing FIFO matching, setup inference, or account-value calculations.
- Deploying the application.

## Implementation Notes

- Keep the change inside the thinkorswim adapter and import upload presentation
  boundary; do not move ledger or analytics behavior into the adapter.
- Prefer a header-to-index map so insertion of a recognized optional column
  cannot shift canonical fields.
- Validate required columns individually and report missing, duplicate, or
  unsupported columns in the parse error details.
- Include a format identifier or warning that distinguishes the `260727`
  layout when useful for diagnostics.
- Add sanitized regression fixtures derived from both supplied exports. Retain
  enough Cash Balance and Account Trade History content to exercise the real
  section boundaries and account metadata without committing unrelated account
  history.

## Acceptance Criteria

- `2026-07-27-AccountStatement53.csv` reaches upload preview without a parse
  error and produces three canonical option executions:
  - `D`, `SELL`, quantity `2`, `TO_CLOSE`, price `7.25`
  - `APH`, `SELL`, quantity `2`, `TO_CLOSE`, price `14.20`
  - `DDOG`, `SELL`, quantity `1`, `TO_OPEN`, price `20.10`
- `2026-07-27-AccountStatement54.csv` reaches upload preview without a parse
  error and produces one canonical option execution:
  - `GOOG`, `SELL`, quantity `1`, `TO_CLOSE`, price `21.75`
- The new column does not shift `Pos Effect`, `Symbol`, `Exp`, `Strike`,
  `Type`, `Price`, `Net Price`, or `Order Type`.
- `Total Cost` values such as `0.00` do not alter canonical execution price,
  net amount, fees, or quantity.
- Account IDs `D-68011053` and `D-68011054` are detected from statement
  metadata and remain separate accounts.
- Upload preview, commit, import history, execution persistence, fee matching,
  snapshots, matched-lot refresh, and diagnostics complete through the existing
  workflow for both new-format fixtures.
- The legacy header remains supported with no change to existing normalized
  execution output.
- Unsupported future layouts fail before persistence and identify the exact
  missing, duplicate, or unsupported header fields.
- The Imports UI displays the actionable parse message returned by the API.
- No malformed or unknown trade row is silently discarded.

## Test Coverage

- Add parser unit tests for both header layouts.
- Add assertions proving column alignment for every field after `Qty`.
- Add regression tests using sanitized `AccountStatement53` and
  `AccountStatement54` fixtures.
- Add an upload-route test confirming the new layout returns a populated
  preview.
- Add a UI test confirming API parse details are shown to the user.
- Retain and run existing tests covering multi-leg continuation rows,
  `DEBIT`/`CREDIT`, `~`, supported spreads, cash references, and snapshots.

## Validation Plan

```bash
npm run typecheck
npm run lint
npm test -- --passWithNoTests
docker compose up -d --build
curl -sf http://localhost:3002/api/health | grep ok
curl -sf http://localhost:3002/api/overview/summary | grep netPnl
```

Manually exercise upload, preview, and commit using both supplied files and
confirm the execution counts and field values listed above.
