"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { formatCurrency } from "@/components/widgets/utils";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { openPositionsStore } from "@/store/openPositionsStore";

function formatQuoteTimestamp(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

// Span, not a single timestamp: partially stale selections must read as such.
function formatFreshnessSpan(freshness: { oldestRefreshedAt: number | null; newestRefreshedAt: number | null; accountsWithoutData: string[] }): string {
  const { oldestRefreshedAt, newestRefreshedAt, accountsWithoutData } = freshness;
  const missingSuffix = accountsWithoutData.length > 0 ? ` · ${accountsWithoutData.length} ${accountsWithoutData.length === 1 ? "account" : "accounts"} without data` : "";
  if (oldestRefreshedAt === null || newestRefreshedAt === null) {
    return accountsWithoutData.length > 0 ? `no data${missingSuffix}` : "—";
  }
  if (oldestRefreshedAt === newestRefreshedAt) {
    return `${formatQuoteTimestamp(newestRefreshedAt)}${missingSuffix}`;
  }
  return `spans ${formatQuoteTimestamp(oldestRefreshedAt)} – ${formatQuoteTimestamp(newestRefreshedAt)}${missingSuffix}`;
}

export function OpenPositionsSummaryWidget() {
  const { selectedAccounts } = useAccountFilterContext();
  const snapshot = useSyncExternalStore(
    openPositionsStore.subscribe,
    () => openPositionsStore.getSnapshot(selectedAccounts),
    () => openPositionsStore.getSnapshot(selectedAccounts),
  );

  const filtered = snapshot.positions;
  const totalCostBasis = useMemo(() => filtered.reduce((sum, row) => sum + row.costBasis, 0), [filtered]);
  const markValue = useMemo(() => {
    if (filtered.length === 0) {
      return snapshot.lastRefreshedAt === null ? null : 0;
    }

    let total = 0;
    for (const position of filtered) {
      const mark = snapshot.quotes[position.instrumentKey]?.mark;
      if (typeof mark !== "number") {
        return null;
      }

      total += mark * position.netQty * (position.assetClass === "OPTION" ? 100 : 1);
    }

    return total;
  }, [filtered, snapshot.lastRefreshedAt, snapshot.quotes]);
  const unrealized = markValue === null ? null : markValue - totalCostBasis;

  return (
    <WidgetCard title="Open Positions Summary">
      <div className="space-y-1 text-xs text-text-2">
        <p>Open positions: {filtered.length}</p>
        <p>Cost basis: {formatCurrency(totalCostBasis)}</p>
        <p>Mark value: {markValue === null ? "—" : formatCurrency(markValue)}</p>
        <p className={unrealized !== null && unrealized >= 0 ? "text-pos" : "text-neg"}>
          Unrealized: {unrealized === null ? "—" : formatCurrency(unrealized)}
        </p>
        <p>Last quoted: {formatFreshnessSpan(snapshot.freshness)}</p>
      </div>
      <Link href="/positions" className="mt-2 inline-block text-xs text-accent underline">
        View positions →
      </Link>
    </WidgetCard>
  );
}
