-- CreateTable
CREATE TABLE "cash_events" (
    "id" TEXT NOT NULL,
    "event_date" TIMESTAMP(3) NOT NULL,
    "row_type" TEXT NOT NULL,
    "ref_number" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "source_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "account_id" TEXT NOT NULL,

    CONSTRAINT "cash_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_events_account_id_idx" ON "cash_events"("account_id");

-- CreateIndex
CREATE INDEX "cash_events_event_date_idx" ON "cash_events"("event_date");

-- CreateIndex
CREATE UNIQUE INDEX "cash_events_account_id_ref_number_key" ON "cash_events"("account_id", "ref_number");

-- AddForeignKey
ALTER TABLE "cash_events" ADD CONSTRAINT "cash_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
