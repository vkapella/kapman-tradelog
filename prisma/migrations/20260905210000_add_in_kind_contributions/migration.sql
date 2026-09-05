-- In-kind (ACAT) receives are external contributions the cash ledger never
-- carried; the reconciliation identity and its per-account children now record
-- them separately (kapman-tradelog #357).
ALTER TABLE "position_snapshots" ADD COLUMN "in_kind_contributions" DECIMAL(20,6);
ALTER TABLE "position_snapshot_accounts" ADD COLUMN "in_kind_contributions" DECIMAL(20,6) NOT NULL DEFAULT 0;
