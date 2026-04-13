"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AccountLabel } from "@/components/accounts/AccountLabel";
import { Badge } from "@/components/Badge";
import { DataTableHeader } from "@/components/data-table/DataTableHeader";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { useDataTableState } from "@/components/data-table/useDataTableState";
import type { DataTableColumnDefinition, SortDirection } from "@/components/data-table/types";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { fetchAllPages } from "@/lib/api/fetch-all-pages";
import { buildDiagnosticCaseHref } from "@/lib/diagnostics/case-file-link";
import type { ApiDetailResponse, ExecutionDetailRecord, ExecutionRecord, ImportRecord } from "@/types/api";

interface ExecutionDetailPayload extends ApiDetailResponse<ExecutionDetailRecord> {}

const SHOW_ALL_STORAGE_KEY = "kapman_table_executions_showAll";

function displayExecutionSymbol(row: Pick<ExecutionRecord, "symbol" | "underlyingSymbol">): string {
  return row.underlyingSymbol ?? row.symbol;
}

function renderOptionValue(row: Pick<ExecutionRecord, "optionType" | "strike" | "expirationDate">): string {
  if (!row.optionType) {
    return "-";
  }

  return `${row.optionType} ${row.strike ?? "-"} ${row.expirationDate?.slice(0, 10) ?? "-"}`;
}

function canInvestigateExecution(row: Pick<ExecutionRecord, "eventType" | "openingClosingEffect">): boolean {
  return row.eventType === "EXPIRATION_INFERRED" || row.openingClosingEffect === null || row.openingClosingEffect === "UNKNOWN";
}

function shortId(value: string): string {
  return `${value.slice(0, 8)}...`;
}

export function ExecutionsTablePanel() {
  const searchParams = useSearchParams();
  const { selectedAccounts, getAccountDisplayText } = useAccountFilterContext();

  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [rows, setRows] = useState<ExecutionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [openColumnId, setOpenColumnId] = useState<string | null>(null);
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
    const executionParam = searchParams.get("execution");
    setSelectedExecutionId(executionParam || null);
  }, [searchParams]);

  useEffect(() => {
    async function loadImports() {
      try {
        const query = new URLSearchParams();
        applyAccountIdsToSearchParams(query, selectedAccounts);
        const payload = await fetchAllPages<ImportRecord>("/api/imports", query);
        setImports(payload.data);
      } catch {
        setImports([]);
      }
    }

    void loadImports();
  }, [selectedAccounts]);

  useEffect(() => {
    async function loadExecutions() {
      setLoading(true);
      setError(null);

      try {
        const query = new URLSearchParams();
        applyAccountIdsToSearchParams(query, selectedAccounts);
        const payload = await fetchAllPages<ExecutionRecord>("/api/executions", query);
        setRows(payload.data);
      } catch {
        setError("Unable to load executions right now.");
        setRows([]);
      } finally {
        setLoading(false);
      }
    }

    void loadExecutions();
  }, [selectedAccounts]);

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
        const query = new URLSearchParams();
        applyAccountIdsToSearchParams(query, selectedAccounts);
        const response = await fetch(`/api/executions/${selectedExecutionId}?${query.toString()}`, { cache: "no-store" });
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
  }, [selectedExecutionId, selectedAccounts]);

  const importLabelById = useMemo(() => {
    return new Map(imports.map((entry) => [entry.id, `${entry.filename} (${getAccountDisplayText(entry.accountId)})`]));
  }, [getAccountDisplayText, imports]);

  const columns = useMemo<DataTableColumnDefinition<ExecutionRecord>[]>(() => [
    {
      id: "eventTimestamp",
      label: "Event Time",
      filterMode: "discrete",
      getFilterValues: (row) => row.eventTimestamp,
      getFilterOptionLabel: (value) => new Date(value).toLocaleString(),
      sortMode: "date",
      getSortValue: (row) => row.eventTimestamp,
      defaultSortDirection: "desc",
      panelWidthClassName: "w-80",
    },
    {
      id: "tradeDate",
      label: "Trade Date",
      filterMode: "discrete",
      getFilterValues: (row) => row.tradeDate,
      getFilterOptionLabel: (value) => value.slice(0, 10),
      sortMode: "date",
      getSortValue: (row) => row.tradeDate,
      defaultSortDirection: "desc",
    },
    {
      id: "symbol",
      label: "Symbol",
      filterMode: "discrete",
      getFilterValues: (row) => displayExecutionSymbol(row),
      sortMode: "string",
      getSortValue: (row) => displayExecutionSymbol(row),
    },
    {
      id: "side",
      label: "Side",
      filterMode: "discrete",
      getFilterValues: (row) => row.side ?? "-",
      sortMode: "string",
      getSortValue: (row) => row.side ?? "-",
    },
    {
      id: "quantity",
      label: "Qty",
      align: "right",
      filterMode: "discrete",
      getFilterValues: (row) => row.quantity,
      sortMode: "number",
      getSortValue: (row) => Number(row.quantity),
    },
    {
      id: "price",
      label: "Unit Price",
      align: "right",
      title: "Execution price per share (equity) or per contract share (option). Multiply options by 100 for dollar value.",
      filterMode: "discrete",
      getFilterValues: (row) => row.price ?? "~",
      sortMode: "number",
      getSortValue: (row) => (row.price === null ? null : Number(row.price)),
    },
    {
      id: "eventType",
      label: "Event",
      filterMode: "discrete",
      getFilterValues: (row) => row.eventType,
      sortMode: "string",
      getSortValue: (row) => row.eventType,
    },
    {
      id: "effect",
      label: "Effect",
      filterMode: "discrete",
      getFilterValues: (row) => row.openingClosingEffect ?? "UNKNOWN",
      sortMode: "string",
      getSortValue: (row) => row.openingClosingEffect ?? "UNKNOWN",
    },
    {
      id: "option",
      label: "Option",
      filterMode: "discrete",
      getFilterValues: (row) => renderOptionValue(row),
      sortMode: "string",
      getSortValue: (row) => renderOptionValue(row),
      panelWidthClassName: "w-80",
    },
    {
      id: "accountId",
      label: "Account",
      filterMode: "discrete",
      getFilterValues: (row) => row.accountId,
      getFilterOptionLabel: (value) => getAccountDisplayText(value),
      sortMode: "string",
      getSortValue: (row) => getAccountDisplayText(row.accountId),
      panelWidthClassName: "w-80",
    },
    {
      id: "importId",
      label: "Import",
      filterMode: "discrete",
      getFilterValues: (row) => row.importId,
      getFilterOptionLabel: (value) => importLabelById.get(value) ?? value,
      sortMode: "string",
      getSortValue: (row) => importLabelById.get(row.importId) ?? row.importId,
      panelWidthClassName: "w-80",
    },
    {
      id: "executionId",
      label: "Execution ID",
      filterMode: "discrete",
      getFilterValues: (row) => row.id,
      getFilterOptionLabel: (value) => shortId(value),
      sortMode: "string",
      getSortValue: (row) => row.id,
      panelWidthClassName: "w-80",
    },
    {
      id: "investigate",
      label: "Investigate",
      filterMode: "discrete",
      getFilterValues: (row) => (canInvestigateExecution(row) ? "Case file" : "-"),
      sortMode: "string",
      getSortValue: (row) => (canInvestigateExecution(row) ? "Case file" : "-"),
    },
  ], [getAccountDisplayText, importLabelById]);

  const table = useDataTableState({
    tableName: "executions",
    rows,
    columns,
    initialSort: { columnId: "eventTimestamp", direction: "desc" },
  });

  const isTableHydrated = table.isHydrated;
  const setTableColumnFilter = table.setColumnFilter;

  useEffect(() => {
    if (!isTableHydrated) {
      return;
    }

    const symbolParam = searchParams.get("symbol");
    const importParam = searchParams.get("import");
    const executionParam = searchParams.get("execution");

    if (symbolParam) {
      setTableColumnFilter("symbol", [symbolParam]);
    }
    if (importParam) {
      setTableColumnFilter("importId", [importParam]);
    }
    if (executionParam) {
      setTableColumnFilter("executionId", [executionParam]);
    }
  }, [searchParams, isTableHydrated, setTableColumnFilter]);

  useEffect(() => {
    setPage(1);
  }, [selectedAccounts, table.filters, table.sort]);

  const totalRows = table.sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / 25));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = showAll ? table.sortedRows : table.sortedRows.slice((currentPage - 1) * 25, currentPage * 25);
  const hasRows = pagedRows.length > 0;

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

  function applyColumnState(columnId: string, values: string[], direction: SortDirection | null) {
    setTableColumnFilter(columnId, values);
    if (direction) {
      table.setSort({ columnId, direction });
    } else if (table.sort.columnId === columnId) {
      table.setSort({ columnId: null, direction: null });
    }
    setPage(1);
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

      <DataTableToolbar
        activeFilterCount={table.activeFilterCount}
        onClearAllFilters={() => {
          table.clearAllFilters();
          setPage(1);
        }}
        onToggleShowAll={toggleShowAll}
        showAll={showAll}
        totalRows={totalRows}
      />

      {loading ? <LoadingSkeleton lines={6} /> : null}
      {error ? <p className="text-sm text-red-200">{error}</p> : null}

      {!loading && !error && totalRows === 0 ? (
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
              <thead className="sticky top-0 z-10 bg-slate-900 text-slate-300">
                <tr>
                  {columns.map((column) => (
                    <DataTableHeader
                      key={column.id}
                      column={column}
                      currentSortDirection={table.sort.columnId === column.id ? table.sort.direction : null}
                      currentValues={table.filters[column.id] ?? []}
                      isOpen={openColumnId === column.id}
                      onApply={(values, direction) => applyColumnState(column.id, values, direction)}
                      onToggle={() => setOpenColumnId((current) => (current === column.id ? null : column.id))}
                      options={table.filterOptions[column.id] ?? []}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-800 text-slate-200">
                    <td className="px-2 py-2">{new Date(row.eventTimestamp).toLocaleString()}</td>
                    <td className="px-2 py-2">{row.tradeDate.slice(0, 10)}</td>
                    <td className="px-2 py-2">{displayExecutionSymbol(row)}</td>
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
                    <td className="px-2 py-2">
                      <AccountLabel accountId={row.accountId} />
                    </td>
                    <td className="px-2 py-2">{importLabelById.get(row.importId) ?? shortId(row.importId)}</td>
                    <td className="px-2 py-2 font-mono">
                      <button type="button" onClick={() => setSelectedExecutionId(row.id)} className="text-blue-300 underline">
                        {shortId(row.id)}
                      </button>
                    </td>
                    <td className="px-2 py-2">
                      {canInvestigateExecution(row) ? (
                        <Link href={buildDiagnosticCaseHref({ kind: "execution", executionId: row.id })} className="text-blue-300 underline">
                          Case file
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

          {showAll ? (
            <p className="text-xs text-slate-300">Showing all {totalRows} records</p>
          ) : (
            <div className="flex items-center justify-between text-xs text-slate-300">
              <p>
                Showing page {currentPage} of {totalPages} ({totalRows} rows)
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="rounded border border-slate-600 px-2 py-1 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
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
                  <p className="text-xs text-slate-100">{displayExecutionSymbol(detail)}</p>
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
                  {canInvestigateExecution(detail) ? (
                    <Link href={buildDiagnosticCaseHref({ kind: "execution", executionId: detail.id })} className="text-xs text-blue-300 underline">
                      Open diagnostics case file
                    </Link>
                  ) : null}
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
