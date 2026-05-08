"use client";

import Link from "next/link";
import { useContext, useEffect, useMemo, useState } from "react";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { RangeFilterContext } from "@/contexts/RangeFilterContext";
import { fetchAllPages } from "@/lib/api/fetch-all-pages";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { buildDiagnosticCaseHref } from "@/lib/diagnostics/case-file-link";
import { formatCurrency, safeNumber } from "@/components/widgets/utils";
import type { MatchedLotRecord } from "@/types/api";

function displaySymbol(row: Pick<MatchedLotRecord, "symbol" | "underlyingSymbol">): string {
  return row.underlyingSymbol ?? row.symbol;
}

export function RecentMatchedLotsWidget() {
  const { selectedAccounts, getAccountDisplayText } = useAccountFilterContext();
  const { range, applyRangeToSearchParams } = useContext(RangeFilterContext);
  const [rows, setRows] = useState<MatchedLotRecord[]>([]);
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
        const payload = await fetchAllPages<MatchedLotRecord>("/api/matched-lots", query);
        if (!cancelled) {
          setRows(payload.data);
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setError("Unable to load recent matched lots.");
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

  const recentRows = useMemo(() => {
    return rows
      .filter((row) => Boolean(row.closeTradeDate) && selectedAccounts.includes(row.accountId))
      .sort((left, right) => String(right.closeTradeDate).localeCompare(String(left.closeTradeDate)))
      .slice(0, 8);
  }, [rows, selectedAccounts]);

  return (
    <WidgetCard title="Recent Matched Lots">
      {loading ? <p className="text-xs text-text-2">Loading recent closes…</p> : null}
      {error ? <p className="text-xs text-neg">{error}</p> : null}

      {!loading && !error && recentRows.length === 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-text-2">No recently closed matched lots in this scope.</p>
          <Link href="/trade-records?tab=matched-lots" className="text-xs text-accent underline">
            Open Matched Lots
          </Link>
        </div>
      ) : null}

      {!loading && !error && recentRows.length > 0 ? (
        <div className="space-y-2">
          {recentRows.map((row) => {
            const pnl = safeNumber(row.realizedPnl);
            return (
              <div key={row.id} className="grid grid-cols-[1fr_auto] gap-2 text-xs">
                <div>
                  <p className="font-semibold text-text">{displaySymbol(row)}</p>
                  <p className="text-text-2">
                    {(row.closeTradeDate ?? row.openTradeDate).slice(0, 10)} · {getAccountDisplayText(row.accountId)} · {row.outcome} · {row.holdingDays}d
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className={pnl >= 0 ? "text-pos" : "text-neg"}>{formatCurrency(pnl)}</p>
                  <Link href={buildDiagnosticCaseHref({ kind: "matched_lot", matchedLotId: row.id })} className="text-[10px] text-accent underline">
                    Case file
                  </Link>
                </div>
              </div>
            );
          })}
          <Link href="/trade-records?tab=matched-lots" className="inline-block text-xs text-accent underline">
            View all →
          </Link>
        </div>
      ) : null}
    </WidgetCard>
  );
}
