"use client";

import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { usePositionSnapshot } from "@/hooks/usePositionSnapshot";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { formatCurrency, safeNumber } from "@/components/widgets/utils";

function signClass(value: number): string {
  if (value > 0) {
    return "text-accent-2";
  }
  if (value < 0) {
    return "text-red-300";
  }
  return "text-muted";
}

function formatSnapshotTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ReconciliationWidget() {
  const { selectedAccounts } = useAccountFilterContext();
  const { snapshot, loading, stale, computing, error, triggerCompute } = usePositionSnapshot(selectedAccounts);

  const action = (
    <button
      type="button"
      onClick={() => void triggerCompute()}
      disabled={computing}
      className="rounded border border-border bg-panel-2 px-2 py-0.5 text-[10px] text-muted disabled:opacity-50"
    >
      {computing ? "Computing..." : "Compute now"}
    </button>
  );

  const rows = snapshot
    ? [
        { label: "Starting Capital", value: safeNumber(snapshot.startingCapital) },
        { label: "Current NLV", value: safeNumber(snapshot.currentNlv) },
        { label: "Total Gain", value: safeNumber(snapshot.totalGain) },
        { label: "Unrealized P&L", value: safeNumber(snapshot.unrealizedPnl) },
        { label: "Cash Adjustments", value: safeNumber(snapshot.cashAdjustments) },
        { label: "Realized P&L", value: safeNumber(snapshot.realizedPnl) },
        { label: "Manual Adjustments", value: safeNumber(snapshot.manualAdjustments) },
        { label: "Unexplained Delta", value: safeNumber(snapshot.unexplainedDelta), highlighted: true },
      ]
    : [];
  const startingCapitalConfigured = safeNumber(snapshot?.startingCapital) > 0;

  return (
    <WidgetCard title="Portfolio Reconciliation" action={action}>
      {snapshot ? (
        <div className="mb-2 flex items-center gap-2 text-[11px] text-muted">
          <span>As of {formatSnapshotTime(snapshot.snapshotAt)}</span>
          {stale ? <span className="rounded border border-amber-400/50 bg-amber-400/10 px-1.5 py-0.5 text-amber-300">Stale</span> : null}
          {snapshot.status === "PENDING" ? <span>Refreshing…</span> : null}
        </div>
      ) : null}

      {loading && !snapshot ? <p className="text-xs text-muted">Loading reconciliation snapshot…</p> : null}
      {!loading && error ? <p className="text-xs text-red-300">{error}</p> : null}

      {!loading && !error && !snapshot ? (
        <div className="space-y-2 text-xs text-muted">
          <p>No snapshot available for the selected accounts.</p>
          <p>Compute a snapshot to load reconciliation totals.</p>
        </div>
      ) : null}

      {!loading && !error && snapshot?.status === "FAILED" ? (
        <div className="space-y-2 text-xs">
          <p className="text-red-300">{snapshot.errorMessage ?? "Snapshot computation failed."}</p>
          <p className="text-muted">Recompute the snapshot to refresh reconciliation totals.</p>
        </div>
      ) : null}

      {!loading && !error && snapshot && snapshot.status !== "FAILED" ? (
        <div className="space-y-2 text-xs">
          {!startingCapitalConfigured ? (
            <p className="rounded border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-amber-300">
              Set starting capital on the <code>/accounts</code> page to reconcile against your initial portfolio value.
            </p>
          ) : null}
          {rows.map((row) => {
            const rowClass = row.highlighted
              ? row.value === 0
                ? "text-accent-2"
                : "text-amber-300"
              : signClass(row.value);

            return (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <span className="text-muted">{row.label}</span>
                <span className={rowClass}>{formatCurrency(row.value)}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </WidgetCard>
  );
}
