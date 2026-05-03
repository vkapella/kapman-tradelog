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
    <div className="flex min-h-[calc(100vh-var(--topbar-h))] flex-col justify-between py-2">
      <nav>
        {navGroups.map((group) => (
          <div key={group.label} className="mb-[3px]">
            <p
              style={{
                color: "var(--text-3)",
                fontSize: "9.5px",
                fontWeight: 700,
                letterSpacing: "0.10em",
                padding: "6px 14px 2px",
              }}
            >
              {group.label}
            </p>
            <div>
              {group.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                const badgeValue = item.badgeKey ? badgeValues[item.badgeKey] : null;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      "flex items-center justify-between border-l-2 transition-colors hover:bg-surface-2",
                      isActive ? "" : "border-transparent",
                    ].join(" ")}
                    style={{
                      background: isActive ? "var(--accent-dim)" : "transparent",
                      borderLeftColor: isActive ? "var(--accent)" : "transparent",
                      color: isActive ? "var(--accent)" : "var(--text-2)",
                      fontSize: "12px",
                      fontWeight: isActive ? 500 : 400,
                      padding: "6px 14px",
                    }}
                  >
                    <span>{item.label}</span>
                    {typeof badgeValue === "number" ? (
                      <span
                        style={{
                          background: "var(--surface-3)",
                          borderRadius: "3px",
                          color: "var(--text-3)",
                          fontFamily: "var(--mono)",
                          fontSize: "10px",
                          padding: "1px 5px",
                        }}
                      >
                        {badgeValue}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <p className="px-[14px] pb-3" style={{ color: "var(--text-3)", fontSize: "10px" }}>
        {accountTotal} accounts / {snapshotTotal} snapshots
      </p>
    </div>
  );
}
