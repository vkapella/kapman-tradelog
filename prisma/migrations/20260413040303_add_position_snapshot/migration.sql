-- CreateEnum
CREATE TYPE "PositionSnapshotStatus" AS ENUM ('PENDING', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "position_snapshots" (
    "id" TEXT NOT NULL,
    "account_ids" TEXT NOT NULL,
    "snapshot_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PositionSnapshotStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "positions_json" TEXT NOT NULL,
    "unrealized_pnl" DECIMAL(20,6),
    "realized_pnl" DECIMAL(20,6),
    "cash_adjustments" DECIMAL(20,6),
    "manual_adjustments" DECIMAL(20,6),
    "current_nlv" DECIMAL(20,6),
    "starting_capital" DECIMAL(20,6),
    "total_gain" DECIMAL(20,6),
    "unexplained_delta" DECIMAL(20,6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "position_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "position_snapshots_snapshot_at_idx" ON "position_snapshots"("snapshot_at" DESC);
