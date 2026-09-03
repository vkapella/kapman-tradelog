-- Entity segregation phase 3 (issue #349): the recommendation mirror learns
-- which consuming run produced a row. Existing rows stay null (LEGACY_UNSCOPED);
-- nothing is backfilled or guessed.

-- CreateEnum
CREATE TYPE "TradingEnvironment" AS ENUM ('LIVE', 'PAPER');

-- AlterTable
ALTER TABLE "trade_recommendations" ADD COLUMN     "environment" "TradingEnvironment",
ADD COLUMN     "legal_entity_id" TEXT,
ADD COLUMN     "run_id" TEXT;

-- CreateIndex
CREATE INDEX "trade_recommendations_run_id_idx" ON "trade_recommendations"("run_id");

-- AddForeignKey
ALTER TABLE "trade_recommendations" ADD CONSTRAINT "trade_recommendations_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
