"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { RangeFilterContext } from "@/contexts/RangeFilterContext";
import { applyAccountIdsToSearchParams, isAccountInScope } from "@/lib/api/account-scope";
import { formatCurrency, safeNumber } from "@/components/widgets/utils";
import type { MatchedLotRecord } from "@/types/api";

interface MatchedLotsPayload {
  data: MatchedLotRecord[];
}

export function SymbolPnlWidget() {
  const { selectedAccounts } = useAccountFilterContext();
  const { range, applyRangeToSearchParams } = useContext(RangeFilterContext);
  const [rows, setRows] = useState<MatchedLotRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      const query = new URLSearchParams({ page: "1", pageSize: "1000" });
      applyAccountIdsToSearchParams(query, selectedAccounts);
      applyRangeToSearchParams(query);
      const response = await fetch(`/api/matched-lots?${query.toString()}`, { cache: "no-store" });
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
  }, [selectedAccounts, range.startDate, range.endDate, applyRangeToSearchParams]);

  const grouped = useMemo(() => {
    const map = new Map<string, number>();

    for (const row of rows) {
      if (!isAccountInScope(selectedAccounts, row.accountId)) {
        continue;
      }

      map.set(row.symbol, (map.get(row.symbol) ?? 0) + safeNumber(row.realizedPnl));
    }

    return Array.from(map.entries()).map(([symbol, pnl]) => ({ symbol, pnl }));
  }, [rows, selectedAccounts]);

  const winners = useMemo(() => grouped.filter((entry) => entry.pnl >= 0).sort((left, right) => right.pnl - left.pnl).slice(0, 10), [grouped]);
  const losers = useMemo(() => grouped.filter((entry) => entry.pnl < 0).sort((left, right) => left.pnl - right.pnl).slice(0, 10), [grouped]);

  return (
    <WidgetCard title="Symbol P&L Ranking">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs text-text-2">Top Winners</p>
          <div className="space-y-1">
            {winners.map((row) => (
              <div key={row.symbol} className="flex items-center justify-between text-xs">
                <span className="text-text">{row.symbol}</span>
                <span className="text-pos">{formatCurrency(row.pnl)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs text-text-2">Top Losers</p>
          <div className="space-y-1">
            {losers.map((row) => (
              <div key={row.symbol} className="flex items-center justify-between text-xs">
                <span className="text-text">{row.symbol}</span>
                <span className="text-red-300">{formatCurrency(row.pnl)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </WidgetCard>
  );
}
