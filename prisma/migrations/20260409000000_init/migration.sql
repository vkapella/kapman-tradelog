-- CreateEnum
CREATE TYPE "Broker" AS ENUM ('SCHWAB_THINKORSWIM', 'FIDELITY');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'PARSED', 'COMMITTED', 'FAILED');

-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('EQUITY', 'OPTION', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('TRADE', 'EXPIRATION_INFERRED', 'ASSIGNMENT', 'EXERCISE');

-- CreateEnum
CREATE TYPE "Side" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OpeningClosingEffect" AS ENUM ('TO_OPEN', 'TO_CLOSE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "broker" "Broker" NOT NULL,
    "paper_money" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imports" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "broker" "Broker" NOT NULL,
    "status" "ImportStatus" NOT NULL,
    "parsed_rows" INTEGER NOT NULL DEFAULT 0,
    "persisted_rows" INTEGER NOT NULL DEFAULT 0,
    "skipped_rows" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "account_id" TEXT NOT NULL,

    CONSTRAINT "imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executions" (
    "id" TEXT NOT NULL,
    "broker" "Broker" NOT NULL,
    "event_timestamp" TIMESTAMP(3) NOT NULL,
    "trade_date" TIMESTAMP(3) NOT NULL,
    "event_type" "EventType" NOT NULL DEFAULT 'TRADE',
    "asset_class" "AssetClass" NOT NULL,
    "symbol" TEXT NOT NULL,
    "instrument_key" TEXT,
    "description_raw" TEXT,
    "side" "Side",
    "quantity" DECIMAL(20,6) NOT NULL,
    "price" DECIMAL(20,6),
    "gross_amount" DECIMAL(20,6),
    "fees" DECIMAL(20,6),
    "net_amount" DECIMAL(20,6),
    "opening_closing_effect" "OpeningClosingEffect",
    "underlying_symbol" TEXT,
    "option_type" TEXT,
    "strike" DECIMAL(20,6),
    "expiration_date" TIMESTAMP(3),
    "multiplier" INTEGER,
    "spread_group_id" TEXT,
    "source_row_ref" TEXT,
    "raw_row_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "import_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,

    CONSTRAINT "executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matched_lots" (
    "id" TEXT NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "realized_pnl" DECIMAL(20,6) NOT NULL,
    "holding_days" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "account_id" TEXT NOT NULL,
    "open_execution_id" TEXT NOT NULL,
    "close_execution_id" TEXT,

    CONSTRAINT "matched_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setup_groups" (
    "id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "override_tag" TEXT,
    "underlying_symbol" TEXT NOT NULL,
    "realized_pnl" DECIMAL(20,6),
    "win_rate" DECIMAL(8,4),
    "expectancy" DECIMAL(20,6),
    "average_hold_days" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "account_id" TEXT NOT NULL,

    CONSTRAINT "setup_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setup_group_lots" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setup_group_id" TEXT NOT NULL,
    "matched_lot_id" TEXT NOT NULL,

    CONSTRAINT "setup_group_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_account_snapshots" (
    "id" TEXT NOT NULL,
    "snapshot_date" TIMESTAMP(3) NOT NULL,
    "balance" DECIMAL(20,6) NOT NULL,
    "source_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "account_id" TEXT NOT NULL,

    CONSTRAINT "daily_account_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_account_id_key" ON "accounts"("account_id");

-- CreateIndex
CREATE INDEX "imports_account_id_idx" ON "imports"("account_id");

-- CreateIndex
CREATE INDEX "executions_account_id_idx" ON "executions"("account_id");

-- CreateIndex
CREATE INDEX "executions_import_id_idx" ON "executions"("import_id");

-- CreateIndex
CREATE INDEX "executions_symbol_idx" ON "executions"("symbol");

-- CreateIndex
CREATE INDEX "matched_lots_account_id_idx" ON "matched_lots"("account_id");

-- CreateIndex
CREATE INDEX "setup_groups_account_id_idx" ON "setup_groups"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "setup_group_lots_setup_group_id_matched_lot_id_key" ON "setup_group_lots"("setup_group_id", "matched_lot_id");

-- CreateIndex
CREATE INDEX "daily_account_snapshots_snapshot_date_idx" ON "daily_account_snapshots"("snapshot_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_account_snapshots_account_id_snapshot_date_key" ON "daily_account_snapshots"("account_id", "snapshot_date");

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matched_lots" ADD CONSTRAINT "matched_lots_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matched_lots" ADD CONSTRAINT "matched_lots_open_execution_id_fkey" FOREIGN KEY ("open_execution_id") REFERENCES "executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matched_lots" ADD CONSTRAINT "matched_lots_close_execution_id_fkey" FOREIGN KEY ("close_execution_id") REFERENCES "executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setup_groups" ADD CONSTRAINT "setup_groups_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setup_group_lots" ADD CONSTRAINT "setup_group_lots_setup_group_id_fkey" FOREIGN KEY ("setup_group_id") REFERENCES "setup_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setup_group_lots" ADD CONSTRAINT "setup_group_lots_matched_lot_id_fkey" FOREIGN KEY ("matched_lot_id") REFERENCES "matched_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_account_snapshots" ADD CONSTRAINT "daily_account_snapshots_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
