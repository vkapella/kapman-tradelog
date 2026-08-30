"use client";

import { AccountLabel } from "@/components/accounts/AccountLabel";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { usePositionSnapshot } from "@/hooks/usePositionSnapshot";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { formatCurrency } from "@/components/widgets/utils";
import type { LiveAccountValue } from "@/types/api";

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "unavailable";
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "unavailable";
}

/**
 * Reconciliation is unknown whenever NLV could not be reconstructed, which is
 * exactly when a signed zero would be read as "matches the broker perfectly".
 * A real zero delta is still shown, because exact agreement is a real result.
 */
export function formatReconciliationDelta(delta: string | null): string {
  if (delta === null) {
    return "—";
  }
  const parsed = Number(delta);
  return Number.isFinite(parsed) ? formatSignedCurrency(delta) : "—";
}

function formatSignedCurrency(value: string): string {
  const number = Number(value);
  return `${number >= 0 ? "+" : "-"}${formatCurrency(Math.abs(number))}`;
}

export function statusMessage(value: Pick<LiveAccountValue, "status" | "missingMarkCount" | "staleMarkCount" | "staleMarkAsOf">): string | null {
  if (value.status === "INCOMPLETE_MARKS") {
    return `${value.missingMarkCount} open ${value.missingMarkCount === 1 ? "position is" : "positions are"} missing a market mark.`;
  }
  if (value.status === "STALE_MARKS") {
    const subject = `${value.staleMarkCount} open ${value.staleMarkCount === 1 ? "position is" : "positions are"}`;
    const asOf = value.staleMarkAsOf ? ` from ${value.staleMarkAsOf}` : "";
    return `${subject} priced from the last daily close${asOf}, not a live quote.`;
  }
  if (value.status === "MIXED_AS_OF") {
    return "Cash and market marks have different effective dates.";
  }
  return null;
}

function AccountBalanceRow({ accountId, value, loading, dataStale }: { accountId: string; value: LiveAccountValue | null; loading: boolean; dataStale: boolean }) {
  const warning = value ? statusMessage(value) : null;

  return (
    <div className={["rounded-lg border bg-surface-2 p-3", warning ? "border-amber-400/70" : "border-border"].join(" ")}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-text">
          <AccountLabel accountId={accountId} />
        </p>
        <p className="text-[11px] text-text-2">{loading ? "Updating..." : value ? formatTimestamp(value.marksAsOf) : "Snapshot unavailable"}</p>
      </div>
      {!value ? <p className="mt-2 text-xs text-text-2">Refresh to compute a live account value.</p> : null}
      {value ? (
        <>
          <p className="mt-2 text-sm font-semibold text-text">
            {value.reconstructedNlv === null ? "Live NLV unavailable" : `Live NLV: ${formatCurrency(Number(value.reconstructedNlv))}`}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-text-2">
            <span>Cash and equivalents</span><span className="text-right text-text">{formatCurrency(Number(value.cashAndEquivalents))}</span>
            <span>Equities</span><span className="text-right text-text">{formatCurrency(Number(value.equityMarketValue))}</span>
            <span>Options</span><span className="text-right text-text">{formatCurrency(Number(value.optionMarketValue))}</span>
            <span>Securities total</span><span className="text-right text-text">{formatCurrency(Number(value.securitiesMarketValue))}</span>
          </div>
          <div className="mt-2 border-t border-border pt-2 text-[10px] text-text-2">
            <p>Cash as of: {formatTimestamp(value.cashAsOf)}</p>
            <p>Marks as of: {formatTimestamp(value.marksAsOf)}</p>
            <p>Valuation basis: Market mark</p>
          </div>
          {value.brokerReportedNlv === null ? (
            <p className="mt-2 text-[10px] text-text-2">Broker-reported NLV unavailable.</p>
          ) : (
            <div className="mt-2 rounded border border-border px-2 py-1 text-[10px] text-text-2">
              <div className="flex justify-between"><span>Broker NLV</span><span className="text-text">{formatCurrency(Number(value.brokerReportedNlv))}</span></div>
              <div className="flex justify-between"><span>Reconstructed − broker</span><span className="text-text">{formatReconciliationDelta(value.reconciliationDelta)}</span></div>
              <p>Broker as of: {formatTimestamp(value.brokerNlvAsOf)}</p>
            </div>
          )}
        </>
      ) : null}
      {warning ? (
        <p className="mt-1 rounded border border-amber-400/70 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200">
          {warning}
        </p>
      ) : null}
      {dataStale ? (
        <p className="mt-1 rounded border border-amber-400/70 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200">
          Account data changed since this compute — refresh for current values.
        </p>
      ) : null}
    </div>
  );
}

export function AccountBalancesWidget() {
  const { selectedAccounts } = useAccountFilterContext();
  const { snapshot, loading: snapshotLoading, computing, error: snapshotError, staleDataAccountIds, triggerCompute } = usePositionSnapshot(selectedAccounts);

  const action = (
    <button
      type="button"
      onClick={() => void triggerCompute()}
      disabled={computing}
      className="touch-target rounded border border-border bg-surface-3 px-2 py-0.5 text-[10px] text-text-2 disabled:opacity-50"
    >
      {computing ? "Computing..." : "Refresh"}
    </button>
  );

  return (
    <WidgetCard title="Account Balances + NLV" action={action}>
      <div className="space-y-2">
        {selectedAccounts.length === 0 ? <p className="text-xs text-text-2">No accounts selected.</p> : null}
        {snapshotError ? <p className="text-xs text-red-300">{snapshotError}</p> : null}
        {!snapshot && !snapshotLoading && !snapshotError ? (
          <p className="text-xs text-text-2">No snapshot available. Refresh to compute account balances.</p>
        ) : null}
        {selectedAccounts.map((accountId) => (
          <AccountBalanceRow
            key={accountId}
            accountId={accountId}
            value={snapshot?.accountValues.find((entry) => entry.accountId === accountId) ?? null}
            loading={snapshotLoading}
            dataStale={staleDataAccountIds.includes(accountId)}
          />
        ))}
      </div>
    </WidgetCard>
  );
}
