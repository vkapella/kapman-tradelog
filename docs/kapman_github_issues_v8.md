# KapMan GitHub Issues v8

Scope: Fidelity brokerage import adapter (v8.0)  
All issues below are net-new for v8. Existing v7/v7.2 issues (KM-001 through KM-035) are unchanged.

---

## Issue KM-036 — Fidelity adapter: parser (`parser.ts`)

Parse a Fidelity "History for Account" CSV buffer into raw row objects.

### Deliverables

- `src/lib/adapters/fidelity/parser.ts`
- Exported function: `parseFidelityCsv(buffer: Buffer, filename: string): RawFidelityRow[]`
- Strip UTF-8 BOM (`\xEF\xBB\xBF`) from the start of the buffer before parsing.
- Skip rows 1 and 2 (blank header rows); treat row 3 as the column header.
- Map raw column names to the normalised field names defined in `types.ts` (see KM-040).
- Strip leading/trailing whitespace from all string fields.
- Strip the leading space from the `Symbol` field (Fidelity prefixes option symbols with ` -`).
- Parse numeric fields (`Price ($)`, `Quantity`, `Commission ($)`, `Fees ($)`, `Accrued Interest ($)`, `Amount ($)`, `Cash Balance ($)`) as `float | null`; empty string maps to `null`.
- Parse `Run Date` and `Settlement Date` as `Date | null` using `MM/DD/YYYY` format; empty string maps to `null`.
- Extract `accountId` from the filename using: `History_for_Account_([A-Z0-9]+)-\d+\.csv`. If no match, set `accountId = null`.
- Return all rows including blank/empty rows (caller filters them).

### Acceptance criteria

- `parseFidelityCsv` returns the correct data row count for each fixture file.
- No field value begins with `\uFEFF`.
- Option symbol `" -NTAP260220C115"` is returned as `"-NTAP260220C115"` (leading space stripped).
- `accountId` extracted as `"X19467537"` from all three fixture filenames.
- `npm run typecheck` and `npm run lint` pass.

---

## Issue KM-037 — Fidelity adapter: action classifier (`classifier.ts`)

Classify each raw Fidelity `Action` string into a structured `ActionClassification`.

### Deliverables

- `src/lib/adapters/fidelity/classifier.ts`
- Exported function: `classifyAction(rawAction: string): ActionClassification`
- Types defined in `types.ts` (see KM-040).

### Classification rules — priority order, first match wins

| Priority | Substring match | Result |
|---|---|---|
| 1 | `BUY CANCEL` or `CXL DESCRIPTION CANCELLED TRADE` | `{ kind: 'CANCELLED' }` |
| 2 | `YOU BOUGHT OPENING TRANSACTION` | `EXECUTION BUY OPEN OPTION` |
| 3 | `YOU BOUGHT CLOSING TRANSACTION` | `EXECUTION BUY CLOSE OPTION` |
| 4 | `YOU SOLD OPENING TRANSACTION` | `EXECUTION SELL OPEN OPTION` |
| 5 | `YOU SOLD CLOSING TRANSACTION` | `EXECUTION SELL CLOSE OPTION` |
| 6 | `ASSIGNED as of` | `EXECUTION BUY CLOSE OPTION` |
| 7 | `YOU BOUGHT ASSIGNED` | `EXECUTION BUY null EQUITY` |
| 8 | `YOU BOUGHT PROSPECTUS UNDER SEPARATE COVER` | `CASH_EVENT MONEY_MARKET_BUY` |
| 9 | `DIVIDEND RECEIVED` | `CASH_EVENT DIVIDEND` |
| 10 | `REINVESTMENT` | `CASH_EVENT REINVESTMENT` |
| 11 | `REDEMPTION FROM CORE ACCOUNT` | `CASH_EVENT REDEMPTION` |
| 12 | `TRANSFERRED FROM` | `CASH_EVENT TRANSFER_IN` |
| 13 | `TRANSFER OF ASSETS ACAT RECEIVE` | `CASH_EVENT ACAT_RECEIVE` |
| 14 | `TRANSFER OF ASSETS ACAT RES.CREDIT` | `CASH_EVENT ACAT_CREDIT` |
| 15 | `YOU BOUGHT` | `EXECUTION BUY null EQUITY` |
| 16 | `YOU SOLD` | `EXECUTION SELL null EQUITY` |
| 17 | (no match) | `{ kind: 'UNKNOWN' }` |

Note: rules 7 and 8 must be checked before rules 15/16 (`YOU BOUGHT` generic).

### Acceptance criteria

- All 16 action pattern categories unit-tested with at least one representative string from the fixture files.
- `UNKNOWN` result does not throw; caller appends to `importWarnings[]`.
- `npm run typecheck` and `npm run lint` pass.

---

## Issue KM-038 — Fidelity adapter: option symbol parser (`symbol-parser.ts`)

Parse Fidelity's compact OCC option symbol into structured option details.

### Deliverables

- `src/lib/adapters/fidelity/symbol-parser.ts`
- Exported function: `parseOptionSymbol(symbol: string): OptionDetails | null`
- Returns `null` for equity symbols or unrecognised formats — not an error.
- Input must already have the leading space stripped (done in `parser.ts`).

### Regex

```
^-([A-Z]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d+)$
```

### Strike normalisation

Group 6 is whole dollars. `strikePrice = parseFloat(group6)`. Do NOT divide by 1000.

### Acceptance criteria — unit test table

| Input | Expected |
|---|---|
| `-NTAP260220C115` | `{ underlyingTicker: "NTAP", expirationDate: "2026-02-20", optionType: "CALL", strikePrice: 115 }` |
| `-PLTR260116P150` | `{ underlyingTicker: "PLTR", expirationDate: "2026-01-16", optionType: "PUT", strikePrice: 150 }` |
| `-RKLB260320C55` | `{ underlyingTicker: "RKLB", expirationDate: "2026-03-20", optionType: "CALL", strikePrice: 55 }` |
| `-NVDA261218C175` | `{ underlyingTicker: "NVDA", expirationDate: "2026-12-18", optionType: "CALL", strikePrice: 175 }` |
| `-AMZN260717C215` | `{ underlyingTicker: "AMZN", expirationDate: "2026-07-17", optionType: "CALL", strikePrice: 215 }` |
| `MTUM` | `null` |
| `SPAXX` | `null` |
| `""` (empty) | `null` |

- `npm run typecheck` and `npm run lint` pass.

---

## Issue KM-039 — Fidelity adapter: transformer (`transformer.ts`)

Transform raw parsed rows into `ImportRecord[]` using the classifier and symbol parser.

### Deliverables

- `src/lib/adapters/fidelity/transformer.ts`
- Exported function: `transformFidelityRows(rows: RawFidelityRow[], accountId: string | null): TransformResult`

```typescript
interface TransformResult {
  records: ImportRecord[];
  warnings: ImportWarning[];
  cancelledCount: number;
  skippedBlankCount: number;
}
```

### Transformation rules

**Blank rows:** Skip if `rawAction` is empty or whitespace. Increment `skippedBlankCount`.

**CANCELLED rows:** Skip. Increment `cancelledCount`. Append to `warnings` with `rawAction`.

**UNKNOWN rows:** Skip. Append to `warnings` with `rawAction` in message.

**CASH_EVENT rows:** Produce a `CashEvent` record:

| CashEvent field | Source |
|---|---|
| `accountId` | From filename or caller |
| `eventDate` | `executionDate` |
| `cashEventType` | From classification |
| `symbol` | Normalised symbol |
| `description` | `description` |
| `amount` | `amount` |
| `marginType` | `marginType` |

**EXECUTION rows:** Produce an `Execution` record:

| Execution field | Source |
|---|---|
| `accountId` | From filename or caller |
| `executionDate` | `runDate` |
| `settlementDate` | `settlementDate` |
| `symbol` | Normalised symbol |
| `underlyingTicker` | `OptionDetails.underlyingTicker` (option) or `symbol` (equity) |
| `assetClass` | From classification |
| `optionType` | `OptionDetails.optionType` or `null` |
| `expirationDate` | `OptionDetails.expirationDate` or `null` |
| `strikePrice` | `OptionDetails.strikePrice` or `null` |
| `side` | From classification |
| `openClose` | From classification |
| `quantity` | `Math.abs(rawQuantity)` |
| `price` | `price` |
| `commission` | `commission ?? 0` |
| `fees` | `fees ?? 0` |
| `amount` | `amount` |
| `marginType` | `marginType` |
| `rawAction` | `rawAction` (stored for traceability) |

**Money market override:** If `symbol` is `SPAXX` or `FSIXX` and the classification produced an `EXECUTION`, reclassify to `CashEvent MONEY_MARKET`. This handles the `YOU BOUGHT PROSPECTUS UNDER SEPARATE COVER FIMM...` pattern regardless of whether rule 8 fires.

**Assignment linking:** After all rows are processed, scan for `ASSIGNED as of` option rows and `YOU BOUGHT ASSIGNED` equity rows with matching `(executionDate, underlyingTicker)`. Assign a shared `assignmentLinkId` (UUID v4) to both records. If a pair cannot be matched, append to `warnings`.

### Acceptance criteria

- `YOU SOLD OPENING TRANSACTION` row with `Quantity = -1` produces `quantity = 1` and `side = SELL`.
- `SPAXX` and `FSIXX` never appear in `Execution` output.
- Assignment pair in fixture `-9` (DAL, INTC) produces two linked records each.
- `npm run typecheck` and `npm run lint` pass.

---

## Issue KM-040 — Fidelity adapter: types and index (`types.ts`, `index.ts`)

Define shared local types and wire up the `FidelityAdapter` class implementing `AdapterInterface`.

### Deliverables

#### `src/lib/adapters/fidelity/types.ts`

```typescript
export interface RawFidelityRow {
  runDate: Date | null;
  rawAction: string;
  symbol: string;
  description: string;
  marginType: 'Cash' | 'Margin' | null;
  price: number | null;
  quantity: number | null;
  commission: number | null;
  fees: number | null;
  accruedInterest: number | null;
  amount: number | null;
  cashBalance: number | null;
  settlementDate: Date | null;
}

export interface OptionDetails {
  underlyingTicker: string;
  expirationDate: string;   // ISO 8601 "YYYY-MM-DD"
  optionType: 'CALL' | 'PUT';
  strikePrice: number;
}

export type CashEventType =
  | 'DIVIDEND'
  | 'REINVESTMENT'
  | 'REDEMPTION'
  | 'MONEY_MARKET_BUY'
  | 'MONEY_MARKET'
  | 'TRANSFER_IN'
  | 'ACAT_RECEIVE'
  | 'ACAT_CREDIT';

export type ActionClassification =
  | { kind: 'EXECUTION'; side: 'BUY' | 'SELL'; openClose: 'OPEN' | 'CLOSE' | null; assetClass: 'OPTION' | 'EQUITY' }
  | { kind: 'CASH_EVENT'; cashEventType: CashEventType }
  | { kind: 'CANCELLED' }
  | { kind: 'UNKNOWN' };

export interface ImportWarning {
  rowIndex: number;
  rawAction: string;
  message: string;
}
```

#### `src/lib/adapters/fidelity/index.ts`

- Class `FidelityAdapter` implementing `AdapterInterface`.
- `name = "fidelity"`, `displayName = "Fidelity"`, `fileExtensions = [".csv"]`.
- `parse(buffer, filename)` delegates to `parseFidelityCsv` then `transformFidelityRows`.
- `validate(records)` returns `ValidationResult` with counts by status.
- Default export.

#### Registration in `src/lib/adapters/index.ts`

- Import and register `FidelityAdapter`.
- `GET /api/imports/adapters` must return `{ name: "fidelity", displayName: "Fidelity", fileExtensions: [".csv"] }`.

### Acceptance criteria

- `GET /api/imports/adapters` response includes `fidelity` entry.
- `FidelityAdapter.parse` is callable with fixture buffer and returns `ImportRecord[]` without throwing.
- `npm run typecheck` and `npm run lint` pass.

---

## Issue KM-041 — Fidelity adapter: import preview table — Fidelity column set

Update the import preview table to render Fidelity-specific columns when the active adapter is `fidelity`.

### Deliverables

- Update `src/components/imports/ImportPreviewTable.tsx` (or equivalent component).
- When `adapter === "fidelity"`, render these columns in order:

| # | Header | Field |
|---|---|---|
| 1 | Run Date | `executionDate` |
| 2 | Classified Action | `actionClassification` |
| 3 | Symbol | `symbol` |
| 4 | Underlying | `underlyingTicker` |
| 5 | Asset Class | `assetClass` |
| 6 | Side | `side` |
| 7 | Open/Close | `openClose` |
| 8 | Qty | `quantity` |
| 9 | Price | `price` |
| 10 | Amount ($) | `amount` |
| 11 | Margin | `marginType` |
| 12 | Status | status badge |

- Status badge variants (use existing KM-035 badge component):
  - `VALID` → green
  - `WARNING` → yellow
  - `SKIPPED` → grey, label `SKIPPED`
  - `CANCELLED` → grey, label `CANCELLED`
- Warning rows expand inline (or on row click) to show the `ImportWarning.message`.

### Acceptance criteria

- Loading fixture `-10` into the import preview renders the Fidelity column set.
- Status badges render without console errors.
- Non-Fidelity adapters continue to render their existing column sets unchanged.
- `npm run typecheck` and `npm run lint` pass.

---

## Issue KM-042 — Fidelity adapter: deduplication on commit

Prevent duplicate `Execution` and `CashEvent` records when the same Fidelity file or an overlapping date-range export is committed more than once.

### Deliverables

- Add deduplication logic to the import commit handler (`/api/imports/:id/commit`), applied after the adapter's `parse` call and before the ledger rebuild.
- Dedup key for `Execution`: `(accountId, executionDate, symbol, side, quantity, amount)`.
- Dedup key for `CashEvent`: `(accountId, eventDate, cashEventType, symbol, amount)`.
- Matching existing records are excluded from the batch insert; they are not errored.
- Commit response body includes:

```json
{
  "inserted": { "executions": 0, "cashEvents": 0 },
  "skippedDuplicates": { "executions": 0, "cashEvents": 0 },
  "warnings": []
}
```

- Import Health Scorecard widget (KM-016) surfaces `skippedDuplicates` counts without additional widget changes.

### Acceptance criteria

- Committing fixture `-10` a second time returns `inserted.executions = 0` and `skippedDuplicates.executions` equal to the count inserted on first commit.
- No duplicate rows in the `Execution` or `CashEvent` tables after repeated commits.
- `npm run typecheck` and `npm run lint` pass.

---

## Issue KM-043 — Fidelity adapter: unit test suite

Create a comprehensive unit test suite for all Fidelity adapter modules.

### Deliverables

```
tests/adapters/fidelity/
  parser.test.ts
  classifier.test.ts
  symbol-parser.test.ts
  transformer.test.ts
  fixtures/
    History_for_Account_X19467537-8.csv
    History_for_Account_X19467537-9.csv
    History_for_Account_X19467537-10.csv
```

### Required test coverage

| Module | Tests |
|---|---|
| `parser.ts` | BOM strip; row count per fixture; account ID from filename; numeric null on blank cell; date parsing; space-stripped symbol |
| `classifier.ts` | All 16 priority rules with one representative action string each; priority ordering (rule 7 before rule 15) |
| `symbol-parser.ts` | All 8 inputs in KM-038 acceptance criteria |
| `transformer.ts` | `abs(quantity)` on SELL row; SPAXX/FSIXX money market override; assignment link on fixture `-9`; blank row skip; CANCELLED skip; UNKNOWN warning; full round-trip count on fixture `-10` |

### Acceptance criteria

- `npm run test` passes with zero failures.
- Branch coverage for `src/lib/adapters/fidelity/**` is at least 90%.
- `npm run typecheck` and `npm run lint` pass.

---

## Issue KM-044 — Fidelity adapter: integration smoke test (manual)

Document a manual integration test procedure for verifying end-to-end Fidelity import in a deployed environment.

### Deliverables

- `docs/testing/fidelity-import-smoke-test.md`

### Test steps

| # | Action | Expected result |
|---|---|---|
| 1 | `GET /api/imports/adapters` | Response includes `{ name: "fidelity", displayName: "Fidelity" }` |
| 2 | Upload fixture `-8` on `/imports` with adapter `fidelity` | Preview loads; row count and status badge breakdown visible |
| 3 | Check option rows in preview | `Underlying`, `Open/Close`, `Qty`, `Asset Class` all populated; no `UNKNOWN` badges for standard rows |
| 4 | Commit import | Response shows non-zero `inserted.executions` |
| 5 | Navigate to `/trade-records?tab=executions` | Fidelity executions visible; account ID shown correctly |
| 6 | Navigate to `/positions` | Open options from fixture visible with correct expiry and strike |
| 7 | Re-upload and commit same fixture `-8` | `inserted.executions = 0`; `skippedDuplicates` equals prior inserted count |
| 8 | Upload fixture `-9` | Assignment rows (DAL, INTC) import without errors; both option close and equity delivery rows present |

### Acceptance criteria

- All 8 steps pass with no browser console errors.
- Document committed to `docs/testing/`.
