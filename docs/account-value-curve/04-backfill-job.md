# Story 04 — Daily Valuation Backfill: AccountValueSnapshot + Reconciliation

## Context primer

Read `00-overview.md` §2 (locked decisions — note **cash from `CashEvent`**, **reconstructed
source of truth**), §3, §7. With story 02 (`computeHoldingsAsOf`) and story 03
(`HistoricalMark` for equities), we can now value each account on each trading day and
materialize it into `AccountValueSnapshot` (story 01). This story is the engine + the CLI job.

## Goal

For each account in scope and each trading day in range:

1. Reconstruct holdings as-of the day (`computeHoldingsAsOf`).
2. Mark each holding using `HistoricalMark` for that `instrumentKey` + date.
3. Compute `equityValue`, `optionValue`, `cashValue`, `totalValue`,
   `unpricedPositionCount`.
4. Attach `brokerNlv` + `reconcileDelta` from `DailyAccountSnapshot` when present.
5. **Upsert** one `AccountValueSnapshot` row per account/day.

## Out of scope

- MFE/MAE (story 08).
- The read API (story 05) and UI (story 06).
- Option *ingestion* (story 07) — but this engine must already handle option holdings: if an
  option's mark is missing, count it in `unpricedPositionCount` and value it at 0. Once story
  07 backfills option marks, re-running this job fills in `optionValue`.

## Cash computation (decision: from `CashEvent`)

`cashValue(account, D)` = `startingCapital(account)` + Σ `CashEvent.amount` where
`eventDate <= endOfDay(D)`.

- Get `startingCapital` via the existing `getStartingCapitalSummary` /
  `Account.startingCapital` path used elsewhere (see
  `src/lib/accounts/starting-capital.ts`).
- **Sub-task — verify CashEvent semantics before trusting the sum.** Enumerate the distinct
  `CashEvent.rowType` values in the DB and confirm which represent real cash movements
  (deposits, withdrawals, fees, trade cash flows). If trade proceeds are *already* implied by
  reconstructed positions, including them in cash would double-count. Document the rowType
  treatment in a comment and a short note in this folder (`04a-cash-rowtypes.md`) so reviewers
  can validate. If unclear, prefer the interpretation that makes `totalValue` reconcile most
  closely to `DailyAccountSnapshot.totalCash`/`brokerNlv` and log the delta.

> ⚠️ This reconciliation is expected to be imperfect (assignments, expirations, dividends,
> fees not in cost basis). That is why `reconcileDelta` is a first-class, visible column — do
> not hide discrepancies.

## Marking

For each holding from `computeHoldingsAsOf`:

- Look up `HistoricalMark` by `(instrumentKey, markDate = D)`.
  - If no mark on exactly `D` (e.g. thin option, holiday mismatch), fall back to the most
    recent mark with `markDate <= D` within a small window (e.g. 5 trading days). If still
    none → unpriced.
- `marketValue = close * netQty * (assetClass === "OPTION" ? 100 : 1)`.
- `equityValue` = Σ market value of EQUITY holdings; `optionValue` = Σ for OPTION.
- `unpricedPositionCount` = count of holdings with no usable mark.

`totalValue = cashValue + equityValue + optionValue`.

`source`:
- `RECONSTRUCTED` always (reconstructed is source of truth).
- Set `brokerNlv` from `DailyAccountSnapshot.brokerNetLiquidationValue` for that account/date
  if present; `reconcileDelta = brokerNlv - totalValue` (else null).

## Files to create

- `src/lib/analysis/value-snapshot-engine.ts` — pure-ish function:
  `computeAccountValueForDate(holdings, marksByKey, cashValue, brokerNlv?) => {...}`.
- `src/lib/analysis/backfill-value-snapshots.ts` — orchestration over accounts × trading days.
- `scripts/backfill-value-snapshots.ts` — `tsx` CLI (mirror `scripts/rebuild-pnl.ts`).
- Tests: `value-snapshot-engine.test.ts`.
- `package.json`: add `backfill:value-snapshots` script.
- `04a-cash-rowtypes.md` — short note documenting the `CashEvent.rowType` treatment (output of
  the sub-task above).

## Trading-day calendar

Use the set of `markDate`s present in `HistoricalMark` as the trading-day calendar (the flat
files only exist for trading days). Iterate those dates within range rather than all calendar
days — this avoids producing snapshots for weekends/holidays and keeps the series aligned to
real market days. Restrict to dates `>= ` the account's first `Execution.tradeDate`.

## Performance

- Batch-load `HistoricalMark` for the full range + symbol universe once into an in-memory
  `Map<instrumentKey, Map<markDateISO, close/high/low>>`, rather than querying per day.
- Batch-load executions, matched lots, adjustments, and cash events per account once; pass
  slices to the engine. Don't re-query inside the day loop.
- Upsert snapshots in chunks (e.g. `Promise.all` over batches) to keep the DB busy without
  exhausting the pool.

## CLI contract

```
npm run backfill:value-snapshots -- [--accountIds id1,id2] [--start YYYY-MM-DD] [--end YYYY-MM-DD]
# no --accountIds => all accounts
# no --start      => earliest Execution.tradeDate across scope
# no --end        => latest HistoricalMark.markDate (or yesterday)
```

Idempotent: re-running upserts (unique `(accountId, snapshotDate)`), so it can run after
story 07 lands to fill option values.

## Acceptance criteria

- [ ] Engine splits value into cash/equity/option/total and counts unpriced positions.
- [ ] `cashValue` uses `startingCapital + cumulative CashEvent` with documented rowType
      treatment (`04a-cash-rowtypes.md`).
- [ ] `brokerNlv` + `reconcileDelta` populated when a `DailyAccountSnapshot` exists for the
      day; null otherwise.
- [ ] Iterates only real trading days (from `HistoricalMark`), from first trade date forward.
- [ ] Upserts are idempotent; re-run after option ingest fills `optionValue`.
- [ ] Engine is unit-tested (mark hit, mark miss → unpriced, option ×100, reconcile delta,
      missing broker NLV).
- [ ] `npm run typecheck && npm run lint && npm test` pass.

## Test plan

`value-snapshot-engine.test.ts` (vitest), fixture holdings + a marks map:

1. Equity + option both priced → correct split, total, source.
2. Option mark missing → counted in `unpricedPositionCount`, valued 0, equity still correct.
3. Broker NLV present → `reconcileDelta = brokerNlv - total`.
4. Broker NLV absent → `brokerNlv` and `reconcileDelta` null.
5. Cash-only account (no holdings) → `totalValue == cashValue`.

(The orchestrator/CLI is validated by manual smoke against a seeded DB; the engine carries
the unit coverage.)

## Dependencies

Stories 01, 02, 03. (07 optional — engine handles missing option marks gracefully until
then.)
