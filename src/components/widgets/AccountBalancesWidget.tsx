"use client";

import { useMemo, useState } from "react";
import { AccountLabel } from "@/components/accounts/AccountLabel";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { useNetLiquidationValue } from "@/hooks/useNetLiquidationValue";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { formatCurrency } from "@/components/widgets/utils";

function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatTime(value: Date | null): string {
  if (!value) {
    return "unavailable";
  }

  return value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function AccountBalanceRow({ accountId, refreshSeed }: { accountId: string; refreshSeed: number }) {
  void refreshSeed;
  const { nlv, cash, cashAsOf, marksAsOf, progressReference, loading } = useNetLiquidationValue(accountId);

  const value = nlv ?? cash;
  const base = progressReference ?? Math.max(Math.abs(value), 1);
  const progress = Math.max(0, Math.min(100, (value / base) * 100));
  const staleCash = cashAsOf && marksAsOf ? toDateKey(cashAsOf) !== toDateKey(marksAsOf) : false;

  return (
    <div className={["rounded-lg border bg-panel-2 p-3", staleCash ? "border-amber-400/70" : "border-border"].join(" ")}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-text">
          <AccountLabel accountId={accountId} />
        </p>
        <p className="text-[11px] text-muted">{loading ? "Updating..." : marksAsOf ? formatTime(marksAsOf) : "Quotes unavailable"}</p>
      </div>
      <p className="mt-1 text-xs text-muted">Cash: {formatCurrency(cash)}</p>
      <p className="text-[11px] text-muted">Cash as of: {cashAsOf ? cashAsOf.toISOString().slice(0, 10) : "unknown"}</p>
      <p className="text-[11px] text-muted">Marks as of: {formatTime(marksAsOf)}</p>
      {staleCash ? (
        <p className="mt-1 rounded border border-amber-400/70 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200">
          Cash snapshot date differs from marks date.
        </p>
      ) : null}
      <p className="text-sm font-semibold text-text">{nlv === null ? "NLV unavailable" : "NLV: " + formatCurrency(nlv)}</p>
      <p className="text-[10px] text-muted">Scale base: {formatCurrency(base)}</p>
      <div className="mt-2 h-2 rounded bg-panel">
        <div className="h-2 rounded bg-accent" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

export function AccountBalancesWidget() {
  const { selectedAccounts } = useAccountFilterContext();
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
          <AccountBalanceRow key={`${accountId}-${refreshSeed}`} accountId={accountId} refreshSeed={refreshSeed} />
        ))}
      </div>
    </WidgetCard>
  );
}
