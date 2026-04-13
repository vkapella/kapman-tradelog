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
      const mark = snapshot.quotes[position.instrumentKey];
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
      <div className="space-y-1 text-xs text-muted">
        <p>Open positions: {filtered.length}</p>
        <p>Cost basis: {formatCurrency(totalCostBasis)}</p>
        <p>Mark value: {markValue === null ? "—" : formatCurrency(markValue)}</p>
        <p className={unrealized !== null && unrealized >= 0 ? "text-accent-2" : "text-red-300"}>
          Unrealized: {unrealized === null ? "—" : formatCurrency(unrealized)}
        </p>
        <p>Last quoted: {formatQuoteTimestamp(snapshot.lastRefreshedAt)}</p>
      </div>
      <Link href="/positions" className="mt-2 inline-block text-xs text-accent underline">
        View positions →
      </Link>
    </WidgetCard>
  );
}
