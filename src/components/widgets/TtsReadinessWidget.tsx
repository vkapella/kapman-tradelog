"use client";

import { useEffect, useMemo, useState } from "react";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { formatCompactCurrency, safeNumber } from "@/components/widgets/utils";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import type { ExecutionRecord, MatchedLotRecord } from "@/types/api";

interface ExecutionsPayload {
  data: ExecutionRecord[];
}

interface MatchedLotsPayload {
  data: MatchedLotRecord[];
}

export function TtsReadinessWidget() {
  const { selectedAccounts } = useAccountFilterContext();
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [lots, setLots] = useState<MatchedLotRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadInputs() {
      const executionQuery = new URLSearchParams({ page: "1", pageSize: "1000" });
      const lotsQuery = new URLSearchParams({ page: "1", pageSize: "1000" });
      applyAccountIdsToSearchParams(executionQuery, selectedAccounts);
      applyAccountIdsToSearchParams(lotsQuery, selectedAccounts);

      const [executionResponse, lotsResponse] = await Promise.all([
        fetch(`/api/executions?${executionQuery.toString()}`, { cache: "no-store" }),
        fetch(`/api/matched-lots?${lotsQuery.toString()}`, { cache: "no-store" }),
      ]);

      if (!executionResponse.ok || !lotsResponse.ok) {
        return;
      }

      const executionsPayload = (await executionResponse.json()) as ExecutionsPayload;
      const lotsPayload = (await lotsResponse.json()) as MatchedLotsPayload;

      if (!cancelled) {
        setExecutions(executionsPayload.data);
        setLots(lotsPayload.data);
      }
    }

    void loadInputs();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts]);

  const metrics = useMemo(() => {
    const filteredExecutions = executions.filter((row) => selectedAccounts.includes(row.accountId));
    const filteredLots = lots.filter((row) => selectedAccounts.includes(row.accountId));

    const totalTrades = filteredExecutions.length;
    const activeDays = new Set(filteredExecutions.map((row) => row.tradeDate.slice(0, 10))).size;
    const grossProceeds = filteredExecutions.reduce((sum, row) => {
      const qty = Math.abs(safeNumber(row.quantity));
      const price = safeNumber(row.price);
      return sum + qty * price;
    }, 0);

    const sortedExecutionDates = filteredExecutions
      .map((row) => new Date(row.tradeDate).getTime())
      .sort((left, right) => left - right);

    let monthCount = 1;
    let weekCount = 1;
    if (sortedExecutionDates.length > 1) {
      const firstDate = new Date(sortedExecutionDates[0]);
      const lastDate = new Date(sortedExecutionDates[sortedExecutionDates.length - 1]);
      const yearDiff = lastDate.getUTCFullYear() - firstDate.getUTCFullYear();
      const monthDiff = lastDate.getUTCMonth() - firstDate.getUTCMonth();
      monthCount = Math.max(1, yearDiff * 12 + monthDiff + 1);

      const dayDiff = Math.max(1, Math.floor((lastDate.getTime() - firstDate.getTime()) / (24 * 60 * 60 * 1000)) + 1);
      weekCount = Math.max(1, dayDiff / 7);
    }

    const holdingDays = filteredLots.map((row) => row.holdingDays).sort((left, right) => left - right);
    const averageHold = holdingDays.length === 0 ? 0 : holdingDays.reduce((sum, value) => sum + value, 0) / holdingDays.length;
    const middle = Math.floor(holdingDays.length / 2);
    const medianHold =
      holdingDays.length === 0
        ? 0
        : holdingDays.length % 2 === 0
          ? (holdingDays[middle - 1] + holdingDays[middle]) / 2
          : holdingDays[middle];

    const tradesPerMonth = totalTrades / monthCount;

    return {
      tradesPerMonth: tradesPerMonth,
      activeDaysPerWeek: activeDays / weekCount,
      annualizedTradeCount: tradesPerMonth * 12,
      averageHoldingPeriodDays: averageHold,
      medianHoldingPeriodDays: medianHold,
      grossProceedsProxy: grossProceeds,
    };
  }, [executions, lots, selectedAccounts]);

  return (
    <WidgetCard title="TTS Readiness">
      <div className="grid grid-cols-2 gap-2 text-xs text-muted">
        <p>Trades/mo: {metrics.tradesPerMonth.toFixed(2)}</p>
        <p>Active days/wk: {metrics.activeDaysPerWeek.toFixed(2)}</p>
        <p>Annualized count: {metrics.annualizedTradeCount.toFixed(0)}</p>
        <p>Avg hold: {metrics.averageHoldingPeriodDays.toFixed(2)}d</p>
        <p>Median hold: {metrics.medianHoldingPeriodDays.toFixed(2)}d</p>
        <p>Gross proceeds: {formatCompactCurrency(metrics.grossProceedsProxy)}</p>
      </div>
      <p className="mt-2 text-[10px] text-muted">evidence/readiness signals — not legal determinations</p>
    </WidgetCard>
  );
}
