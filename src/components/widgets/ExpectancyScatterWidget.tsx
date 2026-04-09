"use client";

import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
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

export function ExpectancyScatterWidget() {
  const { selectedAccounts } = useAccountFilterContext();
  const [rows, setRows] = useState<SetupSummaryRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      const response = await fetch("/api/setups?page=1&pageSize=1000", { cache: "no-store" });
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
  }, []);

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
          <ScatterChart>
            <XAxis dataKey="x" name="Average Hold" tick={{ fill: "var(--muted)", fontSize: 10 }} />
            <YAxis dataKey="y" name="Expectancy" tick={{ fill: "var(--muted)", fontSize: 10 }} />
            <ZAxis dataKey="z" range={[40, 260]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              contentStyle={{ background: "var(--panel-2)", borderColor: "var(--border)", color: "var(--text)" }}
              formatter={(_value, _name, item) => {
                const row = item.payload.row as SetupSummaryRecord;
                return [formatCurrency(safeNumber(row.realizedPnl)), row.overrideTag ?? row.tag];
              }}
            />
            {Array.from(grouped.entries()).map(([tag, points]) => (
              <Scatter key={tag} data={points} fill={tagColors[tag] ?? "var(--muted)"} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </WidgetCard>
  );
}
