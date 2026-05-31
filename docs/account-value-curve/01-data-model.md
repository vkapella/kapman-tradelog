# Story 01 — Data Model: HistoricalMark, AccountValueSnapshot, LotExcursion

## Context primer

Read `00-overview.md` §3, §5, §7, §10 first. This repo is Next.js + Prisma 5.14 +
PostgreSQL. Models live in `prisma/schema.prisma` using the existing conventions: `cuid()`
ids, `@map`/`@@map` snake_case, `Decimal(20, 6)` for money/quantities, explicit `@@unique`
and `@@index`. This story only adds schema + a migration. No business logic.

## Goal

Add three tables that the rest of the project reads/writes:

1. `HistoricalMark` — daily OHLC per instrument (equities and option contracts).
2. `AccountValueSnapshot` — the materialized daily value series the screen reads.
3. `LotExcursion` — per-`MatchedLot` MFE/MAE (populated in story 08).

## Out of scope

- Any ingestion, compute, API, or UI. Other stories own those.
- Backfilling data. This story only defines structure + migration.

## Files to modify/create

- `prisma/schema.prisma` (add models below).
- New migration via `npx prisma migrate dev --name add_value_curve_models`.

## Schema to add

```prisma
enum MarkAssetClass {
  EQUITY
  OPTION
}

enum MarkSource {
  MASSIVE_S3
  POLYGON_REST
  MANUAL
}

enum ValueSnapshotSource {
  RECONSTRUCTED
  BROKER_NLV
  MIXED
}

/// Daily OHLC for one instrument (equity symbol or option contract).
/// instrumentKey is the canonical key defined in 00-overview §7.
model HistoricalMark {
  id            String         @id @default(cuid())
  instrumentKey String         @map("instrument_key")
  assetClass    MarkAssetClass @map("asset_class")
  /// Equity: symbol. Option: underlying symbol. Useful for filtering/backfill.
  symbol        String
  markDate      DateTime       @map("mark_date") @db.Date
  open          Decimal        @db.Decimal(20, 6)
  high          Decimal        @db.Decimal(20, 6)
  low           Decimal        @db.Decimal(20, 6)
  close         Decimal        @db.Decimal(20, 6)
  volume        Decimal?       @db.Decimal(28, 6)
  source        MarkSource     @default(MASSIVE_S3)
  createdAt     DateTime       @default(now()) @map("created_at")
  updatedAt     DateTime       @updatedAt @map("updated_at")

  @@unique([instrumentKey, markDate])
  @@index([symbol, markDate])
  @@index([markDate])
  @@map("historical_marks")
}

/// Materialized daily account value, split by asset class. One row per account/date.
/// This is what GET /api/analysis/account-value-series reads.
model AccountValueSnapshot {
  id                        String              @id @default(cuid())
  snapshotDate              DateTime            @map("snapshot_date") @db.Date
  cashValue                 Decimal             @map("cash_value") @db.Decimal(20, 6)
  equityValue               Decimal             @map("equity_value") @db.Decimal(20, 6)
  optionValue               Decimal             @map("option_value") @db.Decimal(20, 6)
  totalValue                Decimal             @map("total_value") @db.Decimal(20, 6)
  /// Broker-reported NLV for this date if available (for reconciliation only).
  brokerNlv                 Decimal?            @map("broker_nlv") @db.Decimal(20, 6)
  /// brokerNlv - totalValue when both present; null otherwise.
  reconcileDelta            Decimal?            @map("reconcile_delta") @db.Decimal(20, 6)
  /// Count of held instruments with no mark on this date (data-quality signal).
  unpricedPositionCount     Int                 @default(0) @map("unpriced_position_count")
  source                    ValueSnapshotSource @default(RECONSTRUCTED)
  createdAt                 DateTime            @default(now()) @map("created_at")
  updatedAt                 DateTime            @updatedAt @map("updated_at")

  accountId String  @map("account_id")
  account   Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@unique([accountId, snapshotDate])
  @@index([snapshotDate])
  @@map("account_value_snapshots")
}

/// Per matched-lot maximum favorable / adverse excursion. Populated by story 08.
model LotExcursion {
  id              String   @id @default(cuid())
  /// $ best unrealized gain during the holding window (>= 0 expected, but store raw).
  mfe             Decimal  @db.Decimal(20, 6)
  /// $ worst unrealized loss during the holding window (<= 0 expected, but store raw).
  mae             Decimal  @db.Decimal(20, 6)
  /// As a fraction of cost basis (e.g. 0.25 = +25%). Null if cost basis is 0.
  mfePct          Decimal? @map("mfe_pct") @db.Decimal(12, 6)
  maePct          Decimal? @map("mae_pct") @db.Decimal(12, 6)
  mfeDate         DateTime? @map("mfe_date") @db.Date
  maeDate         DateTime? @map("mae_date") @db.Date
  /// Number of trading days in the window that had a usable mark.
  pricedDays      Int      @default(0) @map("priced_days")
  /// Number of trading days in the window with NO mark (data-quality signal).
  unpricedDays    Int      @default(0) @map("unpriced_days")
  computedAt      DateTime @default(now()) @map("computed_at")

  matchedLotId String     @unique @map("matched_lot_id")
  matchedLot   MatchedLot @relation(fields: [matchedLotId], references: [id], onDelete: Cascade)

  @@map("lot_excursions")
}
```

## Required relation edits on existing models

Add the back-relations so Prisma validates:

- On `model Account`: add `valueSnapshots AccountValueSnapshot[]`.
- On `model MatchedLot`: add `excursion LotExcursion?`.

## Design notes (why these choices)

- `@db.Date` (not `DateTime`) for `markDate`/`snapshotDate`: these are calendar days, no
  time component. Avoids timezone drift when joining holdings (as-of a date) to marks.
- `HistoricalMark` unique on `(instrumentKey, markDate)`: enables idempotent upsert during
  backfill (story 03/07 re-runs must not duplicate).
- `AccountValueSnapshot` unique on `(accountId, snapshotDate)`: one materialized row per
  account/day; the backfill job (story 04) upserts.
- `reconcileDelta` and `unpricedPositionCount` are persisted (not computed on read) so the UI
  can show data-quality without recomputation.
- `LotExcursion` 1:1 with `MatchedLot` via `@unique` FK; cascade delete keeps it consistent
  when lots are rebuilt by `rebuild-pnl`.

## Acceptance criteria

- [ ] Three models + three enums added to `prisma/schema.prisma`.
- [ ] Back-relations added to `Account` and `MatchedLot`.
- [ ] `npx prisma migrate dev --name add_value_curve_models` generates a migration and applies
      cleanly to a fresh DB.
- [ ] `npx prisma generate` succeeds; `npm run typecheck` passes.
- [ ] No changes to existing columns/tables (additive only).

## Test plan

- `npm run typecheck` — Prisma client types compile.
- Manual: `npx prisma migrate reset --force` then confirm the three tables exist
  (`npx prisma studio` or `psql \dt`).
- No unit tests required for a pure schema story.

## Dependencies

None. This is the first story; everything else depends on it.
