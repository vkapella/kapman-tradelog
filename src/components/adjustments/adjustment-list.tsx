"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { AccountLabel } from "@/components/accounts/AccountLabel";
import { DataTableHeader } from "@/components/data-table/DataTableHeader";
import { requestCloseColumnId, toggleOpenColumnId } from "@/components/data-table/filter-panel-interaction";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { useDataTableState } from "@/components/data-table/useDataTableState";
import type { DataTableColumnDefinition, SortDirection } from "@/components/data-table/types";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { findSupersededExecutionPriceOverrideIds } from "@/lib/adjustments/execution-price-overrides";
import { findSupersededExecutionQtyOverrideIds } from "@/lib/adjustments/execution-qty-overrides";
import type { ManualAdjustmentRecord } from "@/types/api";

const SHOW_ALL_STORAGE_KEY = "kapman_table_adjustments_showAll";

function splitDirection(record: ManualAdjustmentRecord): string | null {
  if (record.adjustmentType !== "SPLIT") {
    return null;
  }

  const payload = record.payload as { from: number; to: number };
  if (payload.to > payload.from) {
    return "Forward split";
  }
  if (payload.to < payload.from) {
    return "Reverse split";
  }
  return "No ratio change";
}

const AdjustmentsTableBody = memo(function AdjustmentsTableBody({
  rows,
  onReverse,
  reversingId,
  supersededIds,
}: {
  rows: ManualAdjustmentRecord[];
  onReverse: (id: string) => void;
  reversingId: string | null;
  supersededIds: Set<string>;
}) {
  return (
    <tbody>
      {rows.map((record) => (
        <tr key={record.id} className="border-t border-border text-text">
          <td className="px-2 py-2">{new Date(record.createdAt).toLocaleString()}</td>
          <td className="px-2 py-2">
            <AccountLabel accountId={record.accountId} />
          </td>
          <td className="px-2 py-2">{record.symbol}</td>
          <td className="px-2 py-2">
            {record.adjustmentType}
            {splitDirection(record) ? <span className="ml-1 text-[10px] text-muted">({splitDirection(record)})</span> : null}
          </td>
          <td className="px-2 py-2">{record.effectiveDate.slice(0, 10)}</td>
          <td className="max-w-[260px] px-2 py-2 font-mono text-[10px] text-muted">{JSON.stringify(record.payload)}</td>
          <td className="max-w-[260px] px-2 py-2 text-muted">{record.reason}</td>
          <td className="px-2 py-2">
            <span className={record.status === "ACTIVE" ? "text-accent-2" : "text-muted"}>{record.status}</span>
            {record.status === "ACTIVE" && supersededIds.has(record.id) ? <span className="ml-1 text-[10px] text-amber-300">(SUPERSEDED)</span> : null}
          </td>
          <td className="px-2 py-2 text-right">
            <button
              type="button"
              disabled={record.status !== "ACTIVE" || reversingId === record.id}
              onClick={() => onReverse(record.id)}
              className="rounded border border-border bg-panel-2 px-2 py-1 text-[11px] text-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              {reversingId === record.id ? "Reversing..." : "Reverse"}
            </button>
          </td>
        </tr>
      ))}
    </tbody>
  );
});

export function AdjustmentList({
  adjustments,
  onReverse,
  reversingId,
}: {
  adjustments: ManualAdjustmentRecord[];
  onReverse: (id: string) => void;
  reversingId: string | null;
}) {
  const { selectedAccounts, getAccountDisplayText } = useAccountFilterContext();
  const supersededIds = useMemo(() => {
    return new Set<string>([
      ...Array.from(findSupersededExecutionQtyOverrideIds(adjustments)),
      ...Array.from(findSupersededExecutionPriceOverrideIds(adjustments)),
    ]);
  }, [adjustments]);
  const scopedAdjustments = useMemo(() => adjustments.filter((record) => selectedAccounts.includes(record.accountId)), [adjustments, selectedAccounts]);
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

  const columns = useMemo<DataTableColumnDefinition<ManualAdjustmentRecord>[]>(() => [
    {
      id: "createdAt",
      label: "Created",
      filterMode: "discrete",
      getFilterValues: (row) => row.createdAt,
      getFilterOptionLabel: (value) => new Date(value).toLocaleString(),
      sortMode: "date",
      getSortValue: (row) => row.createdAt,
      defaultSortDirection: "desc",
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
      id: "symbol",
      label: "Symbol",
      filterMode: "discrete",
      getFilterValues: (row) => row.symbol,
      sortMode: "string",
      getSortValue: (row) => row.symbol,
    },
    {
      id: "adjustmentType",
      label: "Type",
      filterMode: "discrete",
      getFilterValues: (row) => row.adjustmentType,
      sortMode: "string",
      getSortValue: (row) => row.adjustmentType,
    },
    {
      id: "effectiveDate",
      label: "Effective",
      filterMode: "discrete",
      getFilterValues: (row) => row.effectiveDate,
      getFilterOptionLabel: (value) => value.slice(0, 10),
      sortMode: "date",
      getSortValue: (row) => row.effectiveDate,
      defaultSortDirection: "desc",
    },
    {
      id: "payload",
      label: "Payload",
      filterMode: "discrete",
      getFilterValues: (row) => JSON.stringify(row.payload),
      sortMode: "string",
      getSortValue: (row) => JSON.stringify(row.payload),
      panelWidthClassName: "w-96",
    },
    {
      id: "reason",
      label: "Reason",
      filterMode: "discrete",
      getFilterValues: (row) => row.reason,
      sortMode: "string",
      getSortValue: (row) => row.reason,
      panelWidthClassName: "w-96",
    },
    {
      id: "status",
      label: "Status",
      filterMode: "discrete",
      getFilterValues: (row) => row.status,
      sortMode: "string",
      getSortValue: (row) => row.status,
    },
    {
      id: "action",
      label: "Action",
      align: "right",
      filterMode: "discrete",
      getFilterValues: (row) => (row.status === "ACTIVE" ? "Reverse" : "Unavailable"),
      sortMode: "string",
      getSortValue: (row) => (row.status === "ACTIVE" ? "Reverse" : "Unavailable"),
    },
  ], [getAccountDisplayText]);

  const table = useDataTableState({
    tableName: "adjustments",
    rows: scopedAdjustments,
    columns,
    initialSort: { columnId: "createdAt", direction: "desc" },
  });

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
    table.setColumnFilter(columnId, values);
    if (direction) {
      table.setSort({ columnId, direction });
    } else if (table.sort.columnId === columnId) {
      table.setSort({ columnId: null, direction: null });
    }
    setPage(1);
  }

  return (
    <div className="rounded-xl border border-border bg-panel p-3">
      <p className="mb-3 text-sm font-semibold text-text">Adjustment Ledger</p>
      {totalRows === 0 ? <p className="text-xs text-muted">No adjustments yet.</p> : null}
      {totalRows > 0 ? (
        <div className="space-y-3">
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
          <div className={showAll ? "max-h-[520px] overflow-y-auto rounded border border-border" : "overflow-auto rounded border border-border"}>
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 z-10 bg-panel-2 text-muted">
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
              <AdjustmentsTableBody rows={pagedRows} onReverse={onReverse} reversingId={reversingId} supersededIds={supersededIds} />
            </table>
          </div>
          {showAll ? (
            <p className="text-xs text-muted">Showing all {totalRows} records</p>
          ) : (
            <div className="flex items-center justify-between text-xs text-muted">
              <p>
                Showing page {currentPage} of {totalPages} ({totalRows} rows)
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="rounded border border-border px-2 py-1 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  className="rounded border border-border px-2 py-1 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
