ALTER TABLE "executions"
ALTER COLUMN "broker_tx_id" SET NOT NULL;

CREATE UNIQUE INDEX "executions_account_id_broker_tx_id_key"
ON "executions"("account_id", "broker_tx_id");
