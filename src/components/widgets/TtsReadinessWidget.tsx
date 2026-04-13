"use client";

import { useEffect, useState } from "react";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { formatCompactCurrency, safeNumber } from "@/components/widgets/utils";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import {
  getOverallTtsReadinessStatus,
  getTtsMetricStatus,
  getTtsStatusColor,
  getTtsStatusLabel,
  getTtsStatusTintClass,
} from "@/lib/tts/readiness";
import type { TtsEvidenceResponse } from "@/types/api";

interface TtsPayload {
  data: TtsEvidenceResponse;
}

export function TtsReadinessWidget() {
  const { selectedAccounts } = useAccountFilterContext();
  const [metrics, setMetrics] = useState<TtsEvidenceResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMetrics() {
      const query = new URLSearchParams();
      applyAccountIdsToSearchParams(query, selectedAccounts);

      const response = await fetch(`/api/tts/evidence?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as TtsPayload;

      if (!cancelled) {
        setMetrics(payload.data);
      }
    }

    void loadMetrics();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts]);

  const values = metrics ?? {
    tradesPerMonth: 0,
    activeDaysPerWeek: 0,
    annualizedTradeCount: 0,
    averageHoldingPeriodDays: 0,
    medianHoldingPeriodDays: 0,
    grossProceedsProxy: "0",
    holdingPeriodDistribution: [],
    monthlySeries: [],
  };
  const overallStatus = getOverallTtsReadinessStatus(values);
  const cells = [
    {
      label: "Trades/mo",
      value: values.tradesPerMonth.toFixed(1),
      target: "Target >= 60 / month",
      status: getTtsMetricStatus("tradesPerMonth", values),
    },
    {
      label: "Active days/wk",
      value: values.activeDaysPerWeek.toFixed(1),
      target: "Target >= 4 / week",
      status: getTtsMetricStatus("activeDaysPerWeek", values),
    },
    {
      label: "Avg hold",
      value: `${values.averageHoldingPeriodDays.toFixed(1)}d`,
      target: "Target <= 31d",
      status: getTtsMetricStatus("averageHoldingPeriodDays", values),
    },
    {
      label: "Annual trades",
      value: values.annualizedTradeCount.toFixed(0),
      target: "Target >= 720 / year",
      status: getTtsMetricStatus("annualizedTradeCount", values),
    },
    {
      label: "Gross proceeds",
      value: formatCompactCurrency(safeNumber(values.grossProceedsProxy)),
      target: "Informational scale signal",
      status: "info" as const,
    },
    {
      label: "Median hold",
      value: `${values.medianHoldingPeriodDays.toFixed(1)}d`,
      target: "Display only",
      status: "info" as const,
    },
  ];

  return (
    <WidgetCard
      title="TTS Readiness"
      action={
        <span className={["rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]", getTtsStatusTintClass(overallStatus)].join(" ")}>
          {getTtsStatusLabel(overallStatus)}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
        {cells.map((cell) => (
          <div key={cell.label} className="rounded-lg border border-border bg-panel-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted">{cell.label}</p>
              <span
                aria-label={`${cell.label} status ${cell.status}`}
                className="inline-flex h-2 w-2 rounded-full"
                style={{ backgroundColor: getTtsStatusColor(cell.status) }}
              />
            </div>
            <p className="mt-2 text-lg font-semibold text-text">{cell.value}</p>
            <p className="mt-1 text-[10px] text-muted">{cell.target}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-muted">evidence/readiness signals — not legal determinations</p>
    </WidgetCard>
  );
}
