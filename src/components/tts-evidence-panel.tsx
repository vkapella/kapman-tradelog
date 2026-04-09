"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import type { TtsEvidenceResponse } from "@/types/api";

interface TtsPayload {
  data: TtsEvidenceResponse;
}

export function TtsEvidencePanel() {
  const [data, setData] = useState<TtsEvidenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadEvidence() {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/tts/evidence", { cache: "no-store" });
      if (!response.ok) {
        setError("Unable to load evidence metrics.");
        setLoading(false);
        return;
      }

      const payload = (await response.json()) as TtsPayload;
      setData(payload.data);
      setLoading(false);
    }

    void loadEvidence();
  }, []);

  const hasData = Boolean(data && data.annualizedTradeCount > 0);
  const distributionMax = data ? Math.max(1, ...data.holdingPeriodDistribution.map((bucket) => bucket.count)) : 1;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/40 p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-100">TTS Evidence / Readiness</h2>
        <p className="text-sm text-slate-300">Evidence-oriented activity metrics only. These are informational readiness signals, not legal determinations.</p>
      </header>

      {loading ? <LoadingSkeleton lines={6} /> : null}
      {error ? <p className="text-sm text-red-200">{error}</p> : null}

      {!loading && !error && !hasData ? (
        <div className="rounded-xl border border-slate-700/80 bg-slate-950/60 p-6">
          <h3 className="text-lg font-medium text-slate-100">No evidence metrics yet</h3>
          <p className="mt-2 text-sm text-slate-300">Commit imports and generate matched lots to compute holding-period and activity evidence metrics.</p>
          <Link href="/imports" className="mt-3 inline-block text-sm text-blue-300 underline">
            Go to Imports & Connections
          </Link>
        </div>
      ) : null}

      {!loading && !error && data && hasData ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Trades Per Month</p>
              <p className="text-lg font-semibold text-slate-100">{data.tradesPerMonth}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Active Days Per Week</p>
              <p className="text-lg font-semibold text-slate-100">{data.activeDaysPerWeek}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Annualized Trade Count</p>
              <p className="text-lg font-semibold text-slate-100">{data.annualizedTradeCount}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Average Holding Period (Days)</p>
              <p className="text-lg font-semibold text-slate-100">{data.averageHoldingPeriodDays}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Median Holding Period (Days)</p>
              <p className="text-lg font-semibold text-slate-100">{data.medianHoldingPeriodDays}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Gross Proceeds Proxy</p>
              <p className="text-lg font-semibold text-slate-100">{data.grossProceedsProxy}</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
            <h3 className="text-sm font-semibold text-slate-100">Time-in-Market / Holding-Period Distribution</h3>
            <div className="mt-3 space-y-2">
              {data.holdingPeriodDistribution.map((bucket) => {
                const width = `${Math.round((bucket.count / distributionMax) * 100)}%`;
                return (
                  <div key={bucket.bucket}>
                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <span>{bucket.bucket}</span>
                      <span>{bucket.count}</span>
                    </div>
                    <div className="mt-1 h-2 rounded bg-slate-800">
                      <div className="h-2 rounded bg-blue-400" style={{ width }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
