"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import type { ImportRecord, SetupDetailResponse, SetupSummaryRecord } from "@/types/api";

interface SetupsPayload {
  data: SetupSummaryRecord[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
  };
}

interface SetupDetailPayload {
  data: SetupDetailResponse;
}

interface ImportsPayload {
  data: ImportRecord[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
  };
}

interface SetupFilters {
  account: string;
  tag: string;
}

const defaultFilters: SetupFilters = {
  account: "",
  tag: "",
};

const tagOptions = [
  "stock",
  "long_call",
  "long_put",
  "covered_call",
  "cash_secured_put",
  "bull_vertical",
  "bear_vertical",
  "diagonal",
  "calendar",
  "roll",
  "short_call",
  "uncategorized",
];

export function SetupsAnalyticsPanel() {
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [rows, setRows] = useState<SetupSummaryRecord[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: 50 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftFilters, setDraftFilters] = useState<SetupFilters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<SetupFilters>(defaultFilters);

  const [selectedSetupId, setSelectedSetupId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SetupDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    async function loadImports() {
      const response = await fetch("/api/imports?page=1&pageSize=200", { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as ImportsPayload;
      setImports(payload.data);
    }

    void loadImports();
  }, []);

  useEffect(() => {
    async function loadSetups() {
      setLoading(true);
      setError(null);

      const query = new URLSearchParams({
        page: String(page),
        pageSize: String(meta.pageSize),
      });

      if (appliedFilters.account.trim()) {
        query.set("account", appliedFilters.account.trim());
      }
      if (appliedFilters.tag.trim()) {
        query.set("tag", appliedFilters.tag.trim());
      }

      const response = await fetch(`/api/setups?${query.toString()}`, { cache: "no-store" });

      if (!response.ok) {
        setError("Unable to load setup groups right now.");
        setLoading(false);
        return;
      }

      const payload = (await response.json()) as SetupsPayload;
      setRows(payload.data);
      setMeta(payload.meta);
      setLoading(false);
    }

    void loadSetups();
  }, [appliedFilters, page, meta.pageSize]);

  useEffect(() => {
    async function loadSetupDetail() {
      if (!selectedSetupId) {
        setDetail(null);
        return;
      }

      setDetailLoading(true);
      const response = await fetch(`/api/setups/${selectedSetupId}`, { cache: "no-store" });
      if (!response.ok) {
        setDetail(null);
        setDetailLoading(false);
        return;
      }

      const payload = (await response.json()) as SetupDetailPayload;
      setDetail(payload.data);
      setDetailLoading(false);
    }

    void loadSetupDetail();
  }, [selectedSetupId]);

  const accountOptions = useMemo(() => {
    return Array.from(new Set(imports.map((entry) => entry.accountId))).sort();
  }, [imports]);

  const summary = useMemo(() => {
    if (rows.length === 0) {
      return {
        totalPnl: "0.00",
        averageWinRate: "0.00",
        averageExpectancy: "0.00",
        averageHoldDays: "0.00",
      };
    }

    const totalPnl = rows.reduce((sum, row) => sum + Number(row.realizedPnl ?? 0), 0);
    const averageWinRate = rows.reduce((sum, row) => sum + Number(row.winRate ?? 0), 0) / rows.length;
    const averageExpectancy = rows.reduce((sum, row) => sum + Number(row.expectancy ?? 0), 0) / rows.length;
    const averageHoldDays = rows.reduce((sum, row) => sum + Number(row.averageHoldDays ?? 0), 0) / rows.length;

    return {
      totalPnl: totalPnl.toFixed(2),
      averageWinRate: averageWinRate.toFixed(2),
      averageExpectancy: averageExpectancy.toFixed(2),
      averageHoldDays: averageHoldDays.toFixed(2),
    };
  }, [rows]);

  const hasRows = rows.length > 0;
  const canGoBack = meta.page > 1;
  const canGoForward = meta.page * meta.pageSize < meta.total;

  function applyFilters() {
    setAppliedFilters(draftFilters);
    setPage(1);
  }

  function resetFilters() {
    setDraftFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setPage(1);
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/40 p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-100">Setup Analytics (T3)</h2>
        <p className="text-sm text-slate-300">Grouped setup performance summary with drill-through to matched lots and source executions.</p>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
          <p className="text-xs text-slate-400">Performance Summary</p>
          <p className={`text-lg font-semibold ${Number(summary.totalPnl) >= 0 ? "text-emerald-300" : "text-red-300"}`}>{summary.totalPnl}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
          <p className="text-xs text-slate-400">Win Rate</p>
          <p className="text-lg font-semibold text-slate-100">{summary.averageWinRate}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
          <p className="text-xs text-slate-400">Expectancy</p>
          <p className="text-lg font-semibold text-slate-100">{summary.averageExpectancy}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
          <p className="text-xs text-slate-400">Average Hold (Days)</p>
          <p className="text-lg font-semibold text-slate-100">{summary.averageHoldDays}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <select
          value={draftFilters.account}
          onChange={(event) => setDraftFilters((current) => ({ ...current, account: event.target.value }))}
          className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
        >
          <option value="">All accounts</option>
          {accountOptions.map((accountId) => (
            <option key={accountId} value={accountId}>
              {accountId}
            </option>
          ))}
        </select>

        <select
          value={draftFilters.tag}
          onChange={(event) => setDraftFilters((current) => ({ ...current, tag: event.target.value }))}
          className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
        >
          <option value="">All tags</option>
          {tagOptions.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={applyFilters}
          className="rounded-lg border border-blue-400/40 bg-blue-500/20 px-4 py-2 text-sm text-blue-100"
        >
          Apply Filters
        </button>
        <button
          type="button"
          onClick={resetFilters}
          className="rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm text-slate-200"
        >
          Reset
        </button>
      </div>

      {loading ? <LoadingSkeleton lines={6} /> : null}
      {error ? <p className="text-sm text-red-200">{error}</p> : null}

      {!loading && !error && !hasRows ? (
        <div className="rounded-xl border border-slate-700/80 bg-slate-950/60 p-6">
          <h3 className="text-lg font-medium text-slate-100">No setup groups found</h3>
          <p className="mt-2 text-sm text-slate-300">Commit an import so setup inference can generate T3 groups from matched lots.</p>
          <Link href="/imports" className="mt-3 inline-block text-sm text-blue-300 underline">
            Go to Imports & Connections
          </Link>
        </div>
      ) : null}

      {!loading && !error && hasRows ? (
        <div className="space-y-3">
          <div className="overflow-auto rounded border border-slate-700">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-900 text-slate-300">
                <tr>
                  <th className="px-2 py-2 text-left">Tag</th>
                  <th className="px-2 py-2 text-left">Underlying</th>
                  <th className="px-2 py-2 text-right">Realized P&L</th>
                  <th className="px-2 py-2 text-right">Win Rate</th>
                  <th className="px-2 py-2 text-right">Expectancy</th>
                  <th className="px-2 py-2 text-right">Avg Hold</th>
                  <th className="px-2 py-2 text-left">Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-800 text-slate-200">
                    <td className="px-2 py-2">{row.overrideTag ?? row.tag}</td>
                    <td className="px-2 py-2">{row.underlyingSymbol}</td>
                    <td className={`px-2 py-2 text-right ${Number(row.realizedPnl ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                      {row.realizedPnl ?? "0.00"}
                    </td>
                    <td className="px-2 py-2 text-right">{row.winRate ?? "0.00"}</td>
                    <td className="px-2 py-2 text-right">{row.expectancy ?? "0.00"}</td>
                    <td className="px-2 py-2 text-right">{row.averageHoldDays ?? "0.00"}</td>
                    <td className="px-2 py-2">
                      <button type="button" onClick={() => setSelectedSetupId(row.id)} className="text-blue-300 underline">
                        View detail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-300">
            <p>
              Showing page {meta.page} of {Math.max(1, Math.ceil(meta.total / meta.pageSize))} ({meta.total} rows)
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!canGoBack}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded border border-slate-600 px-2 py-1 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={!canGoForward}
                onClick={() => setPage((current) => current + 1)}
                className="rounded border border-slate-600 px-2 py-1 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedSetupId ? (
        <section className="space-y-3 rounded-xl border border-slate-700/80 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-100">Setup Detail Drill-through</h3>
            <button type="button" onClick={() => setSelectedSetupId(null)} className="text-xs text-slate-300 underline">
              Close
            </button>
          </div>
          {detailLoading ? <LoadingSkeleton lines={4} /> : null}
          {!detailLoading && detail ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-300">
                {detail.setup.overrideTag ?? detail.setup.tag} · {detail.setup.underlyingSymbol} · setup id {detail.setup.id}
              </p>
              <div className="rounded border border-slate-700 bg-slate-950/50 p-3">
                <h4 className="text-xs font-semibold text-slate-100">Inference Notes</h4>
                {detail.inference.reasons.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-400">No inference notes available.</p>
                ) : (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-300">
                    {detail.inference.reasons.map((reason, index) => (
                      <li key={`${reason}-${index}`}>{reason}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="overflow-auto rounded border border-slate-700">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-900 text-slate-300">
                    <tr>
                      <th className="px-2 py-2 text-left">Symbol</th>
                      <th className="px-2 py-2 text-right">Qty</th>
                      <th className="px-2 py-2 text-right">Realized P&L</th>
                      <th className="px-2 py-2 text-right">Hold Days</th>
                      <th className="px-2 py-2 text-left">Outcome</th>
                      <th className="px-2 py-2 text-left">Open Execution</th>
                      <th className="px-2 py-2 text-left">Close Execution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lots.map((lot) => (
                      <tr key={lot.id} className="border-t border-slate-800 text-slate-200">
                        <td className="px-2 py-2">{lot.symbol}</td>
                        <td className="px-2 py-2 text-right">{lot.quantity}</td>
                        <td className={`px-2 py-2 text-right ${Number(lot.realizedPnl) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                          {lot.realizedPnl}
                        </td>
                        <td className="px-2 py-2 text-right">{lot.holdingDays}</td>
                        <td className="px-2 py-2">{lot.outcome}</td>
                        <td className="px-2 py-2">
                          <Link href={`/executions?execution=${lot.openExecutionId}&account=${lot.accountId}`} className="text-blue-300 underline">
                            {lot.openExecutionId.slice(0, 8)}...
                          </Link>
                        </td>
                        <td className="px-2 py-2">
                          {lot.closeExecutionId ? (
                            <Link href={`/executions?execution=${lot.closeExecutionId}&account=${lot.accountId}`} className="text-blue-300 underline">
                              {lot.closeExecutionId.slice(0, 8)}...
                            </Link>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
