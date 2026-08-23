-- CreateEnum
CREATE TYPE "QueueItemKind" AS ENUM ('WYCKOFF_FLAGGED');

-- CreateEnum
CREATE TYPE "QueueStatement" AS ENUM ('ACCEPT', 'OVERRIDE', 'ESTIMATE', 'DEFER');

-- CreateEnum
CREATE TYPE "QueueResolution" AS ENUM ('PIPELINE_ACCEPTED_FRESH', 'DECLARED_ACCEPT', 'DECLARED_OVERRIDE', 'ESTIMATION_PATH', 'DEFERRED', 'RETURNED_DIVERGED');

-- CreateTable
CREATE TABLE "queue_items" (
    "id" TEXT NOT NULL,
    "queue_item_id" TEXT NOT NULL,
    "queue_schema_version" TEXT NOT NULL,
    "kind" "QueueItemKind" NOT NULL,
    "created_at_source" TIMESTAMP(3) NOT NULL,
    "ticker" TEXT NOT NULL,
    "lineage_id" TEXT NOT NULL,
    "rec_id" TEXT,
    "exported_at" TIMESTAMP(3) NOT NULL,
    "as_of" TIMESTAMP(3) NOT NULL,
    "viewer_schema_version" TEXT,
    "proposal_snapshot" JSONB NOT NULL,
    "proposal_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queue_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_declarations" (
    "id" TEXT NOT NULL,
    "declaration_id" TEXT NOT NULL,
    "proposal_hash" TEXT NOT NULL,
    "statement" "QueueStatement" NOT NULL,
    "override_reading" JSONB,
    "operator_note" TEXT,
    "stated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "queue_item_id" TEXT NOT NULL,

    CONSTRAINT "queue_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_outcomes" (
    "id" TEXT NOT NULL,
    "outcome_id" TEXT NOT NULL,
    "declaration_id" TEXT,
    "consumed_at" TIMESTAMP(3) NOT NULL,
    "consuming_lineage_id" TEXT NOT NULL,
    "comparison" JSONB NOT NULL,
    "resolution" "QueueResolution" NOT NULL,
    "resulting_status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "queue_item_id" TEXT NOT NULL,

    CONSTRAINT "queue_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "queue_items_queue_item_id_key" ON "queue_items"("queue_item_id");

-- CreateIndex
CREATE INDEX "queue_items_ticker_idx" ON "queue_items"("ticker");

-- CreateIndex
CREATE INDEX "queue_items_lineage_id_idx" ON "queue_items"("lineage_id");

-- CreateIndex
CREATE UNIQUE INDEX "queue_declarations_declaration_id_key" ON "queue_declarations"("declaration_id");

-- CreateIndex
CREATE INDEX "queue_declarations_queue_item_id_idx" ON "queue_declarations"("queue_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "queue_outcomes_outcome_id_key" ON "queue_outcomes"("outcome_id");

-- CreateIndex
CREATE UNIQUE INDEX "queue_outcomes_queue_item_id_key" ON "queue_outcomes"("queue_item_id");

-- AddForeignKey
ALTER TABLE "queue_declarations" ADD CONSTRAINT "queue_declarations_queue_item_id_fkey" FOREIGN KEY ("queue_item_id") REFERENCES "queue_items"("queue_item_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_outcomes" ADD CONSTRAINT "queue_outcomes_queue_item_id_fkey" FOREIGN KEY ("queue_item_id") REFERENCES "queue_items"("queue_item_id") ON DELETE CASCADE ON UPDATE CASCADE;

