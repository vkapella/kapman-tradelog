-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "data_revision" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "position_snapshots" ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "inputs_read_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "position_snapshot_accounts" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "inputs_revision" BIGINT,
    "cash" DECIMAL(20,6) NOT NULL,
    "equity_market_value" DECIMAL(20,6) NOT NULL,
    "option_market_value" DECIMAL(20,6) NOT NULL,
    "securities_market_value" DECIMAL(20,6) NOT NULL,
    "reconstructed_nlv" DECIMAL(20,6),
    "broker_nlv" DECIMAL(20,6),
    "starting_capital" DECIMAL(20,6) NOT NULL,
    "realized_pnl" DECIMAL(20,6) NOT NULL,
    "cash_adjustments" DECIMAL(20,6) NOT NULL,
    "manual_adjustments" DECIMAL(20,6) NOT NULL,
    "unrealized_pnl" DECIMAL(20,6),
    "total_gain" DECIMAL(20,6),
    "unexplained_delta" DECIMAL(20,6),
    "marks_as_of" TIMESTAMP(3),
    "cash_as_of" TIMESTAMP(3),
    "broker_nlv_as_of" TIMESTAMP(3),
    "missing_mark_count" INTEGER NOT NULL DEFAULT 0,
    "stale_mark_count" INTEGER NOT NULL DEFAULT 0,
    "stale_mark_as_of" TEXT,
    "status" TEXT NOT NULL,
    "positions_json" TEXT NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "position_snapshot_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "position_snapshot_accounts_account_id_inputs_revision_run_i_idx" ON "position_snapshot_accounts"("account_id", "inputs_revision" DESC, "run_id");

-- CreateIndex
CREATE UNIQUE INDEX "position_snapshot_accounts_run_id_account_id_key" ON "position_snapshot_accounts"("run_id", "account_id");

-- AddForeignKey
ALTER TABLE "position_snapshot_accounts" ADD CONSTRAINT "position_snapshot_accounts_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "position_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_snapshot_accounts" ADD CONSTRAINT "position_snapshot_accounts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

