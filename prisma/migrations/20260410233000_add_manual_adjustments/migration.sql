-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('SPLIT', 'QTY_OVERRIDE', 'PRICE_OVERRIDE', 'ADD_POSITION', 'REMOVE_POSITION');

-- CreateEnum
CREATE TYPE "AdjustmentStatus" AS ENUM ('ACTIVE', 'REVERSED');

-- CreateTable
CREATE TABLE "manual_adjustments" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "effective_date" TIMESTAMP(3) NOT NULL,
    "adjustment_type" "AdjustmentType" NOT NULL,
    "payload_json" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence_ref" TEXT,
    "status" "AdjustmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "reversed_by_adjustment_id" TEXT,
    "account_id" TEXT NOT NULL,

    CONSTRAINT "manual_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manual_adjustments_account_id_symbol_effective_date_idx" ON "manual_adjustments"("account_id", "symbol", "effective_date");

-- CreateIndex
CREATE INDEX "manual_adjustments_status_effective_date_idx" ON "manual_adjustments"("status", "effective_date");

-- AddForeignKey
ALTER TABLE "manual_adjustments" ADD CONSTRAINT "manual_adjustments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_adjustments" ADD CONSTRAINT "manual_adjustments_reversed_by_adjustment_id_fkey" FOREIGN KEY ("reversed_by_adjustment_id") REFERENCES "manual_adjustments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
