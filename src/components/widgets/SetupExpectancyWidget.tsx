"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { RangeFilterContext } from "@/contexts/RangeFilterContext";
import { fetchAllPages } from "@/lib/api/fetch-all-pages";
import { applyAccountIdsToSearchParams, isAccountInScope } from "@/lib/api/account-scope";
import { formatCurrency, formatNullablePercent, safeNumber } from "@/components/widgets/utils";
import type { SetupSummaryRecord } from "@/types/api";

interface TagRollup {
  tag: string;
  lotCount: number;
  realizedPnl: number;
  expectancy: number;
  winRate: number | null;
  averageHoldDays: number | null;
}

export function SetupExpectancyWidget() {
  const { selectedAccounts } = useAccountFilterContext();
  const { range, applyRangeToSearchParams } = useContext(RangeFilterContext);
  const [rows, setRows] = useState<SetupSummaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      setLoading(true);
      setError(null);

      try {
        const query = new URLSearchParams();
        applyAccountIdsToSearchParams(query, selectedAccounts);
        applyRangeToSearchParams(query);
        const payload = await fetchAllPages<SetupSummaryRecord>("/api/setups", query);
        if (!cancelled) {
          setRows(payload.data);
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setError("Unable to load setup expectancy rollups.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadRows();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts, range.startDate, range.endDate, applyRangeToSearchParams]);

  const tagRows = useMemo(() => {
    const grouped = new Map<string, { lotCount: number; realizedPnl: number; wins: number; holds: number; groupsWithHold: number }>();

    for (const row of rows) {
      if (!isAccountInScope(selectedAccounts, row.accountId)) {
        continue;
      }

      const lotCount = Math.max(1, row.setupLotCount ?? 1);
      const tag = row.overrideTag ?? row.tag;
      const current = grouped.get(tag) ?? { lotCount: 0, realizedPnl: 0, wins: 0, holds: 0, groupsWithHold: 0 };
      current.lotCount += lotCount;
      current.realizedPnl += safeNumber(row.realizedPnl);

      const winRate = row.winRate === null ? null : safeNumber(row.winRate);
      if (winRate !== null) {
        current.wins += winRate * lotCount;
      }

      const averageHoldDays = row.averageHoldDays === null ? null : safeNumber(row.averageHoldDays);
      if (averageHoldDays !== null) {
        current.holds += averageHoldDays;
        current.groupsWithHold += 1;
      }

      grouped.set(tag, current);
    }

    return Array.from(grouped.entries())
      .map(([tag, groupedRow]) => {
        const expectancy = groupedRow.lotCount > 0 ? groupedRow.realizedPnl / groupedRow.lotCount : 0;
        const winRate = groupedRow.lotCount > 0 ? groupedRow.wins / groupedRow.lotCount : null;
        const averageHoldDays = groupedRow.groupsWithHold > 0 ? groupedRow.holds / groupedRow.groupsWithHold : null;
        return {
          tag,
          lotCount: groupedRow.lotCount,
          realizedPnl: groupedRow.realizedPnl,
          expectancy,
          winRate,
          averageHoldDays,
        } satisfies TagRollup;
      })
      .sort((left, right) => right.expectancy - left.expectancy);
  }, [rows, selectedAccounts]);

  return (
    <WidgetCard title="Setup Expectancy">
      {loading ? <p className="text-xs text-text-2">Loading expectancy rollups…</p> : null}
      {error ? <p className="text-xs text-neg">{error}</p> : null}

      {!loading && !error && tagRows.length === 0 ? (
        <p className="text-xs text-text-2">No setup groups available for expectancy analysis in this scope.</p>
      ) : null}

      {!loading && !error && tagRows.length > 0 ? (
        <div className="space-y-2">
          {tagRows.slice(0, 8).map((row) => (
            <div key={row.tag} className="rounded border border-border bg-surface-2 p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-text">{row.tag}</p>
                <p className={row.expectancy >= 0 ? "text-pos" : "text-neg"}>{formatCurrency(row.expectancy)} / lot</p>
              </div>
              <p className="mt-1 text-text-2">
                Lots {row.lotCount} · Win {formatNullablePercent(row.winRate === null ? null : row.winRate * 100, 1)} · Avg hold{" "}
                {row.averageHoldDays === null ? "N/A" : `${row.averageHoldDays.toFixed(1)}d`} · Total {formatCurrency(row.realizedPnl)}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </WidgetCard>
  );
}
