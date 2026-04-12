"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { navGroups } from "@/lib/navigation";

interface PageStatsPayload {
  data: {
    accountTotal: number;
    importTotal: number;
    snapshotTotal: number;
  };
}

interface OverviewSummaryPayload {
  data: {
    executionCount: number;
  };
}

export function SidebarNav() {
  const pathname = usePathname();
  const { selectedAccounts } = useAccountFilterContext();
  const [accountTotal, setAccountTotal] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [snapshotTotal, setSnapshotTotal] = useState(0);
  const [executionCount, setExecutionCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadSidebarStats() {
      try {
        const statsQuery = new URLSearchParams();
        const summaryQuery = new URLSearchParams();
        applyAccountIdsToSearchParams(statsQuery, selectedAccounts);
        applyAccountIdsToSearchParams(summaryQuery, selectedAccounts);

        const [statsResponse, summaryResponse] = await Promise.all([
          fetch(`/api/page-stats?${statsQuery.toString()}`, { cache: "no-store" }),
          fetch(`/api/overview/summary?${summaryQuery.toString()}`, { cache: "no-store" }),
        ]);

        if (!cancelled && statsResponse.ok) {
          const statsPayload = (await statsResponse.json()) as PageStatsPayload;
          setAccountTotal(statsPayload.data.accountTotal);
          setImportTotal(statsPayload.data.importTotal);
          setSnapshotTotal(statsPayload.data.snapshotTotal);
        }

        if (!cancelled && summaryResponse.ok) {
          const summaryPayload = (await summaryResponse.json()) as OverviewSummaryPayload;
          setExecutionCount(summaryPayload.data.executionCount);
        }
      } catch {
        if (!cancelled) {
          setAccountTotal(0);
          setImportTotal(0);
          setSnapshotTotal(0);
          setExecutionCount(0);
        }
      }
    }

    void loadSidebarStats();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts]);

  const badgeValues = useMemo(
    () => ({
      executionCount,
      importCount: importTotal,
    }),
    [executionCount, importTotal],
  );

  return (
    <div className="flex min-h-[calc(100vh-180px)] flex-col justify-between">
      <nav className="space-y-5">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 text-[10px] uppercase tracking-[0.08em] text-muted">{group.label}</p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                const badgeValue = item.badgeKey ? badgeValues[item.badgeKey] : null;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      "flex items-center justify-between border-l-2 px-2 py-2 text-[11px] font-medium transition-colors",
                      isActive ? "border-accent bg-accent/10 text-text" : "border-transparent text-muted hover:bg-panel-2 hover:text-text",
                    ].join(" ")}
                  >
                    <span>{item.label}</span>
                    {typeof badgeValue === "number" ? (
                      <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[10px] text-muted">{badgeValue}</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <p className="mt-4 text-[10px] text-muted">v7.0 · {accountTotal} accounts · {snapshotTotal} snapshots</p>
    </div>
  );
}
