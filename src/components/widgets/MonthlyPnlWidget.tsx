"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { formatCurrency, safeNumber } from "@/components/widgets/utils";
import type { MatchedLotRecord } from "@/types/api";

interface MatchedLotsPayload {
  data: MatchedLotRecord[];
}

export function MonthlyPnlWidget() {
  const { selectedAccounts } = useAccountFilterContext();
  const [rows, setRows] = useState<MatchedLotRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      const response = await fetch("/api/matched-lots?page=1&pageSize=1000", { cache: "no-store" });
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
  }, []);

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
            <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 10 }} />
            <YAxis tick={{ fill: "var(--muted)", fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: "var(--panel-2)", borderColor: "var(--border)", color: "var(--text)" }}
              formatter={(value: number) => [formatCurrency(value), "P&L"]}
            />
            <Bar dataKey="pnl">
              {chartData.map((entry) => (
                <Cell key={entry.month} fill={entry.pnl >= 0 ? "var(--accent-2)" : "var(--danger)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </WidgetCard>
  );
}
