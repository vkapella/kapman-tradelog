"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { RangeFilterContext } from "@/contexts/RangeFilterContext";
import { applyAccountIdsToSearchParams, isAccountInScope } from "@/lib/api/account-scope";
import { formatCurrency, safeNumber } from "@/components/widgets/utils";
import type { SetupSummaryRecord } from "@/types/api";

interface SetupsPayload {
  data: SetupSummaryRecord[];
}

export function SetupTagRollupWidget() {
  const { selectedAccounts } = useAccountFilterContext();
  const { range, applyRangeToSearchParams } = useContext(RangeFilterContext);
  const [rows, setRows] = useState<SetupSummaryRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      const query = new URLSearchParams({ page: "1", pageSize: "1000" });
      applyAccountIdsToSearchParams(query, selectedAccounts);
      applyRangeToSearchParams(query);
      const response = await fetch(`/api/setups?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as SetupsPayload;
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
    const grouped = new Map<string, { pnl: number; count: number }>();

    for (const row of rows) {
      if (!isAccountInScope(selectedAccounts, row.accountId)) {
        continue;
      }

      const key = row.overrideTag ?? row.tag;
      const current = grouped.get(key) ?? { pnl: 0, count: 0 };
      current.pnl += safeNumber(row.realizedPnl);
      current.count += 1;
      grouped.set(key, current);
    }

    return Array.from(grouped.entries())
      .map(([tag, value]) => ({ tag, pnl: value.pnl, count: value.count }))
      .sort((left, right) => right.pnl - left.pnl);
  }, [rows, selectedAccounts]);

  return (
    <WidgetCard title="Setup Tag Rollup">
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <XAxis dataKey="tag" tick={{ fill: "var(--text-2)", fontSize: 10 }} />
            <YAxis tick={{ fill: "var(--text-2)", fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
              formatter={(value: number) => [formatCurrency(value), "P&L"]}
            />
            <Bar dataKey="pnl" fill="var(--accent)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-text-2">
        {chartData.map((entry) => (
          <span key={entry.tag}>{entry.tag + " (" + entry.count + ")"}</span>
        ))}
      </div>
    </WidgetCard>
  );
}
