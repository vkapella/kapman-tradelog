"use client";

import Link from "next/link";
import { memo, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AccountLabel } from "@/components/accounts/AccountLabel";
import { DataTableHeader } from "@/components/data-table/DataTableHeader";
import { requestCloseColumnId, toggleOpenColumnId } from "@/components/data-table/filter-panel-interaction";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { useDataTableState } from "@/components/data-table/useDataTableState";
import type { DataTableColumnDefinition, SortDirection } from "@/components/data-table/types";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { fetchAllPages } from "@/lib/api/fetch-all-pages";
import { buildDiagnosticCaseHref } from "@/lib/diagnostics/case-file-link";
import { formatCurrency, formatNullablePercent, safeNumber } from "@/components/widgets/utils";
import type { ApiDetailResponse, SetupDetailResponse, SetupSummaryRecord } from "@/types/api";

interface SetupDetailPayload extends ApiDetailResponse<SetupDetailResponse> {}

const SHOW_ALL_STORAGE_KEY = "kapman_table_setups_showAll";

const SetupsTableBody = memo(function SetupsTableBody({
  rows,
  pathname,
}: {
  rows: SetupSummaryRecord[];
  pathname: string;
}) {
  return (
    <tbody>
      {rows.map((row) => (
        <tr key={row.id} className="border-t border-slate-800 text-slate-200">
          <td className="px-2 py-2">{row.overrideTag ?? row.tag}</td>
          <td className="px-2 py-2">{row.underlyingSymbol}</td>
          <td className="px-2 py-2">
            <AccountLabel accountId={row.accountId} />
          </td>
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
  );
});

export function SetupsAnalyticsPanel() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedAccounts, getAccountDisplayText } = useAccountFilterContext();

  const [rows, setRows] = useState<SetupSummaryRecord[]>([]);
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSetupId, setSelectedSetupId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SetupDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [openColumnId, setOpenColumnId] = useState<string | null>(null);

  useEffect(() => {
    try {
      setShowAll(window.localStorage.getItem(SHOW_ALL_STORAGE_KEY) === "1");
    } catch {
      setShowAll(false);
    }
  }, []);

  useEffect(() => {
    setSelectedSetupId(searchParams.get("setup"));
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadSetups() {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }

      try {
        const query = new URLSearchParams();
        applyAccountIdsToSearchParams(query, selectedAccounts);
        const payload = await fetchAllPages<SetupSummaryRecord>("/api/setups", query);
        if (!cancelled) {
          setRows(payload.data);
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setError("Unable to load setup groups right now.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSetups();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts]);

  useEffect(() => {
    let cancelled = false;

    async function loadSetupDetail() {
      if (!selectedSetupId) {
        if (!cancelled) {
          setDetail(null);
          setDetailError(null);
        }
        return;
      }

      if (!cancelled) {
        setDetailLoading(true);
        setDetailError(null);
      }

      try {
        const query = new URLSearchParams();
        applyAccountIdsToSearchParams(query, selectedAccounts);
        const response = await fetch(`/api/setups/${selectedSetupId}?${query.toString()}`, { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) {
            setDetail(null);
            setDetailError("Unable to load setup detail right now.");
          }
          return;
        }

        const payload = (await response.json()) as SetupDetailPayload;
        if (!cancelled) {
          setDetail(payload.data);
        }
      } catch {
        if (!cancelled) {
          setDetail(null);
          setDetailError("Unable to load setup detail right now.");
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    void loadSetupDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts, selectedSetupId]);

  const columns = useMemo<DataTableColumnDefinition<SetupSummaryRecord>[]>(() => [
    {
      id: "tag",
      label: "Tag",
      filterMode: "discrete",
      getFilterValues: (row) => row.overrideTag ?? row.tag,
      sortMode: "string",
      getSortValue: (row) => row.overrideTag ?? row.tag,
    },
    {
      id: "underlyingSymbol",
      label: "Underlying",
      filterMode: "discrete",
      getFilterValues: (row) => row.underlyingSymbol,
      sortMode: "string",
      getSortValue: (row) => row.underlyingSymbol,
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
      id: "realizedPnl",
      label: "Realized P&L ($)",
      align: "right",
      filterMode: "discrete",
      getFilterValues: (row) => row.realizedPnl ?? "0",
      sortMode: "number",
      getSortValue: (row) => safeNumber(row.realizedPnl),
    },
    {
      id: "winRate",
      label: "Win Rate (%)",
      align: "right",
      title: "Percent of closed lots with positive outcome. Flat lots excluded.",
      filterMode: "discrete",
      getFilterValues: (row) => (row.winRate === null ? "-" : String(Math.round(safeNumber(row.winRate) * 1000) / 10)),
      sortMode: "number",
      getSortValue: (row) => (row.winRate === null ? null : safeNumber(row.winRate)),
    },
    {
      id: "expectancy",
      label: "Expectancy ($ / lot)",
      align: "right",
      title: "Average realized P&L per matched lot in this setup.",
      filterMode: "discrete",
      getFilterValues: (row) => row.expectancy ?? "0",
      sortMode: "number",
      getSortValue: (row) => safeNumber(row.expectancy),
    },
    {
      id: "averageHoldDays",
      label: "Avg Hold",
      align: "right",
      filterMode: "discrete",
      getFilterValues: (row) => row.averageHoldDays ?? "0",
      sortMode: "number",
      getSortValue: (row) => safeNumber(row.averageHoldDays),
    },
    {
      id: "detail",
      label: "Detail",
      filterMode: "discrete",
      getFilterValues: () => "View detail",
      sortMode: "string",
      getSortValue: () => "View detail",
    },
    {
      id: "investigate",
      label: "Investigate",
      filterMode: "discrete",
      getFilterValues: () => "Case file",
      sortMode: "string",
      getSortValue: () => "Case file",
    },
  ], [getAccountDisplayText]);

  const table = useDataTableState({
    tableName: "setups",
    rows,
    columns,
    initialSort: { columnId: "realizedPnl", direction: "desc" },
  });

  const isTableHydrated = table.isHydrated;
  const setTableColumnFilter = table.setColumnFilter;

  useEffect(() => {
    if (!isTableHydrated) {
      return;
    }

    const accountParam = searchParams.get("account");
    const tagParam = searchParams.get("tag");

    if (accountParam) {
      setTableColumnFilter("accountId", [accountParam]);
    }
    if (tagParam) {
      setTableColumnFilter("tag", [tagParam]);
    }
  }, [searchParams, isTableHydrated, setTableColumnFilter]);

  useEffect(() => {
    setPage(1);
  }, [selectedAccounts, table.filters, table.sort]);

  const summary = useMemo(() => {
    if (table.sortedRows.length === 0) {
      return {
        totalPnl: 0,
        averageWinRate: null as number | null,
        averageExpectancy: 0,
        averageHoldDays: 0,
      };
    }

    const totalPnl = table.sortedRows.reduce((sum, row) => sum + safeNumber(row.realizedPnl), 0);
    const winRates = table.sortedRows
      .map((row) => (row.winRate === null ? null : safeNumber(row.winRate)))
      .filter((value): value is number => value !== null);
    const averageWinRateRatio = winRates.length > 0 ? winRates.reduce((sum, value) => sum + value, 0) / winRates.length : null;
    const expectancies = table.sortedRows.map((row) => safeNumber(row.expectancy));
    const averageExpectancy = expectancies.length > 0 ? expectancies.reduce((sum, value) => sum + value, 0) / expectancies.length : 0;
    const holdDays = table.sortedRows.map((row) => safeNumber(row.averageHoldDays));
    const averageHoldDays = holdDays.length > 0 ? holdDays.reduce((sum, value) => sum + value, 0) / holdDays.length : 0;

    return {
      totalPnl,
      averageWinRate: averageWinRateRatio === null ? null : averageWinRateRatio * 100,
      averageExpectancy,
      averageHoldDays,
    };
  }, [table.sortedRows]);

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
          <h3 className="text-lg font-medium text-slate-100">No setup groups found</h3>
          <p className="mt-2 text-sm text-slate-300">Commit an import so setup inference can generate T3 groups from matched lots.</p>
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
              <SetupsTableBody rows={pagedRows} pathname={pathname} />
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
                  <thead className="sticky top-0 z-10 bg-slate-900 text-slate-300">
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
