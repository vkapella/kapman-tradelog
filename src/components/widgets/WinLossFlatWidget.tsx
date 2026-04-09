"use client";

import { useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import type { MatchedLotRecord } from "@/types/api";

interface MatchedLotsPayload {
  data: MatchedLotRecord[];
}

export function WinLossFlatWidget() {
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

  const counts = useMemo(() => {
    const initial = { WIN: 0, LOSS: 0, FLAT: 0 };
    for (const row of rows) {
      if (!selectedAccounts.includes(row.accountId)) {
        continue;
      }

      if (row.outcome === "WIN") {
        initial.WIN += 1;
      } else if (row.outcome === "LOSS") {
        initial.LOSS += 1;
      } else {
        initial.FLAT += 1;
      }
    }

    return initial;
  }, [rows, selectedAccounts]);

  const chartData = [
    { name: "WIN", value: counts.WIN, color: "var(--accent-2)" },
    { name: "LOSS", value: counts.LOSS, color: "var(--danger)" },
    { name: "FLAT", value: counts.FLAT, color: "var(--muted)" },
  ];

  const winRate = counts.WIN + counts.LOSS === 0 ? 0 : (counts.WIN / (counts.WIN + counts.LOSS)) * 100;

  return (
    <WidgetCard title="Win / Loss / Flat">
      <div className="grid grid-cols-[140px_1fr] items-center gap-2">
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} dataKey="value" innerRadius={35} outerRadius={52} paddingAngle={2}>
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "var(--panel-2)", borderColor: "var(--border)", color: "var(--text)" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-1 text-xs text-muted">
          <p className="text-base font-semibold text-text">Win rate: {winRate.toFixed(1)}%</p>
          {chartData.map((entry) => (
            <p key={entry.name}>
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      </div>
    </WidgetCard>
  );
}
