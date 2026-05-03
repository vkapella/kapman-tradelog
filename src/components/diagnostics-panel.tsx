"use client";

import Link from "next/link";
import { useContext, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DiagnosticCaseFilePanel } from "@/components/diagnostic-case-file-panel";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { RangeFilterContext } from "@/contexts/RangeFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import type { DiagnosticsResponse } from "@/types/api";
import { buildDiagnosticCaseHref } from "@/lib/diagnostics/case-file-link";

interface DiagnosticsPayload {
  data: DiagnosticsResponse;
}

export function DiagnosticsPanel() {
  const searchParams = useSearchParams();
  const { selectedAccounts } = useAccountFilterContext();
  const { range, applyRangeToSearchParams } = useContext(RangeFilterContext);
  const [data, setData] = useState<DiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDiagnostics() {
      setLoading(true);
      setError(null);

      const query = new URLSearchParams();
      applyAccountIdsToSearchParams(query, selectedAccounts);
      applyRangeToSearchParams(query);
      const response = await fetch(`/api/diagnostics?${query.toString()}`, { cache: "no-store" });
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
  }, [selectedAccounts, range.startDate, range.endDate, applyRangeToSearchParams]);

  const hasData = Boolean(
    data &&
      (data.warningsCount > 0 ||
        data.unsupportedRowCount > 0 ||
        data.syntheticExpirationCount > 0 ||
        data.setupInference.setupInferenceTotal > 0),
  );
  const caseQuery = {
    kind: searchParams.get("case_kind") ?? "",
    executionId: searchParams.get("execution_id"),
    matchedLotId: searchParams.get("matched_lot_id"),
    setupId: searchParams.get("setup_id"),
    code: searchParams.get("code"),
    underlyingSymbol: searchParams.get("underlying_symbol"),
    lotIds: searchParams.get("lot_ids"),
    message: searchParams.get("message"),
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-text">Diagnostics</h2>
        <p className="text-sm text-text-2">Parse, matching, and setup coverage with surfaced warnings and assumptions.</p>
      </header>

      {loading ? <LoadingSkeleton lines={6} /> : null}
      {error ? <p className="text-sm text-neg">{error}</p> : null}

      {!loading && !error && !hasData ? (
        <div className="rounded-xl border border-border bg-bg p-6">
          <h3 className="text-lg font-medium text-text">No diagnostic signals yet</h3>
          <p className="mt-2 text-sm text-text-2">Run imports and matching flows to populate parse, match, and setup diagnostics.</p>
          <Link href="/imports" className="mt-3 inline-block text-sm text-accent underline">
            Go to Imports & Connections
          </Link>
        </div>
      ) : null}

      {!loading && !error && data && hasData ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-lg border border-border bg-bg p-3">
              <p className="text-xs text-text-3">Parse Coverage</p>
              <p className="text-lg font-semibold text-text">{(data.parseCoverage * 100).toFixed(2)}%</p>
            </div>
            <div className="rounded-lg border border-border bg-bg p-3">
              <p className="text-xs text-text-3">Unsupported Rows</p>
              <p className="text-lg font-semibold text-text">{data.unsupportedRowCount}</p>
            </div>
            <div className="rounded-lg border border-border bg-bg p-3">
              <p className="text-xs text-text-3">Matching Coverage</p>
              <p className="text-lg font-semibold text-text">{(data.matchingCoverage * 100).toFixed(2)}%</p>
            </div>
            <div className="rounded-lg border border-border bg-bg p-3">
              <p className="text-xs text-text-3">Uncategorized Setups</p>
              <p className="text-lg font-semibold text-text">{data.uncategorizedCount}</p>
            </div>
            <div className="rounded-lg border border-border bg-bg p-3">
              <p className="text-xs text-text-3">Warning Count</p>
              <p className="text-lg font-semibold text-text">{data.warningsCount}</p>
            </div>
            <div className="rounded-lg border border-border bg-bg p-3">
              <p className="text-xs text-text-3">Synthetic Expiration Closes</p>
              <p className="text-lg font-semibold text-text">{data.syntheticExpirationCount}</p>
            </div>
            <div className="rounded-lg border border-border bg-bg p-3">
              <p className="text-xs text-text-3">Setup Inference Total</p>
              <p className="text-lg font-semibold text-text">{data.setupInference.setupInferenceTotal}</p>
            </div>
            <div className="rounded-lg border border-border bg-bg p-3">
              <p className="text-xs text-text-3">Short Call Standalone</p>
              <p className="text-lg font-semibold text-text">{data.setupInference.setupInferenceShortCallStandaloneTotal}</p>
            </div>
            <div className="rounded-lg border border-border bg-bg p-3">
              <p className="text-xs text-text-3">Short Call Paired</p>
              <p className="text-lg font-semibold text-text">{data.setupInference.setupInferenceShortCallPairedTotal}</p>
            </div>
            <div className="rounded-lg border border-border bg-bg p-3">
              <p className="text-xs text-text-3">Pair Outcomes</p>
              <p className="text-sm text-text">
                V {data.setupInference.setupInferencePairVerticalTotal} · C {data.setupInference.setupInferencePairCalendarTotal} · D{" "}
                {data.setupInference.setupInferencePairDiagonalTotal}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-bg p-3">
              <p className="text-xs text-text-3">Pair Failures</p>
              <p className="text-sm text-text">
                No overlap {data.setupInference.setupInferencePairFailNoOverlapLongCallTotal} · No exp{" "}
                {data.setupInference.setupInferencePairFailNoEligibleExpTotal} · Missing meta{" "}
                {data.setupInference.setupInferencePairFailMissingMetadataTotal}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-bg p-3">
              <p className="text-xs text-text-3">Pair Ambiguities</p>
              <p className="text-lg font-semibold text-text">{data.setupInference.setupInferencePairAmbiguousTotal}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg p-4">
            <h3 className="text-sm font-semibold text-text">Grouped Warning Signals</h3>
            {data.warningGroups.length === 0 ? (
              <p className="mt-2 text-xs text-text-3">No grouped warnings available.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {data.warningGroups.map((group) => (
                  <div key={group.id} className="rounded border border-border bg-bg p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-amber-100">
                          {group.title} · {group.count}
                        </p>
                        <p className="mt-1 text-xs text-amber-200">{group.summary}</p>
                      </div>
                      {group.caseRef ? (
                        <Link href={buildDiagnosticCaseHref(group.caseRef)} className="shrink-0 text-xs text-accent underline">
                          Open case file
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-bg p-4">
            <h3 className="text-sm font-semibold text-text">Grouped Setup Inference Signals</h3>
            {data.setupInferenceGroups.length === 0 ? (
              <p className="mt-2 text-xs text-text-3">No grouped setup inference samples available.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {data.setupInferenceGroups.map((group) => (
                  <div key={group.id} className="rounded border border-border bg-bg p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-amber-100">
                          [{group.code}] {group.underlyingSymbol ?? "N/A"} · {group.count}
                        </p>
                        <p className="mt-1 text-xs text-amber-100">{group.summary}</p>
                      </div>
                      {group.caseRef ? (
                        <Link href={buildDiagnosticCaseHref(group.caseRef)} className="shrink-0 text-xs text-accent underline">
                          Open case file
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DiagnosticCaseFilePanel query={caseQuery} closeHref="/diagnostics" />
        </div>
      ) : null}
    </section>
  );
}
