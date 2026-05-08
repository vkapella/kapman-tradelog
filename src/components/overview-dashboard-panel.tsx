"use client";

import Link from "next/link";
import { useContext, useEffect, useMemo, useState } from "react";
import { AccountLabel } from "@/components/accounts/AccountLabel";
import { KpiCard } from "@/components/KpiCard";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import type { InfoTooltipContent } from "@/components/widgets/InfoTooltip";
import { formatCurrency, formatDays, formatInteger } from "@/components/widgets/utils";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { RangeFilterContext } from "@/contexts/RangeFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import type { OverviewSummaryResponse } from "@/types/api";

interface OverviewPayload {
  data: OverviewSummaryResponse;
}

const overviewKpiHelpText: Record<string, InfoTooltipContent> = {
  netPnl: {
    formula: "Sum of matched lot realized P&L in scope.",
    source: "/api/overview/summary",
    interpretation: "Shows aggregate realized performance for the selected accounts.",
  },
  executions: {
    formula: "Count of execution records after account scoping.",
    source: "/api/overview/summary",
    interpretation: "Shows raw trading activity volume.",
  },
  matchedLots: {
    formula: "Count of matched lots after FIFO pairing.",
    source: "/api/overview/summary",
    interpretation: "Shows how many closed lots are available for analysis.",
  },
  setupGroups: {
    formula: "Count of persisted setup groups in scope.",
    source: "/api/overview/summary",
    interpretation: "Shows how many grouped setups exist for review.",
  },
  averageHoldDays: {
    formula: "Average holdingDays across matched lots.",
    source: "/api/overview/summary",
    interpretation: "Shows the typical duration of closed positions.",
  },
};

export function OverviewDashboardPanel() {
  const { selectedAccounts } = useAccountFilterContext();
  const { range, applyRangeToSearchParams } = useContext(RangeFilterContext);
  const [data, setData] = useState<OverviewSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOverview() {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      applyAccountIdsToSearchParams(params, selectedAccounts);
      applyRangeToSearchParams(params);

      const response = await fetch(`/api/overview/summary?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        setError("Unable to load overview summary.");
        setLoading(false);
        return;
      }

      const payload = (await response.json()) as OverviewPayload;
      setData(payload.data);
      setLoading(false);
    }

    void loadOverview();
  }, [selectedAccounts, range.startDate, range.endDate, applyRangeToSearchParams]);

  const hasData = Boolean(data && (data.executionCount > 0 || data.snapshotCount > 0 || data.matchedLotCount > 0));
  const snapshotPreview = useMemo(() => {
    if (!data) {
      return [];
    }

    return [...data.snapshotSeries].slice(-12);
  }, [data]);

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-text">Overview Summary</h2>
        <p className="text-sm text-text-2">Headline P&L and activity metrics, import quality checks, and cash-balance-curve snapshot series.</p>
      </header>

      {loading ? <LoadingSkeleton lines={6} /> : null}
      {error ? <p className="text-sm text-neg">{error}</p> : null}

      {!loading && !error && !hasData ? (
        <div className="rounded-xl border border-border bg-bg p-6">
          <h3 className="text-lg font-medium text-text">No overview metrics yet</h3>
          <p className="mt-2 text-sm text-text-2">Import and commit statements to generate execution, matched-lot, setup, and snapshot metrics.</p>
          <Link href="/imports" className="mt-3 inline-block text-sm text-accent underline">
            Go to Imports & Connections
          </Link>
        </div>
      ) : null}

      {!loading && !error && data && hasData ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <KpiCard label="Net P&L" value={formatCurrency(Number(data.netPnl))} colorVariant={Number(data.netPnl) >= 0 ? "pos" : "neg"} helpText={overviewKpiHelpText.netPnl} />
            <KpiCard label="Executions" value={formatInteger(data.executionCount)} colorVariant="accent" helpText={overviewKpiHelpText.executions} />
            <KpiCard label="Matched Lots" value={formatInteger(data.matchedLotCount)} colorVariant="accent" helpText={overviewKpiHelpText.matchedLots} />
            <KpiCard label="Setup Groups" value={formatInteger(data.setupCount)} colorVariant="accent" helpText={overviewKpiHelpText.setupGroups} />
            <KpiCard label="Average Hold Days" value={formatDays(Number(data.averageHoldDays), 1)} colorVariant="neutral" helpText={overviewKpiHelpText.averageHoldDays} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-bg p-4">
              <h3 className="text-sm font-semibold text-text">Import Quality Summary</h3>
              <dl className="mt-3 space-y-2 text-xs text-text-2">
                <div className="flex justify-between">
                  <dt>Total imports</dt>
                  <dd>{data.importQuality.totalImports}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Committed imports</dt>
                  <dd>{data.importQuality.committedImports}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Failed imports</dt>
                  <dd>{data.importQuality.failedImports}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Parsed rows</dt>
                  <dd>{data.importQuality.parsedRows}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Skipped rows</dt>
                  <dd>{data.importQuality.skippedRows}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Snapshot rows</dt>
                  <dd>{data.snapshotCount}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-lg border border-border bg-bg p-4">
              <h3 className="text-sm font-semibold text-text">Snapshot Series Preview</h3>
              <p className="mt-1 text-xs text-text-3">Latest 12 points for cash balance curve rendering inputs.</p>
              <div className="mt-3 max-h-56 overflow-auto rounded border border-border">
                <table className="min-w-full text-xs">
                  <thead className="bg-surface text-text-2">
                    <tr>
                      <th className="px-2 py-2 text-left">Date</th>
                      <th className="px-2 py-2 text-left">Account</th>
                      <th className="px-2 py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshotPreview.map((snapshot) => (
                      <tr key={`${snapshot.accountId}-${snapshot.snapshotDate}`} className="border-t border-border text-text">
                        <td className="px-2 py-2">{snapshot.snapshotDate.slice(0, 10)}</td>
                        <td className="px-2 py-2">
                          <AccountLabel accountId={snapshot.accountId} />
                        </td>
                        <td className="px-2 py-2 text-right">{snapshot.balance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
