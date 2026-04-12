"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { KpiCard } from "@/components/KpiCard";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import type { OverviewSummaryResponse } from "@/types/api";

interface OverviewPayload {
  data: OverviewSummaryResponse;
}

export function OverviewDashboardPanel() {
  const { selectedAccounts } = useAccountFilterContext();
  const [data, setData] = useState<OverviewSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOverview() {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (selectedAccounts.length > 0) {
        params.set("accountIds", selectedAccounts.join(","));
      }

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
  }, [selectedAccounts]);

  const hasData = Boolean(data && (data.executionCount > 0 || data.snapshotCount > 0 || data.matchedLotCount > 0));
  const snapshotPreview = useMemo(() => {
    if (!data) {
      return [];
    }

    return [...data.snapshotSeries].slice(-12);
  }, [data]);

  return (
    <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/40 p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-100">Overview Summary</h2>
        <p className="text-sm text-slate-300">Headline P&L and activity metrics, import quality checks, and equity-curve-ready snapshot series.</p>
      </header>

      {loading ? <LoadingSkeleton lines={6} /> : null}
      {error ? <p className="text-sm text-red-200">{error}</p> : null}

      {!loading && !error && !hasData ? (
        <div className="rounded-xl border border-slate-700/80 bg-slate-950/60 p-6">
          <h3 className="text-lg font-medium text-slate-100">No overview metrics yet</h3>
          <p className="mt-2 text-sm text-slate-300">Import and commit statements to generate execution, matched-lot, setup, and snapshot metrics.</p>
          <Link href="/imports" className="mt-3 inline-block text-sm text-blue-300 underline">
            Go to Imports & Connections
          </Link>
        </div>
      ) : null}

      {!loading && !error && data && hasData ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <KpiCard label="Net P&L" value={data.netPnl} colorVariant={Number(data.netPnl) >= 0 ? "pos" : "neg"} />
            <KpiCard label="Executions" value={data.executionCount} colorVariant="accent" />
            <KpiCard label="Matched Lots" value={data.matchedLotCount} colorVariant="accent" />
            <KpiCard label="Setup Groups" value={data.setupCount} colorVariant="accent" />
            <KpiCard label="Average Hold Days" value={data.averageHoldDays} colorVariant="neutral" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
              <h3 className="text-sm font-semibold text-slate-100">Import Quality Summary</h3>
              <dl className="mt-3 space-y-2 text-xs text-slate-300">
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

            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
              <h3 className="text-sm font-semibold text-slate-100">Snapshot Series Preview</h3>
              <p className="mt-1 text-xs text-slate-400">Latest 12 points for equity-curve rendering inputs.</p>
              <div className="mt-3 max-h-56 overflow-auto rounded border border-slate-700">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-900 text-slate-300">
                    <tr>
                      <th className="px-2 py-2 text-left">Date</th>
                      <th className="px-2 py-2 text-left">Account</th>
                      <th className="px-2 py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshotPreview.map((snapshot) => (
                      <tr key={`${snapshot.accountId}-${snapshot.snapshotDate}`} className="border-t border-slate-800 text-slate-200">
                        <td className="px-2 py-2">{snapshot.snapshotDate.slice(0, 10)}</td>
                        <td className="px-2 py-2">{snapshot.accountId}</td>
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
