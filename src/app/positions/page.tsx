"use client";

import { memo, useMemo, useRef, useState } from "react";
import { AccountLabel } from "@/components/accounts/AccountLabel";
import { Badge } from "@/components/Badge";
import { DataTableHeader } from "@/components/data-table/DataTableHeader";
import { requestCloseColumnId, toggleOpenColumnId } from "@/components/data-table/filter-panel-interaction";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { VirtualGridBody, VirtualGridHeaderRow, VirtualGridTableShell } from "@/components/data-table/VirtualGridTable";
import { useDataTableState } from "@/components/data-table/useDataTableState";
import type { DataTableColumnDefinition, SortDirection } from "@/components/data-table/types";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { useOpenPositions } from "@/hooks/useOpenPositions";
import { isAccountInScope } from "@/lib/api/account-scope";
import { openPositionsStore } from "@/store/openPositionsStore";
import type { OpenPosition } from "@/types/api";

const POSITIONS_COLUMN_TEMPLATE = "120px 100px 100px 130px 80px 90px 140px 110px 140px 150px 110px 160px";

function positionKey(position: OpenPosition): string {
  return position.accountId + "::" + position.instrumentKey;
}
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}
function formatSignedCurrency(value: number): string {
  const formatted = formatCurrency(Math.abs(value));
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
}
function formatPercent(value: number): string {
  return value.toFixed(2) + "%";
}
function getDte(expirationDate: string | null): number | null {
  if (!expirationDate) return null;
  const expiration = new Date(expirationDate);
  return Math.ceil((expiration.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}
// expirationDate is a UTC-midnight date-only value; format in UTC so it doesn't shift a day back in local time.
function formatExpiry(value: string): string {
  return new Date(value).toLocaleDateString("en-US", { timeZone: "UTC" });
}
function formatQuoteTimestamp(value: Date | null): string {
  if (!value) return "—";
  return value.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "medium" });
}

const PositionRow = memo(function PositionRow({ row, markLoading }: { row: OpenPosition & { key: string; dte: number | null; mark: number | null; marketValue: number | null; unrealizedPnl: number | null; pnlPct: number | null }; markLoading: boolean; }) {
  return (
    <>
      <div className="px-2 py-2 font-semibold">{row.underlyingSymbol}</div>
      <div className="px-2 py-2">{row.assetClass === "OPTION" ? <Badge variant={row.optionType === "PUT" ? "put" : "call"}>{row.optionType ?? "OPTION"}</Badge> : <Badge variant="stub">EQUITY</Badge>}</div>
      <div className="px-2 py-2 text-right font-mono">{row.strike ?? "—"}</div>
      <div className="px-2 py-2">{row.expirationDate ? formatExpiry(row.expirationDate) : "—"}</div>
      <div className={["px-2 py-2 text-right", row.dte === null ? "text-text-2" : row.dte < 7 ? "text-red-300" : row.dte < 30 ? "text-amber-300" : "text-text"].join(" ")}>{row.dte ?? "—"}</div>
      <div className={row.netQty >= 0 ? "px-2 py-2 text-right text-green-300" : "px-2 py-2 text-right text-red-300"}>{row.netQty}</div>
      <div className="px-2 py-2 text-right font-mono">{formatCurrency(row.costBasis)}</div>
      <div className="px-2 py-2 text-right font-mono">{markLoading ? <span className="text-text-2">...</span> : row.mark === null ? "—" : formatCurrency(row.mark)}</div>
      <div className="px-2 py-2 text-right font-mono">{row.marketValue === null ? "—" : formatCurrency(row.marketValue)}</div>
      <div className={row.unrealizedPnl !== null && row.unrealizedPnl >= 0 ? "px-2 py-2 text-right text-green-300" : "px-2 py-2 text-right text-red-300"}>{row.unrealizedPnl === null ? "—" : formatCurrency(row.unrealizedPnl)}</div>
      <div className={row.pnlPct !== null && row.pnlPct >= 0 ? "px-2 py-2 text-right text-green-300" : "px-2 py-2 text-right text-red-300"}>{row.pnlPct === null ? "—" : formatPercent(row.pnlPct)}</div>
      <div className="px-2 py-2 text-text-2"><AccountLabel accountId={row.accountId} /></div>
    </>
  );
});

export default function Page() {
  const { positions, loading, error } = useOpenPositions();
  const { selectedAccounts, getAccountDisplayText } = useAccountFilterContext();
  const snapshot = openPositionsStore.getSnapshot(selectedAccounts);
  const [openColumnId, setOpenColumnId] = useState<string | null>(null);
  const [snapshotCopyStatus, setSnapshotCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const filteredPositions = useMemo(() => positions.filter((position) => isAccountInScope(selectedAccounts, position.accountId)), [positions, selectedAccounts]);
  const lastQuoted = useMemo(() => (snapshot.lastRefreshedAt === null ? null : new Date(snapshot.lastRefreshedAt)), [snapshot.lastRefreshedAt]);
  const hasPersistedSnapshot = snapshot.lastRefreshedAt !== null;

  const rows = useMemo(() => filteredPositions.map((position) => {
    const key = positionKey(position);
    const mark = snapshot.quotes[position.instrumentKey] ?? null;
    const multiplier = position.assetClass === "OPTION" ? 100 : 1;
    const marketValue = mark === null ? null : mark * position.netQty * multiplier;
    const unrealizedPnl = marketValue === null ? null : marketValue - position.costBasis;
    const pnlPct = unrealizedPnl === null || position.costBasis === 0 ? null : (unrealizedPnl / Math.abs(position.costBasis)) * 100;
    return { ...position, key, dte: getDte(position.expirationDate), mark, marketValue, unrealizedPnl, pnlPct };
  }), [filteredPositions, snapshot.quotes]);

  const columns = useMemo<DataTableColumnDefinition<(typeof rows)[number]>[]>(() => [
    { id: "symbol", label: "Symbol", filterMode: "discrete", getFilterValues: (row) => row.underlyingSymbol, sortMode: "string", getSortValue: (row) => row.underlyingSymbol },
    { id: "assetClass", label: "Type", filterMode: "discrete", getFilterValues: (row) => (row.assetClass === "OPTION" ? row.optionType ?? "OPTION" : "EQUITY"), sortMode: "string", getSortValue: (row) => (row.assetClass === "OPTION" ? row.optionType ?? "OPTION" : "EQUITY") },
    { id: "strike", label: "Strike", align: "right", filterMode: "discrete", getFilterValues: (row) => row.strike ?? "—", sortMode: "number", getSortValue: (row) => (row.strike === null ? null : Number(row.strike)) },
    { id: "expirationDate", label: "Expiry", filterMode: "discrete", getFilterValues: (row) => row.expirationDate ?? "—", getFilterOptionLabel: (value) => (value === "—" ? value : formatExpiry(value)), sortMode: "date", getSortValue: (row) => row.expirationDate, defaultSortDirection: "asc" },
    { id: "dte", label: "DTE", align: "right", filterMode: "discrete", getFilterValues: (row) => (row.dte === null ? "—" : String(row.dte)), sortMode: "number", getSortValue: (row) => row.dte },
    { id: "netQty", label: "Qty", align: "right", filterMode: "discrete", getFilterValues: (row) => String(row.netQty), sortMode: "number", getSortValue: (row) => row.netQty },
    { id: "costBasis", label: "Cost Basis", align: "right", filterMode: "discrete", getFilterValues: (row) => String(row.costBasis), sortMode: "number", getSortValue: (row) => row.costBasis },
    { id: "mark", label: "Mark", align: "right", filterMode: "discrete", getFilterValues: (row) => (row.mark === null ? "—" : String(row.mark)), sortMode: "number", getSortValue: (row) => row.mark },
    { id: "marketValue", label: "Mkt Value", align: "right", filterMode: "discrete", getFilterValues: (row) => (row.marketValue === null ? "—" : String(row.marketValue)), sortMode: "number", getSortValue: (row) => row.marketValue },
    { id: "unrealizedPnl", label: "Unrealized P&L", align: "right", filterMode: "discrete", getFilterValues: (row) => (row.unrealizedPnl === null ? "—" : String(row.unrealizedPnl)), sortMode: "number", getSortValue: (row) => row.unrealizedPnl },
    { id: "pnlPct", label: "P&L %", align: "right", filterMode: "discrete", getFilterValues: (row) => (row.pnlPct === null ? "—" : String(row.pnlPct)), sortMode: "number", getSortValue: (row) => row.pnlPct },
    { id: "accountId", label: "Account", filterMode: "discrete", getFilterValues: (row) => row.accountId, getFilterOptionLabel: (value) => getAccountDisplayText(value), sortMode: "string", getSortValue: (row) => getAccountDisplayText(row.accountId), panelWidthClassName: "w-80" },
  ], [getAccountDisplayText]);

  const table = useDataTableState({ tableName: "positions", rows, columns, initialSort: { columnId: "unrealizedPnl", direction: "desc" } });

  const totals = useMemo(() => {
    const totalCostBasis = table.sortedRows.reduce((sum, row) => sum + row.costBasis, 0);
    const hasMissingMarketValue = table.sortedRows.some((row) => row.marketValue === null);
    const totalMarketValue = hasMissingMarketValue ? null : table.sortedRows.reduce((sum, row) => sum + (row.marketValue ?? 0), 0);
    const totalUnrealized = totalMarketValue === null ? null : totalMarketValue - totalCostBasis;
    return { totalCostBasis, totalMarketValue, totalUnrealized, hasMissingMarketValue };
  }, [table.sortedRows]);

  async function handleRefreshQuotes() { await openPositionsStore.refresh(selectedAccounts); }

  async function handleCopySnapshot() {
    try {
      const params = new URLSearchParams();
      if (selectedAccounts.length > 0) params.set("accountIds", selectedAccounts.join(","));
      const query = params.toString();
      const response = await fetch(`/api/export/portfolio-snapshot${query ? `?${query}` : ""}`);
      if (!response.ok) throw new Error(`Export failed: ${response.status}`);
      const body = (await response.json()) as { data: unknown };
      await navigator.clipboard.writeText(JSON.stringify(body.data, null, 2));
      setSnapshotCopyStatus("copied");
    } catch {
      setSnapshotCopyStatus("failed");
    }
    setTimeout(() => setSnapshotCopyStatus("idle"), 2000);
  }

  function applyColumnState(columnId: string, values: string[], direction: SortDirection | null) {
    table.setColumnFilter(columnId, values);
    if (direction) table.setSort({ columnId, direction });
    else if (table.sort.columnId === columnId) table.setSort({ columnId: null, direction: null });
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-text">Open Positions</p>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-text-2">{table.sortedRows.length} positions</span>
          <span className="text-xs text-text-2">Last quoted: {formatQuoteTimestamp(lastQuoted)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void handleCopySnapshot()} className="rounded border border-border bg-surface-2 px-2 py-1 text-xs text-text disabled:opacity-50" title="Copy a portfolio_snapshot JSON for the KapMan KB §A2 ingest">{snapshotCopyStatus === "copied" ? "Copied!" : snapshotCopyStatus === "failed" ? "Copy failed" : "Copy snapshot JSON"}</button>
          <button type="button" onClick={() => void handleRefreshQuotes()} disabled={snapshot.isLoading} className="rounded border border-border bg-surface-2 px-2 py-1 text-xs text-text disabled:opacity-50">{snapshot.isLoading ? "Refreshing..." : "Refresh Quotes"}</button>
        </div>
      </header>

      {loading ? <LoadingSkeleton lines={6} /> : null}
      {!loading && error ? <p className="text-sm text-red-200">{error}</p> : null}
      {!loading && !error && table.sortedRows.length === 0 ? <div className="rounded-lg border border-border bg-surface-2 p-4 text-sm text-text-2">{hasPersistedSnapshot ? "No open positions for the selected accounts." : "No position data — click Refresh Quotes to load."}</div> : null}

      {!loading && !error && table.sortedRows.length > 0 ? (
        <div className="space-y-2">
          <div className="grid gap-2 md:grid-cols-3">
            <article className="rounded-lg border border-border bg-surface-2 px-3 py-2"><p className="text-[11px] uppercase tracking-wide text-text-2">Total Cost Basis</p><p className="mt-1 text-sm font-semibold text-text">{formatCurrency(totals.totalCostBasis)}</p></article>
            <article className="rounded-lg border border-border bg-surface-2 px-3 py-2"><p className="text-[11px] uppercase tracking-wide text-text-2">Total Market Value</p><p className="mt-1 text-sm font-semibold text-text">{totals.totalMarketValue === null ? "—" : formatCurrency(totals.totalMarketValue)}</p>{totals.hasMissingMarketValue ? <p className="text-[11px] text-text-2">Waiting on cached marks</p> : null}</article>
            <article className="rounded-lg border border-border bg-surface-2 px-3 py-2"><p className="text-[11px] uppercase tracking-wide text-text-2">Total Unrealized P&L</p><p className={totals.totalUnrealized === null ? "mt-1 text-sm font-semibold text-text" : totals.totalUnrealized >= 0 ? "mt-1 text-sm font-semibold text-green-300" : "mt-1 text-sm font-semibold text-red-300"}>{totals.totalUnrealized === null ? "—" : formatSignedCurrency(totals.totalUnrealized)}</p></article>
          </div>
          {totals.hasMissingMarketValue && hasPersistedSnapshot ? <p className="text-xs text-amber-200">Some marks are unavailable in the current snapshot.</p> : null}

          <DataTableToolbar activeFilterCount={table.activeFilterCount} onClearAllFilters={() => table.clearAllFilters()} totalRows={table.sortedRows.length} />

          <VirtualGridTableShell height="calc(100vh - 340px)" scrollContainerRef={scrollContainerRef}>
            <VirtualGridHeaderRow columnTemplate={POSITIONS_COLUMN_TEMPLATE} className="bg-surface-2 text-text-2">
              {columns.map((column) => (
                <DataTableHeader
                  key={column.id}
                  as="div"
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
            </VirtualGridHeaderRow>
            <VirtualGridBody
              columnTemplate={POSITIONS_COLUMN_TEMPLATE}
              rows={table.sortedRows}
              scrollContainerRef={scrollContainerRef}
              getRowKey={(row) => row.key}
              renderRow={(row) => <PositionRow row={row} markLoading={snapshot.isLoading} />}
            />
          </VirtualGridTableShell>
        </div>
      ) : null}
    </section>
  );
}
