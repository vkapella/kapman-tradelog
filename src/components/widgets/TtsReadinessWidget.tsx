"use client";

import { useEffect, useState } from "react";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { formatCompactCurrency, safeNumber } from "@/components/widgets/utils";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
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
  };

  return (
    <WidgetCard title="TTS Readiness">
      <div className="grid grid-cols-2 gap-2 text-xs text-muted">
        <p>Trades/mo: {values.tradesPerMonth.toFixed(2)}</p>
        <p>Active days/wk: {values.activeDaysPerWeek.toFixed(2)}</p>
        <p>Annualized count: {values.annualizedTradeCount.toFixed(0)}</p>
        <p>Avg hold: {values.averageHoldingPeriodDays.toFixed(2)}d</p>
        <p>Median hold: {values.medianHoldingPeriodDays.toFixed(2)}d</p>
        <p>Gross proceeds: {formatCompactCurrency(safeNumber(values.grossProceedsProxy))}</p>
      </div>
      <p className="mt-2 text-[10px] text-muted">evidence/readiness signals — not legal determinations</p>
    </WidgetCard>
  );
}
