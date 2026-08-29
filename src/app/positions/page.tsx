"use client";

import { useMemo, useRef, useState } from "react";
import { buildPositionsColumnConfigs, type PositionsRow } from "@/app/positions/columns";
import { DataTableHeader } from "@/components/data-table/DataTableHeader";
import {
  configCellClass,
  deriveDefinitions,
  desktopTemplate,
  mobileTemplate,
  visibleConfigsFor,
} from "@/components/data-table/column-config";
import { detailsColumnConfig } from "@/components/data-table/details-column";
import { HiddenStateChips } from "@/components/data-table/HiddenStateChips";
import { RowDetailSheet } from "@/components/data-table/RowDetailSheet";
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
function getDte(expirationDate: string | null): number | null {
  if (!expirationDate) return null;
  const expiration = new Date(expirationDate);
  return Math.ceil((expiration.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}
// expirationDate is a UTC-midnight date-only value; format in UTC so it doesn't shift a day back in local time.
function formatQuoteTimestamp(value: Date | null): string {
  if (!value) return "—";
  return value.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "medium" });
}
// Composed freshness is a span, never a single number: a selection mixing a
// 5-second-old account with a 3-day-old one must say so, and a selected
// account with no data at all makes the view explicitly incomplete.
function formatFreshnessSpan(freshness: { oldestRefreshedAt: number | null; newestRefreshedAt: number | null; accountsWithoutData: string[] }): string {
  const { oldestRefreshedAt, newestRefreshedAt, accountsWithoutData } = freshness;
  const missingSuffix = accountsWithoutData.length > 0 ? ` · ${accountsWithoutData.length} ${accountsWithoutData.length === 1 ? "account" : "accounts"} without data` : "";
  if (oldestRefreshedAt === null || newestRefreshedAt === null) {
    return accountsWithoutData.length > 0 ? `no data${missingSuffix}` : "—";
  }
  if (oldestRefreshedAt === newestRefreshedAt) {
    return `${formatQuoteTimestamp(new Date(newestRefreshedAt))}${missingSuffix}`;
  }
  return `spans ${formatQuoteTimestamp(new Date(oldestRefreshedAt))} – ${formatQuoteTimestamp(new Date(newestRefreshedAt))}${missingSuffix}`;
}

export default function Page() {
  const { positions, loading, error } = useOpenPositions();
  const { selectedAccounts, getAccountDisplayText } = useAccountFilterContext();
  const snapshot = openPositionsStore.getSnapshot(selectedAccounts);
  const [openColumnId, setOpenColumnId] = useState<string | null>(null);
  const [snapshotCopyStatus, setSnapshotCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [snapshotCopyError, setSnapshotCopyError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const filteredPositions = useMemo(() => positions.filter((position) => isAccountInScope(selectedAccounts, position.accountId)), [positions, selectedAccounts]);
  const hasPersistedSnapshot = snapshot.freshness.newestRefreshedAt !== null;

  const rows = useMemo<PositionsRow[]>(() => filteredPositions.map((position) => {
    const key = positionKey(position);
    const mark = snapshot.quotes[position.instrumentKey]?.mark ?? null;
    const multiplier = position.assetClass === "OPTION" ? 100 : 1;
    const marketValue = mark === null ? null : mark * position.netQty * multiplier;
    const unrealizedPnl = marketValue === null ? null : marketValue - position.costBasis;
    const pnlPct = unrealizedPnl === null || position.costBasis === 0 ? null : (unrealizedPnl / Math.abs(position.costBasis)) * 100;
    const excursion = snapshot.excursions[position.accountId + "::" + position.instrumentKey];
    return { ...position, key, dte: getDte(position.expirationDate), mark, marketValue, unrealizedPnl, pnlPct, maePct: excursion?.maePct ?? null, mfePct: excursion?.mfePct ?? null };
  }), [filteredPositions, snapshot.quotes, snapshot.excursions]);

  const markLoadingRef = useRef(false);
  markLoadingRef.current = snapshot.isLoading;
  const [detailRow, setDetailRow] = useState<PositionsRow | null>(null);
  const configs = useMemo(() => {
    const base = buildPositionsColumnConfigs(getAccountDisplayText, () => markLoadingRef.current);
    return [...base, detailsColumnConfig<PositionsRow>(setDetailRow)];
  }, [getAccountDisplayText]);
  const columns = useMemo(() => deriveDefinitions(configs), [configs]);

  const table = useDataTableState({ tableName: "positions", rows, columns, initialSort: { columnId: "unrealizedPnl", direction: "desc" } });
  const visibleConfigs = useMemo(() => visibleConfigsFor(configs, table.visibleColumns), [configs, table.visibleColumns]);

  const totals = useMemo(() => {
    const totalCostBasis = table.sortedRows.reduce((sum, row) => sum + row.costBasis, 0);
    const hasMissingMarketValue = table.sortedRows.some((row) => row.marketValue === null);
    const totalMarketValue = hasMissingMarketValue ? null : table.sortedRows.reduce((sum, row) => sum + (row.marketValue ?? 0), 0);
    const totalUnrealized = totalMarketValue === null ? null : totalMarketValue - totalCostBasis;
    return { totalCostBasis, totalMarketValue, totalUnrealized, hasMissingMarketValue };
  }, [table.sortedRows]);

  async function handleRefreshQuotes() { await openPositionsStore.refresh(selectedAccounts); }

  async function handleCopySnapshot() {
    setSnapshotCopyError(null);
    try {
      const params = new URLSearchParams();
      if (selectedAccounts.length > 0) params.set("accountIds", selectedAccounts.join(","));
      const query = params.toString();
      const response = await fetch(`/api/export/portfolio-snapshot${query ? `?${query}` : ""}`);
      if (!response.ok) {
        // Surface the export's named fail-closed reason (#334) instead of a bare failure.
        let message = `Export failed: ${response.status}`;
        try {
          const errorBody = (await response.json()) as { error?: { code?: string; message?: string; details?: string[] } };
          if (errorBody.error?.code) {
            message = `${errorBody.error.code}: ${errorBody.error.message ?? ""} ${(errorBody.error.details ?? []).join(" ")}`.trim();
          }
        } catch {
          // Non-JSON error body; keep the status-code message.
        }
        throw new Error(message);
      }
      const body = (await response.json()) as { data: unknown };
      await navigator.clipboard.writeText(JSON.stringify(body.data, null, 2));
      setSnapshotCopyStatus("copied");
      setTimeout(() => setSnapshotCopyStatus("idle"), 2000);
    } catch (copyError) {
      setSnapshotCopyStatus("failed");
      setSnapshotCopyError(copyError instanceof Error ? copyError.message : "Export failed.");
      setTimeout(() => setSnapshotCopyStatus("idle"), 6000);
    }
  }

  function applyColumnState(columnId: string, values: string[], direction: SortDirection | null) {
    table.setColumnFilter(columnId, values);
    if (direction) table.setSort({ columnId, direction });
    else if (table.sort.columnId === columnId) table.setSort({ columnId: null, direction: null });
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface p-4 max-md:p-2">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-text">Open Positions</p>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-text-2">{table.sortedRows.length} positions</span>
          <span className="text-xs text-text-2">Last quoted: {formatFreshnessSpan(snapshot.freshness)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Copy snapshot JSON is a desk workflow: behind the overflow menu on phones. */}
          <button type="button" onClick={() => void handleCopySnapshot()} className="rounded border border-border bg-surface-2 px-2 py-1 text-xs text-text disabled:opacity-50 max-md:hidden" title="Copy a portfolio_snapshot JSON for the KapMan KB §A2 ingest">{snapshotCopyStatus === "copied" ? "Copied!" : snapshotCopyStatus === "failed" ? "Copy failed" : "Copy snapshot JSON"}</button>
          <div className="relative md:hidden">
            <button type="button" onClick={() => setOverflowOpen((current) => !current)} aria-haspopup="true" aria-expanded={overflowOpen} aria-label="More actions" className="touch-target rounded border border-border bg-surface-2 px-2 py-1 text-xs text-text">⋯</button>
            {overflowOpen ? (
              <div className="absolute right-0 z-[var(--z-page-controls)] mt-1 w-48 rounded-lg border border-border bg-surface-2 p-1 shadow-2xl">
                <button type="button" onClick={() => { setOverflowOpen(false); void handleCopySnapshot(); }} className="touch-target w-full rounded px-2 py-1.5 text-left text-xs text-text hover:bg-surface">
                  {snapshotCopyStatus === "copied" ? "Copied!" : snapshotCopyStatus === "failed" ? "Copy failed" : "Copy snapshot JSON"}
                </button>
              </div>
            ) : null}
          </div>
          {snapshotCopyStatus === "failed" && snapshotCopyError ? (
            <p className="max-w-md text-[11px] text-amber-200" title={snapshotCopyError}>
              {snapshotCopyError}
            </p>
          ) : null}
          <button type="button" onClick={() => void handleRefreshQuotes()} disabled={snapshot.isLoading} className="touch-target rounded border border-border bg-surface-2 px-2 py-1 text-xs text-text disabled:opacity-50">{snapshot.isLoading ? "Refreshing..." : "Refresh Positions & Quotes"}</button>
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
          <HiddenStateChips configs={configs} visibleColumns={table.visibleColumns} sort={table.sort} filters={table.filters} setSort={table.setSort} setColumnFilter={table.setColumnFilter} />

          <VirtualGridTableShell
            scrollContainerRef={scrollContainerRef}
            desktopTemplate={desktopTemplate(visibleConfigs)}
            mobileTemplate={mobileTemplate(visibleConfigs)}
          >
            <VirtualGridHeaderRow className="bg-surface-2 text-text-2">
              {visibleConfigs.map((config) =>
                config.renderHeader ? (
                  <div key={config.definition.id} role="columnheader" className={["px-2 py-2", configCellClass(config)].join(" ")}>
                    {config.renderHeader()}
                  </div>
                ) : (
                  <DataTableHeader
                    key={config.definition.id}
                    as="div"
                    className={configCellClass(config)}
                    column={config.definition}
                    currentSortDirection={table.sort.columnId === config.definition.id ? table.sort.direction : null}
                    currentValues={table.filters[config.definition.id] ?? []}
                    isOpen={openColumnId === config.definition.id}
                    onApply={(values, direction) => applyColumnState(config.definition.id, values, direction)}
                    onRequestClose={() => setOpenColumnId((current) => requestCloseColumnId(current, config.definition.id))}
                    onToggle={() => setOpenColumnId((current) => toggleOpenColumnId(current, config.definition.id))}
                    options={table.filterOptions[config.definition.id] ?? []}
                  />
                ),
              )}
            </VirtualGridHeaderRow>
            <VirtualGridBody
              rows={table.sortedRows}
              scrollContainerRef={scrollContainerRef}
              getRowKey={(row) => row.key}
              onRowClick={setDetailRow}
              renderRow={(row) => (
                <>
                  {visibleConfigs.map((config) => (
                    <div key={config.definition.id} className={configCellClass(config)} data-cell={config.definition.id}>
                      {config.renderCell(row)}
                    </div>
                  ))}
                </>
              )}
            />
          </VirtualGridTableShell>
          <RowDetailSheet configs={configs} row={detailRow} title="Position details" onClose={() => setDetailRow(null)} />
        </div>
      ) : null}
    </section>
  );
}
