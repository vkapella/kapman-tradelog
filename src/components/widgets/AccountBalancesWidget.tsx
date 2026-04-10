"use client";

import { useMemo, useState } from "react";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { useNetLiquidationValue } from "@/hooks/useNetLiquidationValue";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { formatCurrency } from "@/components/widgets/utils";

function AccountBalanceRow({ accountId, displayAccountId, refreshSeed }: { accountId: string; displayAccountId: string; refreshSeed: number }) {
  void refreshSeed;
  const { nlv, cash, lastUpdated, loading } = useNetLiquidationValue(accountId);

  const value = nlv ?? cash;
  const progress = Math.max(0, Math.min(100, (value / 100_000) * 100));

  return (
    <div className="rounded-lg border border-border bg-panel-2 p-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-text">{displayAccountId}</p>
        <p className="text-[11px] text-muted">{loading ? "Updating..." : lastUpdated ? lastUpdated.toLocaleTimeString() : "Quotes unavailable"}</p>
      </div>
      <p className="mt-1 text-xs text-muted">Cash: {formatCurrency(cash)}</p>
      <p className="text-sm font-semibold text-text">{nlv === null ? "NLV unavailable" : "NLV: " + formatCurrency(nlv)}</p>
      <div className="mt-2 h-2 rounded bg-panel">
        <div className="h-2 rounded bg-accent" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

export function AccountBalancesWidget() {
  const { selectedAccounts, toExternalAccountId } = useAccountFilterContext();
  const [refreshSeed, setRefreshSeed] = useState(0);

  const action = useMemo(
    () => (
      <button
        type="button"
        onClick={() => setRefreshSeed((current) => current + 1)}
        className="rounded border border-border bg-panel-2 px-2 py-0.5 text-[10px] text-muted"
      >
        Refresh
      </button>
    ),
    [],
  );

  return (
    <WidgetCard title="Account Balances + NLV" action={action}>
      <div className="space-y-2">
        {selectedAccounts.length === 0 ? <p className="text-xs text-muted">No accounts selected.</p> : null}
        {selectedAccounts.map((accountId) => (
          <AccountBalanceRow
            key={`${accountId}-${refreshSeed}`}
            accountId={accountId}
            displayAccountId={toExternalAccountId(accountId)}
            refreshSeed={refreshSeed}
          />
        ))}
      </div>
    </WidgetCard>
  );
}
