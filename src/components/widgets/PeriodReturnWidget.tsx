"use client";

import { useContext, useEffect, useState } from "react";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { RangeFilterContext } from "@/contexts/RangeFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { KpiCard } from "@/components/KpiCard";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import type { PeriodReturnResponse } from "@/types/api";

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(2)}%`;
}

function formatCurrency(value: number): string {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PeriodReturnWidget() {
  const { selectedAccounts } = useAccountFilterContext();
  const { range, applyRangeToSearchParams } = useContext(RangeFilterContext);
  const [data, setData] = useState<PeriodReturnResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      const query = new URLSearchParams();
      applyAccountIdsToSearchParams(query, selectedAccounts);
      applyRangeToSearchParams(query);

      const response = await fetch(`/api/overview/period-return?${query.toString()}`, { cache: "no-store" });
      if (!response.ok || cancelled) {
        return;
      }

      const payload = (await response.json()) as { data?: PeriodReturnResponse };
      if (!cancelled) {
        setData(payload.data ?? null);
        setLoading(false);
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts, range.startDate, range.endDate, applyRangeToSearchParams]);

  if (loading || data === null) {
    return <LoadingSkeleton lines={2} />;
  }

  const returnDisplay = data.returnPercentage !== null ? formatPercent(data.returnPercentage) : "N/A";
  const profitDisplay = formatCurrency(data.profit);
  const colorVariant = data.returnPercentage === null ? "neutral" : data.returnPercentage >= 0 ? "pos" : "neg";

  return (
    <KpiCard
      label="Period Return"
      value={returnDisplay}
      sub={`Profit: ${profitDisplay}`}
      colorVariant={colorVariant}
      helpText={{
        formula: "(Ending NLV - beginning NLV - external capital flows) / (beginning NLV + external capital flows).",
        source: "/api/overview/period-return",
        interpretation:
          "Portfolio return measures NLV change over the selected date range after external capital flows. Strategy analytics include only trades opened within the selected range, so the two views may not reconcile exactly.",
      }}
    />
  );
}
