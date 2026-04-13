"use client";

import Link from "next/link";
import { memo, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AccountLabel } from "@/components/accounts/AccountLabel";
import { Badge } from "@/components/Badge";
import { DataTableHeader } from "@/components/data-table/DataTableHeader";
import { requestCloseColumnId, toggleOpenColumnId } from "@/components/data-table/filter-panel-interaction";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { useDataTableState } from "@/components/data-table/useDataTableState";
import type { DataTableColumnDefinition, SortDirection } from "@/components/data-table/types";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { formatCurrency, safeNumber } from "@/components/widgets/utils";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { fetchAllPages } from "@/lib/api/fetch-all-pages";
import { buildDiagnosticCaseHref } from "@/lib/diagnostics/case-file-link";
import type { ImportRecord, MatchedLotRecord } from "@/types/api";

const SHOW_ALL_STORAGE_KEY = "kapman_table_matched-lots_showAll";

function displayMatchedLotSymbol(row: Pick<MatchedLotRecord, "symbol" | "underlyingSymbol">): string {
  return row.underlyingSymbol ?? row.symbol;
}

function shortId(value: string): string {
  return `${value.slice(0, 8)}...`;
}

const MatchedLotsTableBody = memo(function MatchedLotsTableBody({
  rows,
  importLabelById,
}: {
  rows: MatchedLotRecord[];
  importLabelById: Map<string, string>;
}) {
  return (
    <tbody>
      {rows.map((row) => (
        <tr key={row.id} className="border-t border-slate-800 text-slate-200">
          <td className="px-2 py-2">{(row.closeTradeDate ?? row.openTradeDate).slice(0, 10)}</td>
          <td className="px-2 py-2">{displayMatchedLotSymbol(row)}</td>
          <td className="px-2 py-2">
            <AccountLabel accountId={row.accountId} />
          </td>
          <td className="px-2 py-2">
            {[row.openImportId, row.closeImportId]
              .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
              .map((value) => importLabelById.get(value) ?? shortId(value))
              .join(" / ")}
          </td>
          <td className="px-2 py-2 text-right">{row.quantity}</td>
          <td className={`px-2 py-2 text-right ${Number(row.realizedPnl) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {formatCurrency(safeNumber(row.realizedPnl))}
          </td>
          <td className="px-2 py-2 text-right">{row.holdingDays}</td>
          <td className="px-2 py-2">
            {row.outcome === "WIN" ? <Badge variant="win">WIN</Badge> : row.outcome === "LOSS" ? <Badge variant="loss">LOSS</Badge> : <Badge variant="flat">FLAT</Badge>}
          </td>
          <td className="px-2 py-2 font-mono">
            <Link href={`/executions?execution=${row.openExecutionId}&account=${row.accountId}`} className="text-blue-300 underline">
              {shortId(row.openExecutionId)}
            </Link>
          </td>
          <td className="px-2 py-2 font-mono">
            {row.closeExecutionId ? (
              <Link href={`/executions?execution=${row.closeExecutionId}&account=${row.accountId}`} className="text-blue-300 underline">
                {shortId(row.closeExecutionId)}
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
  );
});

export function MatchedLotsTablePanel() {
  const searchParams = useSearchParams();
  const { selectedAccounts, getAccountDisplayText } = useAccountFilterContext();

  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [rows, setRows] = useState<MatchedLotRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [openColumnId, setOpenColumnId] = useState<string | null>(null);

  useEffect(() => {
    try {
      setShowAll(window.localStorage.getItem(SHOW_ALL_STORAGE_KEY) === "1");
    } catch {
      setShowAll(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadImports() {
      try {
        const query = new URLSearchParams();
        applyAccountIdsToSearchParams(query, selectedAccounts);
        const payload = await fetchAllPages<ImportRecord>("/api/imports", query);
        if (!cancelled) {
          setImports(payload.data);
        }
      } catch {
        if (!cancelled) {
          setImports([]);
        }
      }
    }

    void loadImports();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts]);

  useEffect(() => {
    let cancelled = false;

    async function loadMatchedLots() {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }

      try {
        const query = new URLSearchParams();
        applyAccountIdsToSearchParams(query, selectedAccounts);
        const payload = await fetchAllPages<MatchedLotRecord>("/api/matched-lots", query);
        if (!cancelled) {
          setRows(payload.data);
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setError("Unable to load matched lots right now.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMatchedLots();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts]);

  const importLabelById = useMemo(() => {
    return new Map(imports.map((entry) => [entry.id, `${entry.filename} (${getAccountDisplayText(entry.accountId)})`]));
  }, [getAccountDisplayText, imports]);

  const columns = useMemo<DataTableColumnDefinition<MatchedLotRecord>[]>(() => [
    {
      id: "closeTradeDate",
      label: "Close Date",
      filterMode: "discrete",
      getFilterValues: (row) => row.closeTradeDate ?? row.openTradeDate,
      getFilterOptionLabel: (value) => value.slice(0, 10),
      sortMode: "date",
      getSortValue: (row) => row.closeTradeDate ?? row.openTradeDate,
      defaultSortDirection: "desc",
    },
    {
      id: "symbol",
      label: "Symbol",
      filterMode: "discrete",
      getFilterValues: (row) => displayMatchedLotSymbol(row),
      sortMode: "string",
      getSortValue: (row) => displayMatchedLotSymbol(row),
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
      id: "importIds",
      label: "Import",
      filterMode: "discrete",
      getFilterValues: (row) => [row.openImportId, row.closeImportId].filter((value): value is string => Boolean(value)),
      getFilterOptionLabel: (value) => importLabelById.get(value) ?? value,
      sortMode: "string",
      getSortValue: (row) => importLabelById.get(row.closeImportId ?? row.openImportId) ?? row.closeImportId ?? row.openImportId,
      panelWidthClassName: "w-80",
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
      id: "realizedPnl",
      label: "Realized P&L ($)",
      align: "right",
      filterMode: "discrete",
      getFilterValues: (row) => row.realizedPnl,
      sortMode: "number",
      getSortValue: (row) => Number(row.realizedPnl),
    },
    {
      id: "holdingDays",
      label: "Hold Days",
      align: "right",
      filterMode: "discrete",
      getFilterValues: (row) => String(row.holdingDays),
      sortMode: "number",
      getSortValue: (row) => row.holdingDays,
    },
    {
      id: "outcome",
      label: "Outcome",
      filterMode: "discrete",
      getFilterValues: (row) => row.outcome,
      sortMode: "string",
      getSortValue: (row) => row.outcome,
    },
    {
      id: "openExecutionId",
      label: "Open Execution",
      filterMode: "discrete",
      getFilterValues: (row) => row.openExecutionId,
      getFilterOptionLabel: (value) => shortId(value),
      sortMode: "string",
      getSortValue: (row) => row.openExecutionId,
      panelWidthClassName: "w-80",
    },
    {
      id: "closeExecutionId",
      label: "Close Execution",
      filterMode: "discrete",
      getFilterValues: (row) => row.closeExecutionId ?? "-",
      getFilterOptionLabel: (value) => (value === "-" ? value : shortId(value)),
      sortMode: "string",
      getSortValue: (row) => row.closeExecutionId ?? "-",
      panelWidthClassName: "w-80",
    },
    {
      id: "investigate",
      label: "Investigate",
      filterMode: "discrete",
      getFilterValues: () => "Case file",
      sortMode: "string",
      getSortValue: () => "Case file",
    },
  ], [getAccountDisplayText, importLabelById]);

  const table = useDataTableState({
    tableName: "matched-lots",
    rows,
    columns,
    initialSort: { columnId: "closeTradeDate", direction: "desc" },
  });

  const isTableHydrated = table.isHydrated;
  const setTableColumnFilter = table.setColumnFilter;

  useEffect(() => {
    if (!isTableHydrated) {
      return;
    }

    const symbolParam = searchParams.get("symbol");
    const importParam = searchParams.get("import");
    const outcomeParam = searchParams.get("outcome");

    if (symbolParam) {
      setTableColumnFilter("symbol", [symbolParam]);
    }
    if (importParam) {
      setTableColumnFilter("importIds", [importParam]);
    }
    if (outcomeParam) {
      setTableColumnFilter("outcome", [outcomeParam]);
    }
  }, [searchParams, isTableHydrated, setTableColumnFilter]);

  useEffect(() => {
    setPage(1);
  }, [selectedAccounts, table.filters, table.sort]);

  const totalRows = table.sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / 25));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(
    () => (showAll ? table.sortedRows : table.sortedRows.slice((currentPage - 1) * 25, currentPage * 25)),
    [currentPage, showAll, table.sortedRows],
  );

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

  return (
    <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/40 p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-100">Matched Lots Table (T2)</h2>
        <p className="text-sm text-slate-300">Review FIFO close-to-open linkage, realized P&L, and holding period by lot.</p>
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
          <h3 className="text-lg font-medium text-slate-100">No matched lots found</h3>
          <p className="mt-2 text-sm text-slate-300">Commit an import and run matching to populate FIFO lot records.</p>
          <Link href="/imports" className="mt-3 inline-block text-sm text-blue-300 underline">
            Go to Imports & Connections
          </Link>
        </div>
      ) : null}

      {!loading && !error && totalRows > 0 ? (
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
                      onRequestClose={() => setOpenColumnId((current) => requestCloseColumnId(current, column.id))}
                      onToggle={() => setOpenColumnId((current) => toggleOpenColumnId(current, column.id))}
                      options={table.filterOptions[column.id] ?? []}
                    />
                  ))}
                </tr>
              </thead>
              <MatchedLotsTableBody rows={pagedRows} importLabelById={importLabelById} />
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
    </section>
  );
}
