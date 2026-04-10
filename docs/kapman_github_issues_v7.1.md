# KapMan GitHub Issues — v7.1 Bug Sprint

**Statement date:** 2026-04-09  
**Audit basis:** Raw broker statements for D-68011053 and D-68011054 vs. dashboard screenshot (v7.0)  
**Generated:** 2026-04-10  
**Prior reference:** `kapman_v7_as_built_inventory.md`, `kapman_build_spec_v7.md`

---

## Verified Discrepancy Summary

| Account | Metric | Dashboard | Statement | Variance | Direction |
|---|---|---|---|---|---|
| D-68011054 | Cash | $90,568.90 | $42,776.36 | +$47,792.54 | OVERSTATEMENT |
| D-68011054 | NLV | $138,389.90 | $90,653.36 | +$47,736.54 | OVERSTATEMENT |
| D-68011053 | Cash | $85,029.22 | $86,657.95 | −$1,628.73 | UNDERSTATEMENT |
| D-68011053 | NLV | $206,565.29 | $195,172.55 | +$11,392.74 | OVERSTATEMENT |

**Root cause split:**

| Account | Stale-Cash Error | Open-Position Valuation Error | Total NLV Error |
|---|---|---|---|
| D-68011054 | +$47,792.54 | −$56.00 (within noise) | +$47,736.54 |
| D-68011053 | −$1,628.73 | +$13,021.47 | +$11,392.74 |

Account 54 is almost entirely a cash-staleness problem.  
Account 53 has both stale cash **and** a separate open-position overvaluation of ~$13K.

---

## ISSUE-001 · [P0] Account Balances widget uses stale snapshot balance instead of current statement cash

**Labels:** `bug`, `p0`, `account-balances`, `nlv`, `data-pipeline`

### Summary

`useNetLiquidationValue` anchors its cash component to `latestSnapshotBalance`, which is the most recent `DailyAccountSnapshot.balance` row. That row is a **start-of-day** balance loaded at import time. It does not update as intraday trades occur, and it does not reflect the broker's final end-of-day Total Cash figure for the statement date.

As of 2026-04-09, the dashboard shows the following cash values, which match **start-of-day BAL rows from prior dates**, not the current statement totals:

| Account | Dashboard Cash | Actual Snapshot Source | Statement Total Cash | Error |
|---|---|---|---|---|
| D-68011054 | $90,568.90 | 4/6/26 start-of-day BAL | $42,776.36 | +$47,792.54 |
| D-68011053 | $85,029.22 | 4/5–4/6/26 start-of-day BAL | $86,657.95 | −$1,628.73 |

For account 54, the discrepancy is severe: the account bought $65,000+ in equities on 4/9 (SPHQ, QQQM), draining the cash ledger, but the snapshot had not been updated to reflect those trades.

### Reproduction steps

1. Import the 2026-04-09 statements for both accounts.
2. Open Dashboard → Account Balances + NLV widget.
3. Observe Cash values for D-68011054 and D-68011053.
4. Compare to `Total Cash` line in each imported statement.

### Expected behavior

`latestCash` should resolve to the **statement-date Total Cash** value from the most recently imported statement for that account, not the most recent `DailyAccountSnapshot.balance` row.

### Acceptance criteria

- [ ] For D-68011054 on 2026-04-09: widget Cash = $42,776.36 (±$1.00 rounding tolerance)
- [ ] For D-68011053 on 2026-04-09: widget Cash = $86,657.95 (±$1.00)
- [ ] Widget displays an explicit `as-of` date matching the statement date

### Fix approach

**Option A — Parse and store `Total Cash` from statement**

The broker statement emits a `"Total Cash $X"` line in the Account Summary section. The import adapter should parse this field and store it on a new or existing model field (e.g., `DailyAccountSnapshot.totalCash`). `useNetLiquidationValue` should prefer `totalCash` over `balance` when available.

**Option B — Use the last TRD row's running balance**

The Cash Balance section of the statement ends with the final intraday TRD entry whose `BALANCE` column reflects end-of-day cash. The adapter can identify this as the authoritative cash floor and store it separately.

**Option C — Derive cash from executions (not recommended)**

Reconstruct cash by summing all execution amounts from the `Execution` table. Fragile across import gaps; not recommended as primary fix.

**Recommended:** Option A is cleanest and most resilient. If adapter changes are out of scope for this sprint, Option B is a simpler parse-time fix.

---

## ISSUE-002 · [P0] NLV is time-inconsistent — stale cash is mixed with current-date position marks

**Labels:** `bug`, `p0`, `nlv`, `account-balances`, `data-consistency`

### Summary

The NLV formula in `useNetLiquidationValue` adds three components:

```
NLV = latestSnapshotBalance + equityMarkValue + optionMarkValue
```

The problem is that these three components have **different effective timestamps**:

| Component | Effective date |
|---|---|
| `latestSnapshotBalance` | 4/6/26 start-of-day (stale) |
| `equityMarkValue` | Live or near-live Schwab quote |
| `optionMarkValue` | Live or near-live Schwab quote |

This mixing means the NLV figure is internally incoherent. Even if the formula is algebraically correct, the inputs are from different points in time, producing a number that does not correspond to any real account state.

For D-68011054, this produces a $47,736 overstatement. For D-68011053, the combined effect is an $11,392 overstatement.

### Cross-check: Account 54 position component

| | Dashboard | Statement | Delta |
|---|---|---|---|
| Implied open-position value | $47,821.00 | $47,877.00 | −$56.00 |

The $56 delta for account 54 is within quote-spread noise. This confirms the position marks are broadly correct — the entire NLV error on account 54 is the stale cash anchor.

### Expected behavior

All three inputs to NLV (cash, equity marks, option marks) must share the same effective as-of timestamp, displayed to the user explicitly.

### Acceptance criteria

- [ ] NLV widget shows an `as-of` timestamp
- [ ] Cash and position marks are from the same effective date
- [ ] NLV for D-68011054 on 2026-04-09 reconciles to $90,653.36 (±$200 for live quote variance)
- [ ] NLV for D-68011053 on 2026-04-09 reconciles to $195,172.55 (±$500 for live quote variance)

### Fix approach

Once ISSUE-001 is resolved (cash is current), confirm that the position reconstruction (ISSUE-003) is also resolved. With both inputs current, NLV should reconcile. Add a timestamp display showing the statement date and quote-as-of time.

---

## ISSUE-003 · [P0] Account 53 open-position valuation is overstated by ~$13,000

**Labels:** `bug`, `p0`, `open-positions`, `nlv`, `position-reconstruction`

### Summary

After correcting for stale cash, account D-68011053 still has a residual NLV overstatement driven by the **open-position component**:

| | Dashboard | Statement | Delta |
|---|---|---|---|
| Cash | $85,029.22 | $86,657.95 | −$1,628.73 |
| Implied open-position value | $121,536.07 | $108,514.60 | +$13,021.47 |
| Total NLV | $206,565.29 | $195,172.55 | +$11,392.74 |

The statement's `Profits and Losses` section gives `OVERALL TOTALS Mark Value = $108,514.60`, which is the broker's authoritative open-position market value as of 2026-04-09. The dashboard implies $121,536 — a ~12% overstatement of the position book.

Account 54 does **not** exhibit this problem (position delta is only −$56, within noise).

### Likely causes (in priority order)

| Rank | Candidate | How to test |
|---|---|---|
| 1 | `useOpenPositions` reconstructs positions that are already closed — TO_OPEN executions matched in T2 are not fully excluded | Diff `openExecutionId` set in matched lots against all TO_OPEN executions for account 53 |
| 2 | Wrong account attribution: one or more positions assigned to account 53 that belong to another account | Join `Execution.accountId` to `Account.id` and verify external account IDs for all open 53 positions |
| 3 | Duplicate position rows for a symbol where two executions share similar instrument keys | Check for duplicate `instrumentKey` groups in `useOpenPositions` output for account 53 |
| 4 | Net quantity computed incorrectly for a multi-leg position (e.g., a spread treated as two longs instead of one long + one short) | Compare dashboard open qty per symbol to statement open qty per symbol |
| 5 | Quote applied to wrong multiplier (e.g., option mark × 100 applied to a stock position) | Review `assetClass` detection logic in `useOpenPositions` |

### Reproduction steps

1. Load dashboard with only D-68011053 selected.
2. Open the Open Positions page and note all positions with their quantities and mark values.
3. Compare to the `Equities` and `Options` sections in the 2026-04-09 statement for D-68011053.
4. Identify any position in the app that does not appear in the statement, or any quantity that differs.

### Expected behavior

The sum of `equityMarkValue + optionMarkValue` from `useNetLiquidationValue` for D-68011053 should equal the statement implied open-position value of $108,514.60 (±$500 for live quote drift).

### Acceptance criteria

- [ ] Open Positions page for D-68011053 shows the same instruments as the statement
- [ ] Net quantity per instrument matches statement
- [ ] Sum of mark values = $108,514.60 (±$500)
- [ ] NLV after cash fix reconciles to $195,172.55 (±$500)

### Fix approach

1. Add a diagnostic log or endpoint that dumps the raw output of `useOpenPositions` for a given account (symbol, netQty, costBasis, assetClass, mark).
2. Compare against statement line by line.
3. If phantom positions are found: strengthen the `openExecutionId` exclusion set to catch all matched closing legs.
4. If wrong account: audit the `accountId` foreign key chain from `Execution` → `Account` → external ID mapping.
5. If duplicate: add a dedup guard keyed on `instrumentKey + accountId` in position grouping.

---

## ISSUE-004 · [P1] Import adapter does not parse or store `Total Cash` from statement Account Summary

**Labels:** `enhancement`, `p1`, `adapter`, `data-pipeline`

### Summary

The broker statement's Account Summary section contains a `Total Cash` line that is the authoritative end-of-day cash figure. The current adapter (`tdameritrade` or equivalent) parses the `Cash Balance` section (BAL rows) and the `Profits and Losses` section, but does not extract or store `Total Cash`.

Without this field, the app cannot distinguish:
- start-of-day cash (BAL row) — what the app currently uses
- end-of-day cash after all intraday trades (Total Cash) — what users expect

### Statement evidence

```
Account Summary
Net Liquidating Value,  "$90,653.36"
Total Cash              "$42,776.36"   ← NOT currently stored
```

### Acceptance criteria

- [ ] Adapter parses `Total Cash` from Account Summary section for each imported statement
- [ ] Value is stored on a model accessible to `useNetLiquidationValue` (new field or separate record)
- [ ] Existing BAL-row ingestion is unaffected
- [ ] `useNetLiquidationValue` preferentially reads `totalCash` over the latest snapshot `balance`

---

## ISSUE-005 · [P1] Import adapter does not parse or store broker-reported NLV

**Labels:** `enhancement`, `p1`, `adapter`, `reconciliation`

### Summary

The broker statement's Account Summary section also contains `Net Liquidating Value`. Storing this value enables a reconciliation harness (ISSUE-007) and a sanity check on the app's computed NLV.

### Acceptance criteria

- [ ] Adapter parses `Net Liquidating Value` from Account Summary
- [ ] Value stored per account per statement date
- [ ] Accessible via an API endpoint or diagnostic query
- [ ] Used as ground-truth input for ISSUE-007 reconciliation tests

---

## ISSUE-006 · [P1] Equity Curve trails live data by 3+ days due to snapshot ingestion lag

**Labels:** `bug`, `p1`, `equity-curve`, `snapshots`

### Summary

The Equity Curve widget ends at approximately 2026-04-06, even though statements dated 2026-04-09 have been imported. The curve reflects snapshot rows, and snapshot rows are only as current as the last successfully committed import.

This lag directly enables ISSUE-001 and ISSUE-002: because the snapshot series doesn't include 4/9 data, the "latest" snapshot balance for account 54 is the 4/6 BAL, which is $90,568.90 instead of $42,776.36.

The as-built inventory notes: `"only the most recent 500 snapshot rows are available from the summary route"`. If the 500-row cap is cutting off recent data, this is a contributing factor.

### Acceptance criteria

- [ ] After importing a statement dated 2026-04-09, the equity curve extends to 2026-04-09
- [ ] The 500-row cap does not silently truncate recent snapshots in favor of older ones
- [ ] The latest snapshot row per account reflects end-of-day cash from the most recent imported statement

---

## ISSUE-007 · [P1] Add broker-statement reconciliation test suite

**Labels:** `testing`, `p1`, `reconciliation`, `data-pipeline`

### Summary

There is currently no automated check that compares imported statement totals against dashboard-computed values. This allowed the $47K and $11K NLV errors to go undetected.

### Proposed test harness

For each account and imported statement date, assert:

| Test | Condition |
|---|---|
| Cash reconciliation | `dashboard cash == statement Total Cash` (±$1.00) |
| NLV reconciliation | `dashboard NLV == statement Net Liquidating Value` (±$500 for live quote drift) |
| Position value reconciliation | `sum(mark values from open positions) == statement implied open-position value` (±$500) |
| Equity count | positions in dashboard == line items in statement Equities section |
| Option count | positions in dashboard == line items in statement Options section |

### Acceptance criteria

- [ ] Test runs as part of CI after any import commit
- [ ] Test surfaces specific line-level discrepancies, not just aggregate deltas
- [ ] Threshold tolerances are configurable (default: $1.00 for cash, $500 for NLV)
- [ ] Test covers both D-68011053 and D-68011054 using the 2026-04-09 statements

---

## ISSUE-008 · [P2] NLV widget missing as-of timestamp

**Labels:** `ux`, `p2`, `account-balances`

### Summary

The Account Balances + NLV widget shows a timestamp (e.g., `3:43:30 PM`) that reflects the quote-fetch time, not the cash snapshot date. There is no indication of which date the cash balance is sourced from.

When the cash is stale (e.g., 4/6 instead of 4/9), users have no way to detect this from the UI.

### Acceptance criteria

- [ ] Widget displays `Cash as of: YYYY-MM-DD` using the statement date of the snapshot
- [ ] Widget displays `Marks as of: HH:MM` using the quote timestamp
- [ ] If cash date ≠ quote date, widget shows a staleness warning (e.g., amber border or icon)

---

## ISSUE-009 · [P2] Progress bar in Account Balances widget uses hardcoded $100K reference

**Labels:** `ux`, `p2`, `account-balances`

### Summary

From the as-built inventory: `"Progress bar: clamp((value / 100000) * 100, 0, 100) — Rough scale against an implicit $100k reference"`.

Account 53's NLV of ~$195K will clip at 100% and render identically to a $200K account. This is misleading and has no financial meaning.

### Acceptance criteria

- [ ] Progress bar denominator is derived from the account's initial deposit or configurable max, not hardcoded
- [ ] OR: remove the progress bar and replace with a plain NLV figure with trend indicator

---

## ISSUE-010 · [P3] Net P&L KPI strip ignores account selector

**Labels:** `ux`, `p3`, `kpi-strip`, `account-selector`

### Summary

From the as-built inventory: `"Account-filter behavior: global only, not selector-aware"`.

The Net P&L value in the KPI strip is always the sum across all accounts regardless of which accounts are selected in the global selector. If a user selects only D-68011054, Net P&L still includes D-68011053 realized P&L.

### Acceptance criteria

- [ ] Net P&L in KPI strip filters by the global account selector
- [ ] All KPI strip values respond to selector state, or a banner is shown indicating "Global — ignores account filter"

---

## Fix Plan and Sprint Order

| Priority | Issue | Effort | Dependency |
|---|---|---|---|
| P0 | ISSUE-001: Stale cash anchor | Medium | None — adapter + hook change |
| P0 | ISSUE-003: Account 53 position overvaluation | Medium | Requires diagnostic logging first |
| P0 | ISSUE-002: NLV time-consistency | Low | Resolved by ISSUE-001 + ISSUE-003 |
| P1 | ISSUE-004: Parse Total Cash in adapter | Low | Prerequisite for ISSUE-001 Option A |
| P1 | ISSUE-005: Parse broker NLV in adapter | Low | Prerequisite for ISSUE-007 |
| P1 | ISSUE-006: Snapshot lag / 500-row cap | Medium | Independent |
| P1 | ISSUE-007: Reconciliation test suite | Medium | Requires ISSUE-004 + ISSUE-005 |
| P2 | ISSUE-008: as-of timestamp in widget | Low | After ISSUE-001 |
| P2 | ISSUE-009: Progress bar hardcoded reference | Low | Independent |
| P3 | ISSUE-010: KPI strip account-selector filter | Low | Independent |

### Recommended sprint sequence

**Sprint 1 (unblock NLV correctness)**
1. ISSUE-004 — parse Total Cash from adapter
2. ISSUE-005 — parse broker NLV from adapter
3. ISSUE-001 — fix `latestCash` to use parsed Total Cash
4. ISSUE-002 — add as-of consistency check and display
5. ISSUE-006 — investigate and fix snapshot 500-row cap

**Sprint 2 (fix position valuation and add tests)**
1. ISSUE-003 — diagnose and fix account 53 position overstatement
2. ISSUE-007 — add reconciliation test harness
3. ISSUE-008 — add as-of timestamp to widget

**Sprint 3 (UX cleanup)**
1. ISSUE-009 — fix progress bar
2. ISSUE-010 — account selector for KPI strip

---

## Not a Bug: Net P&L vs Top Setups by P&L

The dashboard KPI strip shows Net P&L = −$1,756.28 while the Top Setups by P&L widget shows only positive winners. This is **expected and correct behavior**.

| Item | What it measures |
|---|---|
| Net P&L (KPI strip) | Total realized P&L across **all** T2 matched lots (all accounts, all setups, all outcomes) |
| Top Setups by P&L | Top 10 setup groups ranked by realized P&L — **positive values only** |

Large losers not in the top-10 positive list cause the total to be negative even when the displayed setups are all winners. The two metrics measure different things and are not expected to have the same sign.

However, Net P&L cannot be fully reconciled against broker statements from this audit because:
- Dashboard Net P&L = realized T2 P&L only
- Statement P&L YTD = open + closed combined

A full T2-level realized P&L audit would require matching every closed lot in the FIFO ledger against statement trade history, which is outside the scope of this issue set.

---

*Audit performed using raw statements: `2026-04-09-AccountStatement-53.csv`, `2026-04-09-AccountStatement-54.csv`*  
*Reference docs: `kapman_build_spec_v7.md`, `kapman_v7_as_built_inventory.md`*  
*Math verification: independent Python reconciliation script, 2026-04-10*
