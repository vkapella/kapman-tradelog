"use client";

import { useEffect, useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { safeNumber } from "@/components/widgets/utils";
import type { OverviewSummaryResponse } from "@/types/api";

interface OverviewPayload {
  data: OverviewSummaryResponse;
}

export function EquityCurveWidget() {
  const { selectedAccounts } = useAccountFilterContext();
  const [viewMode, setViewMode] = useState<"combined" | "accounts">("combined");
  const [data, setData] = useState<OverviewSummaryResponse["snapshotSeries"]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      const response = await fetch("/api/overview/summary", { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as OverviewPayload;
      if (!cancelled) {
        setData(payload.data.snapshotSeries);
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const accounts = useMemo(() => {
    return Array.from(new Set(data.map((point) => point.accountId).filter((accountId) => selectedAccounts.includes(accountId)))).sort();
  }, [data, selectedAccounts]);

  const chartRows = useMemo(() => {
    const rowsByDate = new Map<string, Record<string, number | string>>();

    for (const point of data) {
      if (!selectedAccounts.includes(point.accountId)) {
        continue;
      }

      const dateKey = point.snapshotDate.slice(0, 10);
      const row = rowsByDate.get(dateKey) ?? { date: dateKey, combined: 0 };
      const balance = safeNumber(point.balance);
      row[point.accountId] = balance;
      row.combined = safeNumber(row.combined) + balance;
      rowsByDate.set(dateKey, row);
    }

    return Array.from(rowsByDate.values()).sort((left, right) => String(left.date).localeCompare(String(right.date)));
  }, [data, selectedAccounts]);

  return (
    <WidgetCard
      title="Equity Curve"
      action={
        <button
          type="button"
          onClick={() => setViewMode((current) => (current === "combined" ? "accounts" : "combined"))}
          className="rounded border border-border bg-panel-2 px-2 py-0.5 text-[10px] text-muted"
        >
          {viewMode === "combined" ? "Combined" : "Per Account"}
        </button>
      }
    >
      {chartRows.length === 0 ? (
        <p className="text-xs text-muted">No snapshot data available.</p>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartRows}>
              <XAxis dataKey="date" tick={{ fill: "var(--muted)", fontSize: 10 }} />
              <YAxis tick={{ fill: "var(--muted)", fontSize: 10 }} tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}K`} />
              <Tooltip
                contentStyle={{ background: "var(--panel-2)", borderColor: "var(--border)", color: "var(--text)" }}
                formatter={(value: number) => [value.toFixed(2), "Balance"]}
              />
              {viewMode === "combined" ? (
                <Line type="monotone" dataKey="combined" stroke="var(--accent)" strokeWidth={2} dot={false} />
              ) : (
                accounts.map((accountId, index) => (
                  <Line
                    key={accountId}
                    type="monotone"
                    dataKey={accountId}
                    stroke={index % 2 === 0 ? "var(--accent)" : "var(--accent-2)"}
                    strokeWidth={2}
                    dot={false}
                  />
                ))
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </WidgetCard>
  );
}
