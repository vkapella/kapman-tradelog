"use client";

import { AccountLabel } from "@/components/accounts/AccountLabel";
import { findSupersededExecutionQtyOverrideIds } from "@/lib/adjustments/execution-qty-overrides";
import type { ManualAdjustmentRecord } from "@/types/api";

function splitDirection(record: ManualAdjustmentRecord): string | null {
  if (record.adjustmentType !== "SPLIT") {
    return null;
  }

  const payload = record.payload as { from: number; to: number };
  if (payload.to > payload.from) {
    return "Forward split";
  }
  if (payload.to < payload.from) {
    return "Reverse split";
  }
  return "No ratio change";
}

export function AdjustmentList({
  adjustments,
  onReverse,
  reversingId,
}: {
  adjustments: ManualAdjustmentRecord[];
  onReverse: (id: string) => void;
  reversingId: string | null;
}) {
  const supersededIds = findSupersededExecutionQtyOverrideIds(adjustments);

  return (
    <div className="rounded-xl border border-border bg-panel p-3">
      <p className="mb-3 text-sm font-semibold text-text">Adjustment Ledger</p>
      {adjustments.length === 0 ? <p className="text-xs text-muted">No adjustments yet.</p> : null}
      {adjustments.length > 0 ? (
        <div className="max-h-[520px] overflow-auto rounded border border-border">
          <table className="min-w-full text-xs">
            <thead className="bg-panel-2 text-muted">
              <tr>
                <th className="px-2 py-2 text-left">Created</th>
                <th className="px-2 py-2 text-left">Account</th>
                <th className="px-2 py-2 text-left">Symbol</th>
                <th className="px-2 py-2 text-left">Type</th>
                <th className="px-2 py-2 text-left">Effective</th>
                <th className="px-2 py-2 text-left">Payload</th>
                <th className="px-2 py-2 text-left">Reason</th>
                <th className="px-2 py-2 text-left">Status</th>
                <th className="px-2 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((record) => (
                <tr key={record.id} className="border-t border-border text-text">
                  <td className="px-2 py-2">{new Date(record.createdAt).toLocaleString()}</td>
                  <td className="px-2 py-2">
                    <AccountLabel accountId={record.accountId} />
                  </td>
                  <td className="px-2 py-2">{record.symbol}</td>
                  <td className="px-2 py-2">
                    {record.adjustmentType}
                    {splitDirection(record) ? <span className="ml-1 text-[10px] text-muted">({splitDirection(record)})</span> : null}
                  </td>
                  <td className="px-2 py-2">{record.effectiveDate.slice(0, 10)}</td>
                  <td className="max-w-[260px] px-2 py-2 font-mono text-[10px] text-muted">{JSON.stringify(record.payload)}</td>
                  <td className="max-w-[260px] px-2 py-2 text-muted">{record.reason}</td>
                  <td className="px-2 py-2">
                    <span className={record.status === "ACTIVE" ? "text-accent-2" : "text-muted"}>{record.status}</span>
                    {record.status === "ACTIVE" && supersededIds.has(record.id) ? (
                      <span className="ml-1 text-[10px] text-amber-300">(SUPERSEDED)</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      disabled={record.status !== "ACTIVE" || reversingId === record.id}
                      onClick={() => onReverse(record.id)}
                      className="rounded border border-border bg-panel-2 px-2 py-1 text-[11px] text-text disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {reversingId === record.id ? "Reversing..." : "Reverse"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
