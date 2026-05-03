"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { RangeFilterContext } from "@/contexts/RangeFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { formatCurrency, safeNumber } from "@/components/widgets/utils";
import type { MatchedLotRecord } from "@/types/api";

interface MatchedLotsPayload {
  data: MatchedLotRecord[];
}

export function MonthlyPnlWidget() {
  const { selectedAccounts } = useAccountFilterContext();
  const { range, applyRangeToSearchParams } = useContext(RangeFilterContext);
  const [rows, setRows] = useState<MatchedLotRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      const query = new URLSearchParams({ page: "1", pageSize: "1000" });
      applyAccountIdsToSearchParams(query, selectedAccounts);
      applyRangeToSearchParams(query);
      const response = await fetch(`/api/matched-lots?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as MatchedLotsPayload;
      if (!cancelled) {
        setRows(payload.data);
      }
    }

    void loadRows();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts, range.startDate, range.endDate, applyRangeToSearchParams]);

  const chartData = useMemo(() => {
    const grouped = new Map<string, number>();

    for (const row of rows) {
      if (!selectedAccounts.includes(row.accountId)) {
        continue;
      }

      const month = (row.closeTradeDate ?? row.openTradeDate).slice(0, 7);
      grouped.set(month, (grouped.get(month) ?? 0) + safeNumber(row.realizedPnl));
    }

    return Array.from(grouped.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([month, pnl]) => ({ month, label: month.slice(5), pnl }));
  }, [rows, selectedAccounts]);

  return (
    <WidgetCard title="Monthly P&L Bars">
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <XAxis dataKey="label" tick={{ fill: "var(--text-2)", fontSize: 10 }} />
            <YAxis tick={{ fill: "var(--text-2)", fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
              formatter={(value: number) => [formatCurrency(value), "P&L"]}
            />
            <Bar dataKey="pnl">
              {chartData.map((entry) => (
                <Cell key={entry.month} fill={entry.pnl >= 0 ? "var(--pos)" : "var(--neg)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </WidgetCard>
  );
}
