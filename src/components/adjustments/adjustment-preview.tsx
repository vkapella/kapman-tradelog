"use client";

import type { AdjustmentPreviewResponse } from "@/types/api";

function formatNumber(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return value.toFixed(4);
}

export function AdjustmentPreview({ preview }: { preview: AdjustmentPreviewResponse | null }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-3">
      <p className="mb-3 text-sm font-semibold text-text">Preview</p>
      {!preview ? <p className="text-xs text-muted">Run preview to see before/after impact.</p> : null}
      {preview ? (
        <div className="space-y-2 text-xs text-muted">
          <p>
            Symbol: <span className="font-mono text-text">{preview.symbol}</span>
          </p>
          <p>
            Type: <span className="text-text">{preview.adjustmentType}</span>
          </p>
          <p>
            Effective: <span className="text-text">{preview.effectiveDate.slice(0, 10)}</span>
          </p>
          <p>
            Affected executions: <span className="text-text">{preview.affectedExecutionCount}</span>
          </p>

          <div className="rounded border border-border">
            <table className="min-w-full text-xs">
              <thead className="bg-panel-2 text-muted">
                <tr>
                  <th className="px-2 py-2 text-left">Metric</th>
                  <th className="px-2 py-2 text-right">Before</th>
                  <th className="px-2 py-2 text-right">After</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border text-text">
                  <td className="px-2 py-2">Open Qty</td>
                  <td className="px-2 py-2 text-right">{formatNumber(preview.before.openQty)}</td>
                  <td className="px-2 py-2 text-right">{formatNumber(preview.after.openQty)}</td>
                </tr>
                <tr className="border-t border-border text-text">
                  <td className="px-2 py-2">Cost Basis / Share</td>
                  <td className="px-2 py-2 text-right">{formatNumber(preview.before.costBasisPerShare)}</td>
                  <td className="px-2 py-2 text-right">{formatNumber(preview.after.costBasisPerShare)}</td>
                </tr>
                <tr className="border-t border-border text-text">
                  <td className="px-2 py-2">Gross Cost</td>
                  <td className="px-2 py-2 text-right">{formatNumber(preview.before.grossCost)}</td>
                  <td className="px-2 py-2 text-right">{formatNumber(preview.after.grossCost)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
