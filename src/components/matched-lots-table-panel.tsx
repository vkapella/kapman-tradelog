"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/Badge";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { buildDiagnosticCaseHref } from "@/lib/diagnostics/case-file-link";
import { formatCurrency, safeNumber } from "@/components/widgets/utils";
import type { ImportRecord, MatchedLotRecord } from "@/types/api";

interface MatchedLotsPayload {
  data: MatchedLotRecord[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
  };
}

interface ImportsPayload {
  data: ImportRecord[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
  };
}

type SortColumn = "closeTradeDate" | "symbol" | "realizedPnl" | "holdingDays";
type SortDirection = "asc" | "desc";

interface MatchedLotFilters {
  symbol: string;
  account: string;
  importId: string;
  outcome: string;
  dateFrom: string;
  dateTo: string;
}

const defaultFilters: MatchedLotFilters = {
  symbol: "",
  account: "",
  importId: "",
  outcome: "",
  dateFrom: "",
  dateTo: "",
};

const SHOW_ALL_STORAGE_KEY = "kapman_table_matched-lots_showAll";

function displayMatchedLotSymbol(row: Pick<MatchedLotRecord, "symbol" | "underlyingSymbol">): string {
  return row.underlyingSymbol ?? row.symbol;
}

function sortMatchedLots(rows: MatchedLotRecord[], column: SortColumn, direction: SortDirection): MatchedLotRecord[] {
  const sorted = [...rows].sort((left, right) => {
    if (column === "closeTradeDate") {
      return new Date(left.closeTradeDate ?? left.openTradeDate).getTime() - new Date(right.closeTradeDate ?? right.openTradeDate).getTime();
    }

    if (column === "symbol") {
      return displayMatchedLotSymbol(left).localeCompare(displayMatchedLotSymbol(right));
    }

    if (column === "realizedPnl") {
      return Number(left.realizedPnl) - Number(right.realizedPnl);
    }

    return left.holdingDays - right.holdingDays;
  });

  if (direction === "desc") {
    sorted.reverse();
  }

  return sorted;
}

export function MatchedLotsTablePanel() {
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [rows, setRows] = useState<MatchedLotRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: 25 });
  const [showAll, setShowAll] = useState(false);
  const [draftFilters, setDraftFilters] = useState<MatchedLotFilters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<MatchedLotFilters>(defaultFilters);
  const [sortColumn, setSortColumn] = useState<SortColumn>("closeTradeDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    try {
      setShowAll(window.localStorage.getItem(SHOW_ALL_STORAGE_KEY) === "1");
    } catch {
      setShowAll(false);
    }
  }, []);

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
    async function loadMatchedLots() {
      setLoading(true);
      setError(null);

      const query = new URLSearchParams({
        page: String(showAll ? 1 : page),
        pageSize: String(showAll ? 1000 : 25),
      });

      if (appliedFilters.symbol.trim()) {
        query.set("symbol", appliedFilters.symbol.trim());
      }
      if (appliedFilters.account.trim()) {
        query.set("account", appliedFilters.account.trim());
      }
      if (appliedFilters.importId.trim()) {
        query.set("import", appliedFilters.importId.trim());
      }
      if (appliedFilters.outcome.trim()) {
        query.set("outcome", appliedFilters.outcome.trim());
      }
      if (appliedFilters.dateFrom) {
        query.set("date_from", appliedFilters.dateFrom);
      }
      if (appliedFilters.dateTo) {
        query.set("date_to", appliedFilters.dateTo);
      }

      const response = await fetch(`/api/matched-lots?${query.toString()}`, { cache: "no-store" });

      if (!response.ok) {
        setError("Unable to load matched lots right now.");
        setLoading(false);
        return;
      }

      const payload = (await response.json()) as MatchedLotsPayload;
      setRows(payload.data);
      setMeta(payload.meta);
      setLoading(false);
    }

    void loadMatchedLots();
  }, [appliedFilters, page, showAll]);

  const accountOptions = useMemo(() => {
    return Array.from(new Set(imports.map((entry) => entry.accountId))).sort();
  }, [imports]);

  const importOptions = useMemo(() => {
    const filtered = draftFilters.account ? imports.filter((entry) => entry.accountId === draftFilters.account) : imports;
    return filtered.map((entry) => ({ id: entry.id, label: `${entry.filename} (${entry.accountId})` }));
  }, [imports, draftFilters.account]);

  const sortedRows = useMemo(() => {
    return sortMatchedLots(rows, sortColumn, sortDirection);
  }, [rows, sortColumn, sortDirection]);

  function applyFilters() {
    setAppliedFilters(draftFilters);
    setPage(1);
  }

  function resetFilters() {
    setDraftFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setPage(1);
  }

  function toggleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }

    setSortColumn(column);
    setSortDirection(column === "closeTradeDate" ? "desc" : "asc");
  }

  const hasRows = sortedRows.length > 0;
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

  return (
    <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/40 p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-100">Matched Lots Table (T2)</h2>
        <p className="text-sm text-slate-300">Review FIFO close-to-open linkage, realized P&L, and holding period by lot.</p>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <input
          type="text"
          value={draftFilters.symbol}
          onChange={(event) => setDraftFilters((current) => ({ ...current, symbol: event.target.value }))}
          placeholder="Symbol (e.g. NVDA)"
          className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
        />
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
          value={draftFilters.importId}
          onChange={(event) => setDraftFilters((current) => ({ ...current, importId: event.target.value }))}
          className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
        >
          <option value="">All imports</option>
          {importOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={draftFilters.outcome}
          onChange={(event) => setDraftFilters((current) => ({ ...current, outcome: event.target.value }))}
          className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
        >
          <option value="">All outcomes</option>
          <option value="WIN">WIN</option>
          <option value="LOSS">LOSS</option>
          <option value="FLAT">FLAT</option>
        </select>
        <input
          type="date"
          value={draftFilters.dateFrom}
          onChange={(event) => setDraftFilters((current) => ({ ...current, dateFrom: event.target.value }))}
          className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
        />
        <input
          type="date"
          value={draftFilters.dateTo}
          onChange={(event) => setDraftFilters((current) => ({ ...current, dateTo: event.target.value }))}
          className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
        />
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
          <h3 className="text-lg font-medium text-slate-100">No matched lots found</h3>
          <p className="mt-2 text-sm text-slate-300">Commit an import and run matching to populate FIFO lot records.</p>
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
                  <th className="px-2 py-2 text-left">
                    <button type="button" onClick={() => toggleSort("closeTradeDate")} className="font-medium">
                      Close Date
                    </button>
                  </th>
                  <th className="px-2 py-2 text-left">
                    <button type="button" onClick={() => toggleSort("symbol")} className="font-medium">
                      Symbol
                    </button>
                  </th>
                  <th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-right">
                    <button type="button" onClick={() => toggleSort("realizedPnl")} className="font-medium">
                      Realized P&L ($)
                    </button>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <button type="button" onClick={() => toggleSort("holdingDays")} className="font-medium">
                      Hold Days
                    </button>
                  </th>
                  <th className="px-2 py-2 text-left">Outcome</th>
                  <th className="px-2 py-2 text-left">Open Execution</th>
                  <th className="px-2 py-2 text-left">Close Execution</th>
                  <th className="px-2 py-2 text-left">Investigate</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-800 text-slate-200">
                    <td className="px-2 py-2">{(row.closeTradeDate ?? row.openTradeDate).slice(0, 10)}</td>
                    <td className="px-2 py-2">{displayMatchedLotSymbol(row)}</td>
                    <td className="px-2 py-2 text-right">{row.quantity}</td>
                    <td className={`px-2 py-2 text-right ${Number(row.realizedPnl) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                      {formatCurrency(safeNumber(row.realizedPnl))}
                    </td>
                    <td className="px-2 py-2 text-right">{row.holdingDays}</td>
                    <td className="px-2 py-2">
                      {row.outcome === "WIN" ? (
                        <Badge variant="win">WIN</Badge>
                      ) : row.outcome === "LOSS" ? (
                        <Badge variant="loss">LOSS</Badge>
                      ) : (
                        <Badge variant="flat">FLAT</Badge>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <Link href={`/executions?execution=${row.openExecutionId}&account=${row.accountId}`} className="text-blue-300 underline">
                        {row.openExecutionId.slice(0, 8)}...
                      </Link>
                    </td>
                    <td className="px-2 py-2">
                      {row.closeExecutionId ? (
                        <Link href={`/executions?execution=${row.closeExecutionId}&account=${row.accountId}`} className="text-blue-300 underline">
                          {row.closeExecutionId.slice(0, 8)}...
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <Link href={buildDiagnosticCaseHref({ kind: "matched_lot", matchedLotId: row.id })} className="text-blue-300 underline">
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
    </section>
  );
}
