"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { winLossFlatChartData, winRateFromCounts, type WinLossFlatCounts } from "@/lib/metrics/win-loss-flat";
import { formatNullablePercent } from "@/components/widgets/utils";

interface WinLossFlatChartProps {
  counts: WinLossFlatCounts;
}

export function WinLossFlatChart({ counts }: WinLossFlatChartProps) {
  const chartData = winLossFlatChartData(counts);
  const winRate = winRateFromCounts(counts);

  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-2">
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} dataKey="value" innerRadius={35} outerRadius={52} paddingAngle={2}>
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-1 text-xs text-text-2">
        <p className="text-base font-semibold text-text" title="Percent of closed lots with positive outcome. Flat lots excluded.">
          Win Rate (%): {formatNullablePercent(winRate, 1)}
        </p>
        {chartData.map((entry) => (
          <p key={entry.name}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    </div>
  );
}
