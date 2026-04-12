"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/Badge";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import type { ExecutionRecord } from "@/types/api";

interface ExecutionsPayload {
  data: ExecutionRecord[];
}

export function RecentExecutionsWidget() {
  const { selectedAccounts } = useAccountFilterContext();
  const [rows, setRows] = useState<ExecutionRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      const query = new URLSearchParams({ page: "1", pageSize: "1000" });
      applyAccountIdsToSearchParams(query, selectedAccounts);
      const response = await fetch(`/api/executions?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as ExecutionsPayload;
      if (!cancelled) {
        setRows(payload.data);
      }
    }

    void loadRows();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts]);

  const recentRows = useMemo(() => {
    return rows
      .filter((row) => selectedAccounts.includes(row.accountId))
      .sort((left, right) => new Date(right.eventTimestamp).getTime() - new Date(left.eventTimestamp).getTime())
      .slice(0, 10);
  }, [rows, selectedAccounts]);

  return (
    <WidgetCard title="Recent Executions">
      <div className="space-y-2">
        {recentRows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-2 text-xs">
            <div>
              <p className="font-semibold text-text">{row.symbol}</p>
              <p className="text-muted">{new Date(row.tradeDate).toLocaleDateString()} · {row.price ?? "~"}</p>
            </div>
            <div className="flex items-center gap-1">
              {row.side === "BUY" ? <Badge variant="buy">BUY</Badge> : row.side === "SELL" ? <Badge variant="sell">SELL</Badge> : null}
              {row.optionType ? <Badge variant={row.optionType === "PUT" ? "put" : "call"}>{row.optionType}</Badge> : <Badge variant="stub">EQUITY</Badge>}
            </div>
          </div>
        ))}
      </div>
      <Link href="/trade-records?tab=executions" className="mt-2 inline-block text-xs text-accent underline">
        View all →
      </Link>
    </WidgetCard>
  );
}
