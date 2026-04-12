"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { buildDiagnosticCaseHref } from "@/lib/diagnostics/case-file-link";
import { formatCurrency, formatNullablePercent, safeNumber } from "@/components/widgets/utils";
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

const SHOW_ALL_STORAGE_KEY = "kapman_table_setups_showAll";

export function SetupsAnalyticsPanel() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedAccounts } = useAccountFilterContext();
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [rows, setRows] = useState<SetupSummaryRecord[]>([]);
  const [summaryRows, setSummaryRows] = useState<SetupSummaryRecord[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: 25 });
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftFilters, setDraftFilters] = useState<SetupFilters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<SetupFilters>(defaultFilters);

  const [selectedSetupId, setSelectedSetupId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SetupDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setShowAll(window.localStorage.getItem(SHOW_ALL_STORAGE_KEY) === "1");
    } catch {
      setShowAll(false);
    }
  }, []);

  useEffect(() => {
    const setupFromQuery = searchParams.get("setup");
    setSelectedSetupId((current) => (current === setupFromQuery ? current : setupFromQuery));
  }, [searchParams]);

  useEffect(() => {
    async function loadImports() {
      const query = new URLSearchParams({ page: "1", pageSize: "200" });
      applyAccountIdsToSearchParams(query, selectedAccounts);
      const response = await fetch(`/api/imports?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as ImportsPayload;
      setImports(payload.data);
    }

    void loadImports();
  }, [selectedAccounts]);

  useEffect(() => {
    async function loadSetups() {
      setLoading(true);
      setError(null);

      const query = new URLSearchParams({
        page: String(showAll ? 1 : page),
        pageSize: String(showAll ? 1000 : 25),
      });
      applyAccountIdsToSearchParams(query, selectedAccounts);

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
  }, [appliedFilters, page, selectedAccounts, showAll]);

  useEffect(() => {
    async function loadSummaryRows() {
      const query = new URLSearchParams({
        page: "1",
        pageSize: "1000",
      });
      applyAccountIdsToSearchParams(query, selectedAccounts);

      if (appliedFilters.account.trim()) {
        query.set("account", appliedFilters.account.trim());
      }
      if (appliedFilters.tag.trim()) {
        query.set("tag", appliedFilters.tag.trim());
      }

      const response = await fetch(`/api/setups?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as SetupsPayload;
      setSummaryRows(payload.data);
    }

    void loadSummaryRows();
  }, [appliedFilters, selectedAccounts]);

  useEffect(() => {
    async function loadSetupDetail() {
      if (!selectedSetupId) {
        setDetail(null);
        setDetailError(null);
        return;
      }

      setDetailLoading(true);
      setDetailError(null);

      try {
        const query = new URLSearchParams();
        applyAccountIdsToSearchParams(query, selectedAccounts);
        const response = await fetch(`/api/setups/${selectedSetupId}?${query.toString()}`, { cache: "no-store" });
        if (!response.ok) {
          setDetail(null);
          setDetailError("Unable to load setup detail right now.");
          setDetailLoading(false);
          return;
        }

        const payload = (await response.json()) as SetupDetailPayload;
        setDetail(payload.data);
        setDetailLoading(false);
      } catch {
        setDetail(null);
        setDetailError("Unable to load setup detail right now.");
        setDetailLoading(false);
      }
    }

    void loadSetupDetail();
  }, [selectedSetupId, selectedAccounts]);

  const accountOptions = useMemo(() => {
    return Array.from(new Set(imports.map((entry) => entry.accountId))).sort();
  }, [imports]);

  const summary = useMemo(() => {
    if (summaryRows.length === 0) {
      return {
        totalPnl: 0,
        averageWinRate: null as number | null,
        averageExpectancy: 0,
        averageHoldDays: 0,
      };
    }

    const totalPnl = summaryRows.reduce((sum, row) => sum + safeNumber(row.realizedPnl), 0);

    const winRates = summaryRows
      .map((row) => (row.winRate === null ? null : safeNumber(row.winRate)))
      .filter((value): value is number => value !== null);
    const averageWinRateRatio = winRates.length > 0 ? winRates.reduce((sum, value) => sum + value, 0) / winRates.length : null;

    const expectancies = summaryRows.map((row) => safeNumber(row.expectancy));
    const averageExpectancy = expectancies.length > 0 ? expectancies.reduce((sum, value) => sum + value, 0) / expectancies.length : 0;

    const holdDays = summaryRows.map((row) => safeNumber(row.averageHoldDays));
    const averageHoldDays = holdDays.length > 0 ? holdDays.reduce((sum, value) => sum + value, 0) / holdDays.length : 0;

    return {
      totalPnl,
      averageWinRate: averageWinRateRatio === null ? null : averageWinRateRatio * 100,
      averageExpectancy,
      averageHoldDays,
    };
  }, [summaryRows]);

  const hasRows = rows.length > 0;
  const canGoBack = meta.page > 1;
  const canGoForward = meta.page * meta.pageSize < meta.total;

  function toggleShowAll() {
    const next = !showAll;
    setShowAll(next);
    setPage(1);
    try {
      window.localStorage.setItem(SHOW_ALL_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Ignore localStorage errors.
    }
  }

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
          <p className="text-xs text-slate-400">Performance Summary ($)</p>
          <p className={`text-lg font-semibold ${summary.totalPnl >= 0 ? "text-emerald-300" : "text-red-300"}`}>{formatCurrency(summary.totalPnl)}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
          <p className="text-xs text-slate-400" title="Percent of closed lots with positive outcome. Flat lots excluded.">
            Win Rate (%)
          </p>
          <p className="text-lg font-semibold text-slate-100">{formatNullablePercent(summary.averageWinRate, 1)}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
          <p className="text-xs text-slate-400" title="Average realized P&L per matched lot in this setup.">
            Expectancy ($ / lot)
          </p>
          <p className="text-lg font-semibold text-slate-100">{formatCurrency(summary.averageExpectancy)} / lot</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
          <p className="text-xs text-slate-400">Average Hold (Days)</p>
          <p className="text-lg font-semibold text-slate-100">{summary.averageHoldDays.toFixed(2)}</p>
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
        <button type="button" onClick={toggleShowAll} className="rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm text-slate-200">
          {showAll ? "Show pages" : `Show all ${meta.total}`}
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
          <div
            className={showAll ? "overflow-y-auto rounded border border-slate-700" : "overflow-auto rounded border border-slate-700"}
            style={showAll ? { maxHeight: "calc(100vh - 280px)" } : undefined}
          >
            <table className="min-w-full text-xs">
              <thead className="bg-slate-900 text-slate-300">
                <tr>
                  <th className="px-2 py-2 text-left">Tag</th>
                  <th className="px-2 py-2 text-left">Underlying</th>
                  <th className="px-2 py-2 text-right">Realized P&L ($)</th>
                  <th
                    className="px-2 py-2 text-right"
                    title="Percent of closed lots with positive outcome. Flat lots excluded."
                  >
                    Win Rate (%)
                  </th>
                  <th className="px-2 py-2 text-right" title="Average realized P&L per matched lot in this setup.">
                    Expectancy ($ / lot)
                  </th>
                  <th className="px-2 py-2 text-right">Avg Hold</th>
                  <th className="px-2 py-2 text-left">Detail</th>
                  <th className="px-2 py-2 text-left">Investigate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-800 text-slate-200">
                    <td className="px-2 py-2">{row.overrideTag ?? row.tag}</td>
                    <td className="px-2 py-2">{row.underlyingSymbol}</td>
                    <td className={`px-2 py-2 text-right ${safeNumber(row.realizedPnl) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                      {formatCurrency(safeNumber(row.realizedPnl))}
                    </td>
                    <td className="px-2 py-2 text-right">{formatNullablePercent(row.winRate === null ? null : safeNumber(row.winRate) * 100, 1)}</td>
                    <td className="px-2 py-2 text-right">{`${formatCurrency(safeNumber(row.expectancy))} / lot`}</td>
                    <td className="px-2 py-2 text-right">{safeNumber(row.averageHoldDays).toFixed(2)}</td>
                    <td className="px-2 py-2">
                      <Link href={`${pathname}?setup=${row.id}#setup-detail`} className="text-blue-300 underline">
                        View detail
                      </Link>
                    </td>
                    <td className="px-2 py-2">
                      <Link href={buildDiagnosticCaseHref({ kind: "setup", setupId: row.id })} className="text-blue-300 underline">
                        Case file
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {showAll ? (
            <p className="text-xs text-slate-300">Showing all {meta.total} records</p>
          ) : (
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
          )}
        </div>
      ) : null}

      {selectedSetupId ? (
        <section id="setup-detail" className="space-y-3 rounded-xl border border-slate-700/80 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-100">Setup Detail Drill-through</h3>
            <button type="button" onClick={() => router.push(pathname, { scroll: false })} className="text-xs text-slate-300 underline">
              Close
            </button>
          </div>
          {detailLoading ? <LoadingSkeleton lines={4} /> : null}
          {!detailLoading && detailError ? <p className="text-xs text-red-200">{detailError}</p> : null}
          {!detailLoading && detail ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                <p>
                  {detail.setup.overrideTag ?? detail.setup.tag} · {detail.setup.underlyingSymbol} · setup id {detail.setup.id}
                </p>
                <Link href={buildDiagnosticCaseHref({ kind: "setup", setupId: detail.setup.id })} className="text-blue-300 underline">
                  Open diagnostics case file
                </Link>
              </div>
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
                      <th className="px-2 py-2 text-right">Realized P&L ($)</th>
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
                        <td className={`px-2 py-2 text-right ${safeNumber(lot.realizedPnl) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                          {formatCurrency(safeNumber(lot.realizedPnl))}
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
