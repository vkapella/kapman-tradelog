"use client";

import { useEffect, useMemo, useState } from "react";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { formatCurrency, safeNumber } from "@/components/widgets/utils";
import type { SetupSummaryRecord } from "@/types/api";

interface SetupsPayload {
  data: SetupSummaryRecord[];
}

export function TopSetupsWidget() {
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

  const topRows = useMemo(() => {
    return rows
      .filter((row) => selectedAccounts.includes(row.accountId))
      .sort((left, right) => safeNumber(right.realizedPnl) - safeNumber(left.realizedPnl))
      .slice(0, 10);
  }, [rows, selectedAccounts]);

  const maxAbs = useMemo(() => Math.max(1, ...topRows.map((row) => Math.abs(safeNumber(row.realizedPnl)))), [topRows]);

  return (
    <WidgetCard title="Top Setups by P&L">
      <div className="space-y-2">
        {topRows.map((row) => {
          const pnl = safeNumber(row.realizedPnl);
          const barWidth = Math.round((Math.abs(pnl) / maxAbs) * 100);

          return (
            <div key={row.id} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <p className="text-text">{(row.overrideTag ?? row.tag) + " · " + row.underlyingSymbol}</p>
                <p className={pnl >= 0 ? "text-accent-2" : "text-red-300"}>{formatCurrency(pnl)}</p>
              </div>
              <div className="h-2 rounded bg-panel-2">
                <div className={pnl >= 0 ? "h-2 rounded bg-accent-2" : "h-2 rounded bg-red-300"} style={{ width: `${barWidth}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </WidgetCard>
  );
}
