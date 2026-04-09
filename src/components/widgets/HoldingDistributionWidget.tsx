"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import type { MatchedLotRecord } from "@/types/api";

interface MatchedLotsPayload {
  data: MatchedLotRecord[];
}

export function HoldingDistributionWidget() {
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

  const bucketData = useMemo(() => {
    const buckets = {
      "0-1d": 0,
      "2-5d": 0,
      "6-20d": 0,
      "21d+": 0,
    };

    for (const row of rows) {
      if (!selectedAccounts.includes(row.accountId)) {
        continue;
      }

      if (row.holdingDays <= 1) {
        buckets["0-1d"] += 1;
      } else if (row.holdingDays <= 5) {
        buckets["2-5d"] += 1;
      } else if (row.holdingDays <= 20) {
        buckets["6-20d"] += 1;
      } else {
        buckets["21d+"] += 1;
      }
    }

    return Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));
  }, [rows, selectedAccounts]);

  return (
    <WidgetCard title="Holding Distribution">
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bucketData} layout="vertical">
            <XAxis type="number" tick={{ fill: "var(--muted)", fontSize: 10 }} />
            <YAxis type="category" dataKey="bucket" tick={{ fill: "var(--muted)", fontSize: 10 }} width={56} />
            <Bar dataKey="count" fill="var(--accent)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </WidgetCard>
  );
}
