"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/Badge";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import type { ExecutionDetailRecord, ExecutionRecord, ImportRecord } from "@/types/api";

interface ExecutionsPayload {
  data: ExecutionRecord[];
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

interface ExecutionDetailPayload {
  data: ExecutionDetailRecord;
}

type SortColumn = "eventTimestamp" | "symbol" | "quantity" | "price";
type SortDirection = "asc" | "desc";

interface ExecutionFilters {
  symbol: string;
  account: string;
  importId: string;
  executionId: string;
  dateFrom: string;
  dateTo: string;
}

const defaultFilters: ExecutionFilters = {
  symbol: "",
  account: "",
  importId: "",
  executionId: "",
  dateFrom: "",
  dateTo: "",
};

const SHOW_ALL_STORAGE_KEY = "kapman_table_executions_showAll";

function sortExecutionRows(rows: ExecutionRecord[], column: SortColumn, direction: SortDirection): ExecutionRecord[] {
  const sorted = [...rows].sort((left, right) => {
    if (column === "eventTimestamp") {
      return new Date(left.eventTimestamp).getTime() - new Date(right.eventTimestamp).getTime();
    }

    if (column === "quantity") {
      return Number(left.quantity) - Number(right.quantity);
    }

    if (column === "price") {
      return Number(left.price ?? "-Infinity") - Number(right.price ?? "-Infinity");
    }

    return left.symbol.localeCompare(right.symbol);
  });

  if (direction === "desc") {
    sorted.reverse();
  }

  return sorted;
}

function renderOptionValue(row: Pick<ExecutionRecord, "optionType" | "strike" | "expirationDate">): string {
  if (!row.optionType) {
    return "-";
  }

  return `${row.optionType} ${row.strike ?? "-"} ${row.expirationDate?.slice(0, 10) ?? "-"}`;
}

export function ExecutionsTablePanel() {
  const searchParams = useSearchParams();
  const initializedFromSearch = useRef(false);

  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [rows, setRows] = useState<ExecutionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: 25 });
  const [showAll, setShowAll] = useState(false);
  const [draftFilters, setDraftFilters] = useState<ExecutionFilters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<ExecutionFilters>(defaultFilters);
  const [sortColumn, setSortColumn] = useState<SortColumn>("eventTimestamp");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExecutionDetailRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    try {
      setShowAll(window.localStorage.getItem(SHOW_ALL_STORAGE_KEY) === "1");
    } catch {
      setShowAll(false);
    }
  }, []);

  useEffect(() => {
    if (initializedFromSearch.current) {
      return;
    }

    const initial = {
      symbol: searchParams.get("symbol") ?? "",
      account: searchParams.get("account") ?? "",
      importId: searchParams.get("import") ?? "",
      executionId: searchParams.get("execution") ?? "",
      dateFrom: searchParams.get("date_from") ?? "",
      dateTo: searchParams.get("date_to") ?? "",
    };

    setDraftFilters(initial);
    setAppliedFilters(initial);
    initializedFromSearch.current = true;
  }, [searchParams]);

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
    async function loadExecutions() {
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
      if (appliedFilters.executionId.trim()) {
        query.set("execution", appliedFilters.executionId.trim());
      }
      if (appliedFilters.dateFrom) {
        query.set("date_from", appliedFilters.dateFrom);
      }
      if (appliedFilters.dateTo) {
        query.set("date_to", appliedFilters.dateTo);
      }

      const response = await fetch(`/api/executions?${query.toString()}`, { cache: "no-store" });

      if (!response.ok) {
        setError("Unable to load executions right now.");
        setLoading(false);
        return;
      }

      const payload = (await response.json()) as ExecutionsPayload;
      setRows(payload.data);
      setMeta(payload.meta);
      setLoading(false);
    }

    void loadExecutions();
  }, [appliedFilters, page, showAll]);

  useEffect(() => {
    let canceled = false;

    async function loadExecutionDetail() {
      if (!selectedExecutionId) {
        setDetail(null);
        setDetailError(null);
        return;
      }

      setDetailLoading(true);
      setDetailError(null);
      setCopyStatus("idle");

      try {
        const response = await fetch(`/api/executions/${selectedExecutionId}`, { cache: "no-store" });
        if (!response.ok) {
          if (!canceled) {
            setDetail(null);
            setDetailError("Unable to load execution detail right now.");
          }
          return;
        }

        const payload = (await response.json()) as ExecutionDetailPayload;
        if (!canceled) {
          setDetail(payload.data);
        }
      } catch {
        if (!canceled) {
          setDetail(null);
          setDetailError("Unable to load execution detail right now.");
        }
      } finally {
        if (!canceled) {
          setDetailLoading(false);
        }
      }
    }

    void loadExecutionDetail();

    return () => {
      canceled = true;
    };
  }, [selectedExecutionId]);

  const accountOptions = useMemo(() => {
    return Array.from(new Set(imports.map((entry) => entry.accountId))).sort();
  }, [imports]);

  const importOptions = useMemo(() => {
    const filtered = draftFilters.account ? imports.filter((entry) => entry.accountId === draftFilters.account) : imports;
    return filtered.map((entry) => ({ id: entry.id, label: `${entry.filename} (${entry.accountId})` }));
  }, [imports, draftFilters.account]);

  const sortedRows = useMemo(() => {
    return sortExecutionRows(rows, sortColumn, sortDirection);
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
    setSortDirection(column === "eventTimestamp" ? "desc" : "asc");
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

  async function copyInstrumentKey() {
    if (!detail?.instrumentKey) {
      return;
    }

    try {
      await navigator.clipboard.writeText(detail.instrumentKey);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/40 p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-100">Execution Audit Table (T1)</h2>
        <p className="text-sm text-slate-300">Filter and inspect normalized execution events with import/account context for auditability.</p>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <input
          type="text"
          value={draftFilters.symbol}
          onChange={(event) => setDraftFilters((current) => ({ ...current, symbol: event.target.value }))}
          placeholder="Symbol (e.g. SPY)"
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
        <input
          type="text"
          value={draftFilters.executionId}
          onChange={(event) => setDraftFilters((current) => ({ ...current, executionId: event.target.value }))}
          placeholder="Execution ID"
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
          <h3 className="text-lg font-medium text-slate-100">No executions found</h3>
          <p className="mt-2 text-sm text-slate-300">Adjust filters or commit an import to generate canonical execution rows.</p>
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
                    <button type="button" onClick={() => toggleSort("eventTimestamp")} className="font-medium">
                      Event Time
                    </button>
                  </th>
                  <th className="px-2 py-2 text-left">Trade Date</th>
                  <th className="px-2 py-2 text-left">
                    <button type="button" onClick={() => toggleSort("symbol")} className="font-medium">
                      Symbol
                    </button>
                  </th>
                  <th className="px-2 py-2 text-left">Side</th>
                  <th className="px-2 py-2 text-right">
                    <button type="button" onClick={() => toggleSort("quantity")} className="font-medium">
                      Qty
                    </button>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort("price")}
                      className="font-medium"
                      title="Execution price per share (equity) or per contract share (option). Multiply options by 100 for dollar value."
                    >
                      Unit Price
                    </button>
                  </th>
                  <th className="px-2 py-2 text-left">Event</th>
                  <th className="px-2 py-2 text-left">Effect</th>
                  <th className="px-2 py-2 text-left">Option</th>
                  <th className="px-2 py-2 text-left">Account</th>
                  <th className="px-2 py-2 text-left">Import</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-800 text-slate-200">
                    <td className="px-2 py-2">{new Date(row.eventTimestamp).toLocaleString()}</td>
                    <td className="px-2 py-2">{row.tradeDate.slice(0, 10)}</td>
                    <td className="px-2 py-2">{row.symbol}</td>
                    <td className="px-2 py-2">
                      {row.side === "BUY" ? <Badge variant="buy">BUY</Badge> : row.side === "SELL" ? <Badge variant="sell">SELL</Badge> : "-"}
                    </td>
                    <td className="px-2 py-2 text-right">{row.quantity}</td>
                    <td className="px-2 py-2 text-right">{row.price ?? "~"}</td>
                    <td className="px-2 py-2">{row.eventType}</td>
                    <td className="px-2 py-2">
                      {row.openingClosingEffect === "TO_OPEN" ? (
                        <Badge variant="to-open">TO_OPEN</Badge>
                      ) : row.openingClosingEffect === "TO_CLOSE" ? (
                        <Badge variant="to-close">TO_CLOSE</Badge>
                      ) : (
                        "UNKNOWN"
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {row.optionType ? (
                        <span className="inline-flex items-center gap-1">
                          <Badge variant={row.optionType === "PUT" ? "put" : "call"}>{row.optionType}</Badge>
                          <span className="font-mono">
                            {row.strike ?? "-"} {row.expirationDate?.slice(0, 10) ?? "-"}
                          </span>
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-2 py-2">{row.accountId}</td>
                    <td className="px-2 py-2">
                      <button type="button" onClick={() => setSelectedExecutionId(row.id)} className="text-blue-300 underline">
                        {row.importId.slice(0, 8)}...
                      </button>
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

      {selectedExecutionId ? (
        <section className="space-y-3 rounded-xl border border-slate-700/80 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-100">Execution Detail Drill-through</h3>
            <button type="button" onClick={() => setSelectedExecutionId(null)} className="text-xs text-slate-300 underline">
              Close
            </button>
          </div>

          {detailLoading ? <LoadingSkeleton lines={5} /> : null}
          {!detailLoading && detailError ? <p className="text-xs text-red-200">{detailError}</p> : null}

          {!detailLoading && detail ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-xs text-slate-400">Execution ID</p>
                  <p className="break-all font-mono text-xs text-slate-100">{detail.id}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Import ID</p>
                  <p className="break-all font-mono text-xs text-slate-100">{detail.importId}</p>
                  <Link href={`/imports?tab=history&import=${encodeURIComponent(detail.importId)}`} className="text-xs text-blue-300 underline">
                    Open parent import record
                  </Link>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Account</p>
                  <p className="break-all font-mono text-xs text-slate-100">{detail.accountId}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Trade Date</p>
                  <p className="text-xs text-slate-100">{detail.tradeDate.slice(0, 10)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Symbol</p>
                  <p className="text-xs text-slate-100">{detail.symbol}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Side</p>
                  <p className="text-xs text-slate-100">{detail.side ?? "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Qty</p>
                  <p className="text-xs text-slate-100">{detail.quantity}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Unit Price</p>
                  <p className="text-xs text-slate-100">{detail.price ?? "~"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Event</p>
                  <p className="text-xs text-slate-100">{detail.eventType}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Effect</p>
                  <p className="text-xs text-slate-100">{detail.openingClosingEffect ?? "UNKNOWN"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Option</p>
                  <p className="text-xs text-slate-100">{renderOptionValue(detail)}</p>
                </div>
              </div>

              <div className="space-y-2 rounded border border-slate-700 bg-slate-950/50 p-3">
                <p className="text-xs text-slate-400">Instrument Key</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    readOnly
                    value={detail.instrumentKey ?? ""}
                    className="min-w-[18rem] flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={copyInstrumentKey}
                    disabled={!detail.instrumentKey}
                    className="rounded border border-slate-600 bg-slate-900 px-3 py-1 text-xs text-slate-200 disabled:opacity-50"
                  >
                    Copy
                  </button>
                </div>
                {copyStatus === "copied" ? <p className="text-xs text-emerald-300">Instrument key copied.</p> : null}
                {copyStatus === "failed" ? <p className="text-xs text-red-200">Clipboard write failed. Copy manually.</p> : null}
              </div>

              <details className="rounded border border-slate-700 bg-slate-950/50 p-3">
                <summary className="cursor-pointer text-xs font-semibold text-slate-100">Raw Row JSON</summary>
                <pre className="mt-2 overflow-auto rounded border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200">
                  {JSON.stringify(detail.rawRowJson ?? null, null, 2)}
                </pre>
              </details>
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
