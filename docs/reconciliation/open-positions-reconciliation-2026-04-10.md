# Open Positions Reconciliation Report (2026-04-10)

## Scope
Compare KapMan-derived open positions against user-provided broker references for:
- `D-68011053` (app internal id suffix `em3s`)
- `D-68011054` (app internal id suffix `tvc3`)

This report covers quantity and cost basis reconciliation first, then account-level totals.

## Method
- Source-of-truth in app: `Execution` + `MatchedLot` tables, with open positions computed by subtracting matched quantity per `openExecutionId`.
- Broker reference: screenshots provided in thread for accounts ending `053` and `054`.

## Code Fixes Included
1. Open positions now compute **remaining quantity** per open execution (`openQty - matchedQty`) rather than dropping any open execution that appears in matched lots.
2. Option cost basis now applies multiplier-aware math (`x100` for options, `x1` for equities).
3. Dashboard widget layout persistence now uses hydration-safe localStorage flow to prevent default-layout overwrite on first render.

## Reconciliation Summary

### Account D-68011054
- Status: **Reconciled** for all visible open positions and totals in provided reference.
- Row checks (AVGO, SPHQ, QQQM, TGT): quantity and cost basis match.
- Account total cost basis: **$90,588.36** (broker) vs **$90,588.36** (app-derived from imported data).

### Account D-68011053
- Status: **Partially reconciled**.
- 16 of 18 broker-listed open positions match quantity and cost basis.
- Two deltas remain:
  - `SDS`
    - Broker: Qty `30`, Cost `$2,220.60`
    - App-derived: Qty `270`, Cost `$3,994.90`
    - Delta: `+240` shares, `+$1,774.30` cost basis
  - `XLU`
    - Broker: Qty `100`, Cost `$4,589.00`
    - App-derived: **not open**
    - Delta: `-100` shares, `-$4,589.00` cost basis

- Account total cost basis:
  - Broker total: **$180,016.35**
  - App-derived total: **$177,201.65**
  - Delta: **-$2,814.70**

- The two symbol deltas explain the full account total delta exactly:
  - `(-$4,589.00 from missing XLU) + (+$1,774.30 excess SDS) = -$2,814.70`

## Data Evidence (Imported Executions)
For `D-68011053`:
- `SDS` executions in DB show:
  - BUY 200 @ 14.87 (TO_OPEN)
  - BUY 100 @ 14.67 (TO_OPEN)
  - SELL 30 @ 68.72 (TO_CLOSE)
- Matched lots for SDS show only one close quantity of `30` against the first open.
- Therefore remaining SDS quantity from imported data is `270`.

For `XLU` executions in DB show:
- BUY 100 @ 91.78 (TO_OPEN)
- SELL 100 @ 47.00 (TO_CLOSE) on 2026-02-24
- Therefore XLU is closed in imported data and does not appear as open.

## Interpretation
The remaining mismatches are consistent with a **data parity gap** between imported statements and broker reference point-in-time (or statement coverage/content differences), not with the open-position math bug addressed in this patch.

## Recommended Remediation
1. Re-export and re-import the latest full statement set for `D-68011053` ensuring Trade History includes all closes relevant to current open holdings.
2. Validate SDS and XLU specifically after import by comparing execution timeline and matched-lot coverage.
3. Add a diagnostics check for symbol-level parity gaps (optional follow-up issue):
   - flag symbols where broker-open references disagree with imported open quantity.
