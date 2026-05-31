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

Treatment for Story 04:

- Include all persisted `CashEvent.amount` rows in the cumulative cash ledger:
  `startingCapital + sum(CashEvent.amount where eventDate <= D)`.
- Do not include `TRD` cash-balance rows here. The thinkorswim parser uses `TRD` rows as trade
  references/fee enrichment, not persisted `CashEvent` rows, so trade proceeds are not counted
  twice against reconstructed holdings.
- `FND`, `DIVIDEND`, and `TRANSFER_IN` are direct cash movements.
- `MONEY_MARKET_*` rows are kept because this app stores them as cash events, not valued
  positions. If those rows prove to be pure sweep bookkeeping for a given account export, the
  resulting mismatch remains visible as `reconcileDelta` against broker NLV instead of being
  hidden.

This matches the locked story decision that `CashEvent` is the cash source of truth while
`DailyAccountSnapshot.totalCash` and broker NLV are reconciliation checks.
