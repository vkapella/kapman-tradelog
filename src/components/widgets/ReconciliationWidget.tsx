"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { formatCurrency, safeNumber } from "@/components/widgets/utils";
import type { ReconciliationResponse } from "@/types/api";

interface ReconciliationPayload {
  data: ReconciliationResponse;
}

function signClass(value: number): string {
  if (value > 0) {
    return "text-accent-2";
  }
  if (value < 0) {
    return "text-red-300";
  }
  return "text-muted";
}

export function ReconciliationWidget() {
  const { selectedAccounts } = useAccountFilterContext();
  const [data, setData] = useState<ReconciliationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const query = new URLSearchParams();
        applyAccountIdsToSearchParams(query, selectedAccounts);
        const response = await fetch(`/api/overview/reconciliation?${query.toString()}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Unable to load reconciliation.");
        }

        const payload = (await response.json()) as ReconciliationPayload;
        if (!cancelled) {
          setData(payload.data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load reconciliation.");
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts]);

  const rows = useMemo(() => {
    if (!data) {
      return [];
    }

    return [
      { label: "Starting Capital", value: safeNumber(data.startingCapital) },
      { label: "Current NLV", value: safeNumber(data.currentNlv) },
      { label: "Total Gain", value: safeNumber(data.totalGain) },
      { label: "Unrealized P&L", value: safeNumber(data.unrealizedPnl) },
      { label: "Cash Adjustments", value: safeNumber(data.cashAdjustments) },
      { label: "Realized P&L", value: safeNumber(data.realizedPnl) },
      { label: "Manual Adjustments", value: safeNumber(data.manualAdjustments) },
      { label: "Unexplained Delta", value: safeNumber(data.unexplainedDelta), highlighted: true },
    ];
  }, [data]);

  return (
    <WidgetCard title="Portfolio Reconciliation">
      {loading ? <p className="text-xs text-muted">Loading reconciliation…</p> : null}
      {!loading && error ? <p className="text-xs text-red-300">{error}</p> : null}
      {!loading && !error && data ? (
        <div className="space-y-2 text-xs">
          {!data.startingCapitalConfigured ? (
            <p className="rounded border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-amber-300">
              Set <code>STARTING_CAPITAL</code> in <code>.env</code> to reconcile against your initial portfolio value.
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
