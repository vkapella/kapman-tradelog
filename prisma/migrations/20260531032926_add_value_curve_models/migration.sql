-- CreateEnum
CREATE TYPE "MarkAssetClass" AS ENUM ('EQUITY', 'OPTION');

-- CreateEnum
CREATE TYPE "MarkSource" AS ENUM ('MASSIVE_S3', 'POLYGON_REST', 'MANUAL');

-- CreateEnum
CREATE TYPE "ValueSnapshotSource" AS ENUM ('RECONSTRUCTED', 'BROKER_NLV', 'MIXED');

-- CreateTable
CREATE TABLE "historical_marks" (
    "id" TEXT NOT NULL,
    "instrument_key" TEXT NOT NULL,
    "asset_class" "MarkAssetClass" NOT NULL,
    "symbol" TEXT NOT NULL,
    "mark_date" DATE NOT NULL,
    "open" DECIMAL(20,6) NOT NULL,
    "high" DECIMAL(20,6) NOT NULL,
    "low" DECIMAL(20,6) NOT NULL,
    "close" DECIMAL(20,6) NOT NULL,
    "volume" DECIMAL(28,6),
    "source" "MarkSource" NOT NULL DEFAULT 'MASSIVE_S3',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "historical_marks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_value_snapshots" (
    "id" TEXT NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "cash_value" DECIMAL(20,6) NOT NULL,
    "equity_value" DECIMAL(20,6) NOT NULL,
    "option_value" DECIMAL(20,6) NOT NULL,
    "total_value" DECIMAL(20,6) NOT NULL,
    "broker_nlv" DECIMAL(20,6),
    "reconcile_delta" DECIMAL(20,6),
    "unpriced_position_count" INTEGER NOT NULL DEFAULT 0,
    "source" "ValueSnapshotSource" NOT NULL DEFAULT 'RECONSTRUCTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "account_id" TEXT NOT NULL,

    CONSTRAINT "account_value_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_excursions" (
    "id" TEXT NOT NULL,
    "mfe" DECIMAL(20,6) NOT NULL,
    "mae" DECIMAL(20,6) NOT NULL,
    "mfe_pct" DECIMAL(12,6),
    "mae_pct" DECIMAL(12,6),
    "mfe_date" DATE,
    "mae_date" DATE,
    "priced_days" INTEGER NOT NULL DEFAULT 0,
    "unpriced_days" INTEGER NOT NULL DEFAULT 0,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matched_lot_id" TEXT NOT NULL,

    CONSTRAINT "lot_excursions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "historical_marks_symbol_mark_date_idx" ON "historical_marks"("symbol", "mark_date");

-- CreateIndex
CREATE INDEX "historical_marks_mark_date_idx" ON "historical_marks"("mark_date");

-- CreateIndex
CREATE UNIQUE INDEX "historical_marks_instrument_key_mark_date_key" ON "historical_marks"("instrument_key", "mark_date");

-- CreateIndex
CREATE INDEX "account_value_snapshots_snapshot_date_idx" ON "account_value_snapshots"("snapshot_date");

-- CreateIndex
CREATE UNIQUE INDEX "account_value_snapshots_account_id_snapshot_date_key" ON "account_value_snapshots"("account_id", "snapshot_date");

-- CreateIndex
CREATE UNIQUE INDEX "lot_excursions_matched_lot_id_key" ON "lot_excursions"("matched_lot_id");

-- AddForeignKey
ALTER TABLE "account_value_snapshots" ADD CONSTRAINT "account_value_snapshots_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_excursions" ADD CONSTRAINT "lot_excursions_matched_lot_id_fkey" FOREIGN KEY ("matched_lot_id") REFERENCES "matched_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
