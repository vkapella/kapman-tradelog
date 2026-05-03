# KapMan Build Spec v8.0

Status: Feature release — Fidelity brokerage import adapter  
Base: `docs/kapman_build_spec_v7_2.md`

---

## Purpose

v8.0 adds a Fidelity brokerage CSV import adapter to the existing adapter registry. The adapter parses Fidelity's "History for Account" export format, normalises it into KapMan's canonical `Execution` + `CashEvent` schema, and integrates with the existing import pipeline (preview → commit → ledger rebuild) unchanged.

No schema migrations, no new adjustment types, no changes to FIFO matching or P&L formulas are introduced in v8.0.

---

## Source Format — Fidelity "History for Account" CSV

### File characteristics

| Property | Value |
|---|---|
| Encoding | UTF-8 with BOM (`\xEF\xBB\xBF`) |
| Header rows | 2 blank rows followed by column headers at row 3 |
| Date format | `MM/DD/YYYY` |
| Decimal separator | `.` |
| Currency columns | Include `$` suffix in header name |
| Missing values | Empty cell (not `null`, not `N/A`) |
| File naming convention | `History_for_Account_<accountId>-<sequenceNumber>.csv` |
| Account ID in filename | Alphanumeric, e.g. `T12345678` |
| Multi-file imports | Multiple files for same account are valid; dedup by `(runDate, action, symbol, quantity, amount)` |

### Column schema

| Column (raw) | Normalised field | Notes |
|---|---|---|
| `Run Date` | `executionDate` | Parse as `MM/DD/YYYY`; map to UTC midnight |
| `Action` | `rawAction` | Full freeform string; drives classification logic |
| `Symbol` | `symbol` | May be blank; option symbols prefixed with ` -` (space-dash); strip leading space |
| `Description` | `description` | Human-readable; used for fallback ticker extraction only |
| `Type` | `marginType` | `Cash` or `Margin`; store on execution |
| `Price ($)` | `price` | Parse as float; blank = `null` |
| `Quantity` | `quantity` | Parse as float; sign handling described below |
| `Commission ($)` | `commission` | Parse as float; blank = `0` |
| `Fees ($)` | `fees` | Parse as float; blank = `0` |
| `Accrued Interest ($)` | `accruedInterest` | Parse as float; blank = `0` |
| `Amount ($)` | `amount` | Net cash impact; credits positive, debits negative |
| `Cash Balance ($)` | `cashBalance` | Running balance after this row; informational only, not stored |
| `Settlement Date` | `settlementDate` | `MM/DD/YYYY`; may be blank |

---

## Action Classification

The `Action` field is a freeform string. Classification is performed by substring matching in priority order. The first matching rule wins.

### Trade executions — produce `Execution` records

| Pattern in `Action` | `side` | `openClose` | Asset class |
|---|---|---|---|
| `YOU BOUGHT OPENING TRANSACTION` | `BUY` | `OPEN` | Option |
| `YOU BOUGHT CLOSING TRANSACTION` | `BUY` | `CLOSE` | Option |
| `YOU SOLD OPENING TRANSACTION` | `SELL` | `OPEN` | Option |
| `YOU SOLD CLOSING TRANSACTION` | `SELL` | `CLOSE` | Option |
| `YOU BOUGHT ASSIGNED` | `BUY` | `null` | Equity (assignment delivery) |
| `YOU BOUGHT` (no OPENING/CLOSING) | `BUY` | `null` | Equity |
| `YOU SOLD` (no OPENING/CLOSING) | `SELL` | `null` | Equity |
| `ASSIGNED as of` | `BUY` | `CLOSE` | Option assignment close |

Note: `YOU BOUGHT ASSIGNED` must be checked before the generic `YOU BOUGHT` rule.

### Cash events — produce `CashEvent` records (not `Execution`)

| Pattern in `Action` | `cashEventType` |
|---|---|
| `DIVIDEND RECEIVED` | `DIVIDEND` |
| `REINVESTMENT` | `REINVESTMENT` |
| `REDEMPTION FROM CORE ACCOUNT` | `REDEMPTION` |
| `YOU BOUGHT PROSPECTUS UNDER SEPARATE COVER` | `MONEY_MARKET_BUY` |
| `TRANSFERRED FROM` | `TRANSFER_IN` |
| `TRANSFER OF ASSETS ACAT RECEIVE` | `ACAT_RECEIVE` |
| `TRANSFER OF ASSETS ACAT RES.CREDIT` | `ACAT_CREDIT` |

### Cancelled rows — skip without error

| Pattern in `Action` | Behaviour |
|---|---|
| `BUY CANCEL` or `CXL DESCRIPTION CANCELLED TRADE` | Set status `CANCELLED`; do not create `Execution` or `CashEvent`; append to import warnings |

### Unrecognised rows

Any row matching none of the above rules must be appended to `importWarnings[]` with the raw `Action` value and skipped. It must not silently produce a malformed record.

---

## Option Symbol Parsing

Fidelity option symbols in the `Symbol` column follow OCC compact notation with a leading space:

```
 -TICKER YYMMDDxSTRIKE
```

Examples:

| Raw symbol | Underlying | Expiry | Type | Strike |
|---|---|---|---|---|
| ` -NTAP260220C115` | NTAP | 2026-02-20 | CALL | 115.00 |
| ` -PLTR260116P150` | PLTR | 2026-01-16 | PUT | 150.00 |
| ` -RKLB260320C55` | RKLB | 2026-03-20 | CALL | 55.00 |
| ` -NVDA261218C175` | NVDA | 2026-12-18 | CALL | 175.00 |

### Regex (applied after stripping leading space)

```
^-([A-Z]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d+)$
```

| Group | Meaning | Example |
|---|---|---|
| 1 | Underlying ticker | `NTAP` |
| 2 | Expiry year (2-digit) | `26` → `2026` |
| 3 | Expiry month | `02` |
| 4 | Expiry day | `20` |
| 5 | Option type | `C` = Call, `P` = Put |
| 6 | Strike (integer, whole dollars) | `115` → `115.00` |

### Derived fields from option symbol

| Field | Derivation |
|---|---|
| `underlyingTicker` | Group 1 |
| `expirationDate` | `20YY-MM-DD` from groups 2/3/4 |
| `optionType` | `CALL` or `PUT` |
| `strikePrice` | `parseFloat(group 6)` — whole dollars, no divide-by-1000 |
| `assetClass` | `OPTION` |

For rows where the symbol does not match the regex, `assetClass = EQUITY`.

---

## Quantity and Side Sign Convention

Fidelity's `Quantity` sign is not always consistent with KapMan's canonical convention.

| Row type | Fidelity `Quantity` sign | KapMan `quantity` | KapMan `side` |
|---|---|---|---|
| Option buy open / buy close | Positive | Positive (as-is) | `BUY` |
| Option sell open / sell close | Negative | `abs(quantity)` | `SELL` |
| Equity buy | Positive | Positive (as-is) | `BUY` |
| Equity sell | Positive | Positive (as-is) | `SELL` |
| Assignment (option leg) | Blank or negative | Derived from contracts | `BUY` |

**Rule:** Always store `abs(quantity)` on `Execution.quantity`. Derive `side` from the action classification, not from the sign of `Quantity`.

---

## Options Quantity: Contracts vs Shares

Fidelity's `Quantity` for options is the number of contracts, which is already KapMan's convention. The `* 100` multiplier for realized P&L is applied at the FIFO match write-path (implemented in v7.2 — see `MatchedLot.realizedPnl` formula). The adapter must not apply the multiplier again.

---

## Assignment Handling

Assignment events appear as a row pair in the same file:

1. `ASSIGNED as of <date> PUT/CALL (TICKER) ... $<strike> (100 SHS)` — the option contract close  
2. `YOU BOUGHT ASSIGNED PUTS AS OF <date> <UNDERLYING> (TICKER)` — the equity delivery

### Rules

- The option leg produces an `Execution` with `side=BUY`, `openClose=CLOSE`, `assetClass=OPTION`.
- The equity leg produces a separate `Execution` with `side=BUY`, `openClose=null`, `assetClass=EQUITY`.
- Attempt to link the two records by `(tradeDate, underlyingTicker)`; store the link ID on both records if found.
- If the link cannot be established, append an import warning — do not block the commit.
- Do not synthesize a matched lot for assignments at import time; let the existing FIFO matcher close the option position.

---

## Money Market / Core Account Rows

Rows involving `SPAXX` and `FSIXX` are Fidelity core cash equivalents. They affect cash balance but not trade P&L.

| Symbol | Name | Classification |
|---|---|---|
| `SPAXX` | Fidelity Government Money Market | `CashEvent` — `cashEventType = MONEY_MARKET` |
| `FSIXX` | FIMM Treasury Only Portfolio: Cl I | `CashEvent` — `cashEventType = MONEY_MARKET` |

Do not create `Execution` records for these symbols.

---

## Adapter Implementation

### File layout

```
src/lib/adapters/fidelity/
  index.ts          — FidelityAdapter implementing AdapterInterface; exported as default
  parser.ts         — Buffer → raw row objects (handles BOM, skips 2 blank header rows, maps columns)
  classifier.ts     — rawAction string → ActionClassification
  symbol-parser.ts  — stripped symbol string → OptionDetails | null
  transformer.ts    — raw rows → ImportRecord[] (Execution | CashEvent | Skipped | Cancelled)
  types.ts          — local type definitions
```

### AdapterInterface contract (existing, unchanged)

```typescript
interface AdapterInterface {
  name: string;           // "fidelity"
  displayName: string;    // "Fidelity"
  fileExtensions: string[]; // [".csv"]
  parse(fileBuffer: Buffer, filename: string): Promise<ImportRecord[]>;
  validate(records: ImportRecord[]): ValidationResult;
}
```

### Registration

Add to `src/lib/adapters/index.ts` alongside existing adapters. The `/api/imports/adapters` endpoint must return `"fidelity"` in its adapter list after registration.

### Account ID extraction from filename

```
History_for_Account_([A-Z0-9]+)-\d+\.csv
```

If the filename does not match, fall back to prompting the user to confirm the account ID in the existing import preview UI.

---

## Import UI Changes

### Adapter selector

The existing `/imports` page adapter selector is populated from `/api/imports/adapters`. No UI changes required beyond registration.

### Preview table columns (Fidelity adapter)

When the selected adapter is `fidelity`, the preview table renders:

| Column | Source field |
|---|---|
| Run Date | `executionDate` |
| Action (classified) | `actionClassification` |
| Symbol | `symbol` (normalised, space stripped) |
| Underlying | `underlyingTicker` |
| Asset Class | `assetClass` |
| Side | `side` |
| Open/Close | `openClose` |
| Qty | `quantity` |
| Price | `price` |
| Amount ($) | `amount` |
| Margin Type | `marginType` |
| Status | `VALID` / `WARNING` / `SKIPPED` / `CANCELLED` |

Warning rows: yellow badge (existing KM-035 conventions).  
Skipped / Cancelled rows: grey badge.

---

## Deduplication

On commit, deduplicate against existing `Execution` rows for the same `accountId`:

- Dedup key: `(executionDate, symbol, side, quantity, amount)`
- Duplicate rows are skipped (not errored).
- Skipped-duplicate count is returned in the commit response and surfaces in the Import Health Scorecard widget (KM-016) without changes.

---

## Error Handling and Import Warnings

All parse errors and unrecognised action strings are accumulated into `importWarnings[]` on the import record. Warnings do not block commit. The commit response body includes the warning array. No changes to Import Health Scorecard widget are required.

---

## Explicit Non-Goals for v8.0

- No support for Fidelity PDF statements, tax documents, or portfolio CSV exports.
- No support for multi-account combined files (each Fidelity History CSV is single-account).
- No changes to FIFO matching, P&L formulas, or open-position valuation.
- No schema migrations or new Prisma models.
- No new manual adjustment types.
- No changes to TTS Evidence, Analytics, or Diagnostics surfaces.
- No changes to the Schwab adapter.

---

## Validation Requirements

```bash
npm run test        # unit tests: parser, classifier, symbol-parser, transformer
npm run typecheck
npm run lint
```

### Required test fixtures

Copy uploaded sample files to:

```
tests/adapters/fidelity/fixtures/History_for_Account_T12345678-8.csv
tests/adapters/fidelity/fixtures/History_for_Account_T12345678-9.csv
tests/adapters/fidelity/fixtures/History_for_Account_T12345678-10.csv
```

### Required unit tests

| Test | Assertion |
|---|---|
| BOM stripping | Parser does not emit `\uFEFF` in any field value |
| Option symbol regex | All 15 sample option symbols parse to correct underlying/expiry/type/strike |
| Action classifier — buy open | Classified as `BUY / OPEN / OPTION` |
| Action classifier — sell open | Classified as `SELL / OPEN / OPTION` |
| Action classifier — buy close | Classified as `BUY / CLOSE / OPTION` |
| Action classifier — sell close | Classified as `SELL / CLOSE / OPTION` |
| Action classifier — equity buy | Classified as `BUY / null / EQUITY` |
| Action classifier — equity sell | Classified as `SELL / null / EQUITY` |
| Action classifier — assignment pair | Option leg `CLOSE`, equity leg linked |
| Action classifier — dividend | Produces `CashEvent DIVIDEND`, no `Execution` |
| Action classifier — money market | Produces `CashEvent MONEY_MARKET` for `SPAXX` and `FSIXX` |
| Action classifier — cancelled row | Status `CANCELLED`, no record produced |
| Action classifier — unrecognised | Status `WARNING`, appended to `importWarnings[]` |
| Quantity sign | `abs(quantity)` stored; side from classifier |
| Deduplication | Re-importing same file produces zero new executions |
| Account ID extraction | Filename regex extracts `T12345678` correctly |

---

## Rollout Notes

1. Deploy code changes. No `rebuild:pnl` run required for new imports.
2. Verify `/api/imports/adapters` returns `"fidelity"` in the adapter list.
3. Import fixture file `-8` via the `/imports` UI. Confirm preview row count and classification breakdown match expected values.
4. Commit the import. Confirm executions appear in `/trade-records` and relevant open options appear in `/positions`.
5. Re-import the same file. Confirm deduplication count equals the row count from step 3 and no duplicate executions are created.
6. Import fixture files `-9` and `-10`. Spot-check assignment rows link correctly.
