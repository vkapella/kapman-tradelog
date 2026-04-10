# Sprint 1 Complete

## Closed GitHub Issues
- [#34](https://github.com/vkapella/kapman-tradelog/issues/34) — [P1] Import adapter does not parse or store Total Cash from statement
- [#35](https://github.com/vkapella/kapman-tradelog/issues/35) — [P1] Import adapter does not parse or store broker-reported NLV
- [#31](https://github.com/vkapella/kapman-tradelog/issues/31) — [P0] Account Balances widget uses stale snapshot balance instead of current statement cash
- [#32](https://github.com/vkapella/kapman-tradelog/issues/32) — [P0] NLV is time-inconsistent — stale cash mixed with current-date position marks
- [#36](https://github.com/vkapella/kapman-tradelog/issues/36) — [P1] Equity Curve trails live data by 3+ days due to snapshot ingestion lag

## Files Changed
- prisma/migrations/20260410103000_add_snapshot_total_cash/migration.sql
- prisma/migrations/20260410104500_add_snapshot_broker_nlv/migration.sql
- prisma/schema.prisma
- src/app/api/overview/summary/route.ts
- src/components/widgets/AccountBalancesWidget.tsx
- src/hooks/useNetLiquidationValue.ts
- src/lib/adapters/thinkorswim/account-summary.test.ts
- src/lib/adapters/thinkorswim/account-summary.ts
- src/lib/adapters/thinkorswim/trade-history.summary.test.ts
- src/lib/adapters/thinkorswim/trade-history.ts
- src/lib/adapters/types.ts
- src/lib/imports/replace-import-snapshots.ts
- types/api.ts

## Final Typecheck/Lint
- `npm run typecheck` — passed
- `npm run lint` — passed

## Deferred Items / Known Caveats
- Database migrations were added but not executed in this run; apply with Prisma migrate/deploy in the target environment before runtime verification.
- Quote as-of in the NLV widget is based on quote fetch completion time; upstream quote endpoints do not currently provide broker timestamp fields.
