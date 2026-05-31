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
