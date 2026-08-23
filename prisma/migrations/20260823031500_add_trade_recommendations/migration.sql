-- CreateEnum
CREATE TYPE "RecommendationPass" AS ENUM ('PASS1', 'PASS2');

-- CreateEnum
CREATE TYPE "RecommendationDisposition" AS ENUM ('ELIGIBLE', 'NO_TRADE', 'WAIT', 'VALIDATED', 'FLAGGED', 'REJECTED');

-- CreateTable
CREATE TABLE "trade_recommendations" (
    "id" TEXT NOT NULL,
    "rec_id" TEXT NOT NULL,
    "lineage_id" TEXT NOT NULL,
    "local_rec_id" TEXT NOT NULL,
    "pass" "RecommendationPass" NOT NULL,
    "disposition" "RecommendationDisposition" NOT NULL,
    "as_of" TIMESTAMP(3) NOT NULL,
    "decided_at_raw" TEXT,
    "decided_at" TIMESTAMP(3),
    "ticker" TEXT NOT NULL,
    "structure" TEXT,
    "structure_raw" TEXT,
    "direction" TEXT,
    "reason" TEXT,
    "option_type" TEXT,
    "strike" DECIMAL(20,6),
    "strike_short" DECIMAL(20,6),
    "expiration_date" TIMESTAMP(3),
    "entry_range_low" DECIMAL(20,6),
    "entry_range_high" DECIMAL(20,6),
    "entry_range_raw" TEXT,
    "sizing_band" TEXT,
    "chain_quality" TEXT,
    "option_mid" DECIMAL(20,6),
    "underlying_ref" DECIMAL(20,6),
    "journal_schema_version" TEXT,
    "source_file" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trade_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trade_recommendations_rec_id_key" ON "trade_recommendations"("rec_id");

-- CreateIndex
CREATE INDEX "trade_recommendations_lineage_id_idx" ON "trade_recommendations"("lineage_id");

-- CreateIndex
CREATE INDEX "trade_recommendations_ticker_idx" ON "trade_recommendations"("ticker");

-- CreateIndex
CREATE INDEX "trade_recommendations_pass_disposition_idx" ON "trade_recommendations"("pass", "disposition");

-- CreateIndex
CREATE INDEX "trade_recommendations_ticker_expiration_date_idx" ON "trade_recommendations"("ticker", "expiration_date");

