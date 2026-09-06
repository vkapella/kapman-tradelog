-- Commissions and fees are netted into the broker's settled trade amounts, so
-- the value engine's cash (and NLV) carries them while matched-lot realized P&L
-- is price-based; the reconciliation identity records the fees separately and
-- adds them back (kapman-tradelog #372).
ALTER TABLE "position_snapshots" ADD COLUMN "trading_fees" DECIMAL(20,6);
ALTER TABLE "position_snapshot_accounts" ADD COLUMN "trading_fees" DECIMAL(20,6) NOT NULL DEFAULT 0;
