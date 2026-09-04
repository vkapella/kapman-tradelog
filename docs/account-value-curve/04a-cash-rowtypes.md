# Story 04 CashEvent rowType treatment

Local DB row types observed before implementing the backfill:

| rowType | count | sum |
|---|---:|---:|
| DIVIDEND | 1 | 6.55 |
| FND | 27 | 24761.54 |
| MONEY_MARKET_BUY | 3 | -80476.91 |
| MONEY_MARKET_DIVIDEND | 36 | 0 |
| MONEY_MARKET_REDEEM | 9 | 27626.68 |
| TRANSFER_IN | 1 | 52973.60 |

Treatment for Story 04 after cash-reconstruction correction:

- Include trade cash flows derived from executions in the cumulative cash ledger:
  buys reduce cash, sells increase cash, and options use a 100x multiplier.
- Include external persisted `CashEvent.amount` rows in the cumulative cash ledger:
  `startingCapital + trade cash + external CashEvent.amount where date <= D`.
- Do not include `TRD` cash-balance rows here. The thinkorswim parser uses `TRD` rows as trade
  references/fee enrichment, not persisted `CashEvent` rows, so trade proceeds are not counted
  twice against reconstructed holdings.
- `FND`, `DIVIDEND`, and `TRANSFER_IN` are direct cash movements.
- `MONEY_MARKET_*` and `REDEMPTION` rows are internal cash-equivalent sweep bookkeeping for
  the reconstructed value curve. They are excluded from `cashValue` because trade cash flows
  already capture buying-power changes; including sweeps would double-count internal movement
  between cash and money-market funds.

This keeps reconstructed cash from double-counting deployed capital while preserving
`DailyAccountSnapshot.totalCash` and broker NLV as reconciliation checks.

## Fidelity outbound wires (added 2026-09-04, #351)

- `WIRE TRANSFER TO BANK` → `TRANSFER_OUT` and `ADJUST WIRE TRANSFER` → `TRANSFER_ADJUSTMENT`,
  both with the signed amount Fidelity exports (a wire out is negative; an adjustment that
  reverses one is positive). Both are external capital flows (`EXTERNAL_CAPITAL_ROW_TYPES`):
  return-on-capital counts negatives as withdrawals and positives as contributions, and the
  reconstructed cash ledger includes them. Dropping them as unknown actions had overstated the
  Fidelity cash by the $100,000 net that left to fund the corporate Schwab account.

## Live Schwab accounts (added 2026-09-03, #348)

- External funding of a live thinkorswim account arrives as `JRN` ("FUNDS RECEIVED") or
  `WIN` ("WIRED FUNDS RECEIVED") rows, not `FND`. The parser persists both and normalizes
  funding rows to `TRANSFER_IN`, so they count as contributed capital in return-on-capital
  and as cash in the reconstructed ledger. Other `JRN`/`WIN` rows keep their broker type.
- Any other non-BAL row type (`DOI` interest, `ADJ` credits, ...) is not persisted yet and
  raises a `CASH_BALANCE_UNHANDLED_ROW_TYPE` warning with a per-type count.
- Money-market sweeps (`BOT 100000.0 SNSXX`) appear in Trade History as `Spread=FUND`,
  `Type=FUND` and are persisted as EQUITY executions. They reduce cash like any purchase and
  the holding is valued at a constant $1.00 par (`par-value-instruments.ts`) in both the
  value engine and the live position snapshot. This matches the broker statement line for
  line: cash 0, fund position at NAV, NLV = the sum.

