"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import type { DiagnosticsResponse } from "@/types/api";

interface DiagnosticsPayload {
  data: DiagnosticsResponse;
}

export function DiagnosticsPanel() {
  const [data, setData] = useState<DiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDiagnostics() {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/diagnostics", { cache: "no-store" });
      if (!response.ok) {
        setError("Unable to load diagnostics.");
        setLoading(false);
        return;
      }

      const payload = (await response.json()) as DiagnosticsPayload;
      setData(payload.data);
      setLoading(false);
    }

    void loadDiagnostics();
  }, []);

  const hasData = Boolean(
    data &&
      (data.warningsCount > 0 ||
        data.unsupportedRowCount > 0 ||
        data.syntheticExpirationCount > 0 ||
        data.setupInference.setupInferenceTotal > 0),
  );

  return (
    <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/40 p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-100">Diagnostics</h2>
        <p className="text-sm text-slate-300">Parse, matching, and setup coverage with surfaced warnings and assumptions.</p>
      </header>

      {loading ? <LoadingSkeleton lines={6} /> : null}
      {error ? <p className="text-sm text-red-200">{error}</p> : null}

      {!loading && !error && !hasData ? (
        <div className="rounded-xl border border-slate-700/80 bg-slate-950/60 p-6">
          <h3 className="text-lg font-medium text-slate-100">No diagnostic signals yet</h3>
          <p className="mt-2 text-sm text-slate-300">Run imports and matching flows to populate parse, match, and setup diagnostics.</p>
          <Link href="/imports" className="mt-3 inline-block text-sm text-blue-300 underline">
            Go to Imports & Connections
          </Link>
        </div>
      ) : null}

      {!loading && !error && data && hasData ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Parse Coverage</p>
              <p className="text-lg font-semibold text-slate-100">{(data.parseCoverage * 100).toFixed(2)}%</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Unsupported Rows</p>
              <p className="text-lg font-semibold text-slate-100">{data.unsupportedRowCount}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Matching Coverage</p>
              <p className="text-lg font-semibold text-slate-100">{(data.matchingCoverage * 100).toFixed(2)}%</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Uncategorized Setups</p>
              <p className="text-lg font-semibold text-slate-100">{data.uncategorizedCount}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Warning Count</p>
              <p className="text-lg font-semibold text-slate-100">{data.warningsCount}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Synthetic Expiration Closes</p>
              <p className="text-lg font-semibold text-slate-100">{data.syntheticExpirationCount}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Setup Inference Total</p>
              <p className="text-lg font-semibold text-slate-100">{data.setupInference.setupInferenceTotal}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Short Call Standalone</p>
              <p className="text-lg font-semibold text-slate-100">{data.setupInference.setupInferenceShortCallStandaloneTotal}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Short Call Paired</p>
              <p className="text-lg font-semibold text-slate-100">{data.setupInference.setupInferenceShortCallPairedTotal}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Pair Outcomes</p>
              <p className="text-sm text-slate-100">
                V {data.setupInference.setupInferencePairVerticalTotal} · C {data.setupInference.setupInferencePairCalendarTotal} · D{" "}
                {data.setupInference.setupInferencePairDiagonalTotal}
              </p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Pair Failures</p>
              <p className="text-sm text-slate-100">
                No overlap {data.setupInference.setupInferencePairFailNoOverlapLongCallTotal} · No exp{" "}
                {data.setupInference.setupInferencePairFailNoEligibleExpTotal} · Missing meta{" "}
                {data.setupInference.setupInferencePairFailMissingMetadataTotal}
              </p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Pair Ambiguities</p>
              <p className="text-lg font-semibold text-slate-100">{data.setupInference.setupInferencePairAmbiguousTotal}</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
            <h3 className="text-sm font-semibold text-slate-100">Surfaced Warnings / Assumptions</h3>
            {data.warningSamples.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">No warning samples available.</p>
            ) : (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-200">
                {data.warningSamples.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
            <h3 className="text-sm font-semibold text-slate-100">Setup Inference Samples</h3>
            {data.setupInference.setupInferenceSamples.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">No setup inference samples available.</p>
            ) : (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-100">
                {data.setupInference.setupInferenceSamples.map((sample, index) => (
                  <li key={`${sample.code}-${index}`}>
                    [{sample.code}] {sample.underlyingSymbol}: {sample.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
