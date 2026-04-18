"use client";

import type { AdjustmentPreviewResponse } from "@/types/api";

function formatNumber(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return value.toFixed(4);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
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
          {preview.warnings.length > 0 ? (
            <div className="space-y-1 rounded border border-border bg-panel-2 p-2">
              {preview.warnings.map((warning) => (
                <p key={warning} className="text-[11px] text-amber-300">
                  {warning}
                </p>
              ))}
            </div>
          ) : null}

          {preview.adjustmentType === "EXECUTION_QTY_OVERRIDE" && preview.executionQtyOverridePreview ? (
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
                    <td className="px-2 py-2">Execution ID</td>
                    <td className="px-2 py-2 text-right font-mono">{preview.executionQtyOverridePreview.executionId}</td>
                    <td className="px-2 py-2 text-right font-mono">{preview.executionQtyOverridePreview.executionId}</td>
                  </tr>
                  <tr className="border-t border-border text-text">
                    <td className="px-2 py-2">Raw Qty</td>
                    <td className="px-2 py-2 text-right">{formatNumber(preview.executionQtyOverridePreview.rawQty)}</td>
                    <td className="px-2 py-2 text-right">{formatNumber(preview.executionQtyOverridePreview.rawQty)}</td>
                  </tr>
                  <tr className="border-t border-border text-text">
                    <td className="px-2 py-2">Effective Qty</td>
                    <td className="px-2 py-2 text-right">{formatNumber(preview.executionQtyOverridePreview.beforeEffectiveQty)}</td>
                    <td className="px-2 py-2 text-right">{formatNumber(preview.executionQtyOverridePreview.afterEffectiveQty)}</td>
                  </tr>
                  <tr className="border-t border-border text-text">
                    <td className="px-2 py-2">Affected Matched Lots</td>
                    <td className="px-2 py-2 text-right">{preview.executionQtyOverridePreview.beforeAffectedMatchedLots}</td>
                    <td className="px-2 py-2 text-right">{preview.executionQtyOverridePreview.afterAffectedMatchedLots}</td>
                  </tr>
                  <tr className="border-t border-border text-text">
                    <td className="px-2 py-2">Realized P&L Impact</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(preview.executionQtyOverridePreview.beforeRealizedPnl)}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(preview.executionQtyOverridePreview.afterRealizedPnl)}</td>
                  </tr>
                  <tr className="border-t border-border text-text">
                    <td className="px-2 py-2">Unexplained Delta Impact</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(preview.executionQtyOverridePreview.beforeUnexplainedDeltaImpact)}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(preview.executionQtyOverridePreview.afterUnexplainedDeltaImpact)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : preview.adjustmentType === "EXECUTION_PRICE_OVERRIDE" && preview.executionPriceOverridePreview ? (
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
                    <td className="px-2 py-2">Execution ID</td>
                    <td className="px-2 py-2 text-right font-mono">{preview.executionPriceOverridePreview.executionId}</td>
                    <td className="px-2 py-2 text-right font-mono">{preview.executionPriceOverridePreview.executionId}</td>
                  </tr>
                  <tr className="border-t border-border text-text">
                    <td className="px-2 py-2">Raw Price</td>
                    <td className="px-2 py-2 text-right">{formatNumber(preview.executionPriceOverridePreview.rawPrice)}</td>
                    <td className="px-2 py-2 text-right">{formatNumber(preview.executionPriceOverridePreview.rawPrice)}</td>
                  </tr>
                  <tr className="border-t border-border text-text">
                    <td className="px-2 py-2">Effective Price</td>
                    <td className="px-2 py-2 text-right">{formatNumber(preview.executionPriceOverridePreview.beforeEffectivePrice)}</td>
                    <td className="px-2 py-2 text-right">{formatNumber(preview.executionPriceOverridePreview.afterEffectivePrice)}</td>
                  </tr>
                  <tr className="border-t border-border text-text">
                    <td className="px-2 py-2">Affected Matched Lots</td>
                    <td className="px-2 py-2 text-right">{preview.executionPriceOverridePreview.beforeAffectedMatchedLots}</td>
                    <td className="px-2 py-2 text-right">{preview.executionPriceOverridePreview.afterAffectedMatchedLots}</td>
                  </tr>
                  <tr className="border-t border-border text-text">
                    <td className="px-2 py-2">Realized P&L Impact</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(preview.executionPriceOverridePreview.beforeRealizedPnl)}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(preview.executionPriceOverridePreview.afterRealizedPnl)}</td>
                  </tr>
                  <tr className="border-t border-border text-text">
                    <td className="px-2 py-2">Unexplained Delta Impact</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(preview.executionPriceOverridePreview.beforeUnexplainedDeltaImpact)}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(preview.executionPriceOverridePreview.afterUnexplainedDeltaImpact)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
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
          )}
        </div>
      ) : null}
    </div>
  );
}
