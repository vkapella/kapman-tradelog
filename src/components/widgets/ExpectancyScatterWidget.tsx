"use client";

import { useEffect, useMemo, useState } from "react";
import type { LegendProps } from "recharts";
import { Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { formatCurrency, safeNumber } from "@/components/widgets/utils";
import type { SetupSummaryRecord } from "@/types/api";

interface SetupsPayload {
  data: SetupSummaryRecord[];
}

const tagColors: Record<string, string> = {
  long_call: "var(--accent)",
  stock: "var(--accent-2)",
  bull_vertical: "var(--warning)",
  diagonal: "var(--violet)",
};

const legendItems = [
  { label: "X axis: Average hold days", color: "var(--muted)" },
  { label: "Y axis: Expectancy ($)", color: "var(--text)" },
  { label: "Bubble size: Realized P&L magnitude", color: "var(--border)" },
  { label: "long_call", color: tagColors.long_call },
  { label: "stock", color: tagColors.stock },
  { label: "bull_vertical", color: tagColors.bull_vertical },
  { label: "diagonal", color: tagColors.diagonal },
  { label: "other", color: "var(--muted)" },
] as const;

function ExpectancyLegend(_props: LegendProps) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-muted">
      {legendItems.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-full border border-border"
            style={{ backgroundColor: item.color }}
          />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export function ExpectancyScatterWidget() {
  const { selectedAccounts } = useAccountFilterContext();
  const [rows, setRows] = useState<SetupSummaryRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      const query = new URLSearchParams({ page: "1", pageSize: "1000" });
      applyAccountIdsToSearchParams(query, selectedAccounts);
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
  }, [selectedAccounts]);

  const grouped = useMemo(() => {
    const map = new Map<string, Array<{ x: number; y: number; z: number; row: SetupSummaryRecord }>>();

    for (const row of rows) {
      if (!selectedAccounts.includes(row.accountId)) {
        continue;
      }

      const tag = row.overrideTag ?? row.tag;
      const points = map.get(tag) ?? [];
      points.push({
        x: safeNumber(row.averageHoldDays),
        y: safeNumber(row.expectancy),
        z: Math.max(1, Math.abs(safeNumber(row.realizedPnl))),
        row,
      });
      map.set(tag, points);
    }

    return map;
  }, [rows, selectedAccounts]);

  return (
    <WidgetCard title="Expectancy vs Hold">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, bottom: 12, left: 0 }}>
            <XAxis dataKey="x" name="Average Hold (days)" tick={{ fill: "var(--muted)", fontSize: 10 }} />
            <YAxis dataKey="y" name="Expectancy ($ / lot)" tick={{ fill: "var(--muted)", fontSize: 10 }} />
            <ZAxis dataKey="z" range={[40, 260]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              contentStyle={{ background: "var(--panel-2)", borderColor: "var(--border)", color: "var(--text)" }}
              formatter={(_value, _name, item) => {
                const row = item.payload.row as SetupSummaryRecord;
                return [`${formatCurrency(safeNumber(row.expectancy))} / lot`, `Expectancy · ${row.overrideTag ?? row.tag}`];
              }}
            />
            <Legend verticalAlign="bottom" align="left" content={<ExpectancyLegend />} />
            {Array.from(grouped.entries()).map(([tag, points]) => (
              <Scatter key={tag} data={points} fill={tagColors[tag] ?? "var(--muted)"} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </WidgetCard>
  );
}
