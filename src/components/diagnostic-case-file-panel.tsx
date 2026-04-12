"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import type { DiagnosticCaseFileResponse } from "@/types/api";

interface DiagnosticCaseFilePayload {
  data: DiagnosticCaseFileResponse;
}

export interface DiagnosticCaseQuery {
  kind: string;
  executionId?: string | null;
  matchedLotId?: string | null;
  setupId?: string | null;
  code?: string | null;
  underlyingSymbol?: string | null;
  lotIds?: string | null;
  message?: string | null;
}

function buildApiQuery(input: DiagnosticCaseQuery): string | null {
  if (!input.kind) {
    return null;
  }

  const query = new URLSearchParams({
    kind: input.kind,
  });
  if (input.executionId) {
    query.set("executionId", input.executionId);
  }
  if (input.matchedLotId) {
    query.set("matchedLotId", input.matchedLotId);
  }
  if (input.setupId) {
    query.set("setupId", input.setupId);
  }
  if (input.code) {
    query.set("code", input.code);
  }
  if (input.underlyingSymbol) {
    query.set("underlyingSymbol", input.underlyingSymbol);
  }
  if (input.lotIds) {
    query.set("lotIds", input.lotIds);
  }
  if (input.message) {
    query.set("message", input.message);
  }

  return query.toString();
}

export function DiagnosticCaseFilePanel({ query, closeHref }: { query: DiagnosticCaseQuery; closeHref: string }) {
  const requestQuery = useMemo(() => buildApiQuery(query), [query]);
  const [data, setData] = useState<DiagnosticCaseFileResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(requestQuery));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCaseFile() {
      if (!requestQuery) {
        setData(null);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const response = await fetch(`/api/diagnostics/case-file?${requestQuery}`, { cache: "no-store" });
      if (!response.ok) {
        if (!cancelled) {
          setData(null);
          setError("Unable to load case file.");
          setLoading(false);
        }
        return;
      }

      const payload = (await response.json()) as DiagnosticCaseFilePayload;
      if (!cancelled) {
        setData(payload.data);
        setLoading(false);
      }
    }

    void loadCaseFile();

    return () => {
      cancelled = true;
    };
  }, [requestQuery]);

  if (!requestQuery) {
    return null;
  }

  return (
    <section id="case-file" className="space-y-3 rounded-xl border border-slate-700/80 bg-slate-950/60 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-100">Case File</h3>
          <p className="text-xs text-slate-400">Stage-linked drill-through across T1, T2, and T3.</p>
        </div>
        <Link href={closeHref} className="text-xs text-slate-300 underline">
          Close
        </Link>
      </div>

      {loading ? <LoadingSkeleton lines={6} /> : null}
      {!loading && error ? <p className="text-xs text-red-200">{error}</p> : null}

      {!loading && !error && data ? (
        <div className="space-y-4">
          <div className="rounded border border-slate-700 bg-slate-950/50 p-3">
            <p className="text-xs text-slate-400">{data.target.diagnosticCode}</p>
            <h4 className="text-sm font-semibold text-slate-100">{data.target.title}</h4>
            <p className="mt-1 text-xs text-slate-300">{data.target.summary}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded border border-slate-700 bg-slate-950/50 p-3">
              <h4 className="text-xs font-semibold text-slate-100">Evidence</h4>
              {data.evidence.length === 0 ? (
                <p className="mt-2 text-xs text-slate-400">No structured evidence available.</p>
              ) : (
                <dl className="mt-2 space-y-2 text-xs">
                  {data.evidence.map((item) => (
                    <div key={`${item.label}-${item.value}`}>
                      <dt className="text-slate-400">{item.label}</dt>
                      <dd className="break-all font-mono text-slate-100">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>

            <div className="rounded border border-slate-700 bg-slate-950/50 p-3">
              <h4 className="text-xs font-semibold text-slate-100">Stage Focus</h4>
              <dl className="mt-2 space-y-2 text-xs">
                <div>
                  <dt className="text-slate-400">Focus execution</dt>
                  <dd className="break-all font-mono text-slate-100">{data.focusExecutionId ?? "NA"}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Focus matched lot</dt>
                  <dd className="break-all font-mono text-slate-100">{data.focusMatchedLotId ?? "NA"}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Focus setup</dt>
                  <dd className="break-all font-mono text-slate-100">{data.focusSetupId ?? "NA"}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded border border-slate-700 bg-slate-950/50 p-3">
              <h4 className="text-xs font-semibold text-slate-100">T1 Executions</h4>
              {data.executions.length === 0 ? (
                <p className="mt-2 text-xs text-slate-400">No T1 executions linked.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-xs text-slate-200">
                  {data.executions.map((execution) => (
                    <li key={execution.id}>
                      <Link href={`/executions?execution=${execution.id}&account=${execution.accountId}`} className="text-blue-300 underline">
                        {execution.id.slice(0, 8)}...
                      </Link>{" "}
                      {execution.underlyingSymbol ?? execution.symbol} {execution.eventType} {execution.openingClosingEffect ?? "UNKNOWN"}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded border border-slate-700 bg-slate-950/50 p-3">
              <h4 className="text-xs font-semibold text-slate-100">T2 Matched Lots</h4>
              {data.matchedLots.length === 0 ? (
                <p className="mt-2 text-xs text-slate-400">No T2 lots linked.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-xs text-slate-200">
                  {data.matchedLots.map((lot) => (
                    <li key={lot.id}>
                      <Link href={`/matched-lots?account=${lot.accountId}`} className="text-blue-300 underline">
                        {lot.id.slice(0, 8)}...
                      </Link>{" "}
                      {lot.underlyingSymbol ?? lot.symbol} {lot.outcome} {lot.realizedPnl}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded border border-slate-700 bg-slate-950/50 p-3">
              <h4 className="text-xs font-semibold text-slate-100">T3 Setups</h4>
              {data.setups.length === 0 ? (
                <p className="mt-2 text-xs text-slate-400">No T3 setups linked.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-xs text-slate-200">
                  {data.setups.map((setup) => (
                    <li key={setup.id}>
                      <Link href={`/setups?setup=${setup.id}`} className="text-blue-300 underline">
                        {setup.id.slice(0, 8)}...
                      </Link>{" "}
                      {setup.overrideTag ?? setup.tag} {setup.underlyingSymbol}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded border border-slate-700 bg-slate-950/50 p-3">
            <h4 className="text-xs font-semibold text-slate-100">Inference Notes</h4>
            {data.inferenceReasons.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">No additional inference notes available.</p>
            ) : (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-300">
                {data.inferenceReasons.map((reason, index) => (
                  <li key={`${reason}-${index}`}>{reason}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
