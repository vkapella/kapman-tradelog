"use client";

import { useEffect, useMemo, useState } from "react";
import { AccountLabel } from "@/components/accounts/AccountLabel";
import { Badge } from "@/components/Badge";
import { DataTableHeader } from "@/components/data-table/DataTableHeader";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { useDataTableState } from "@/components/data-table/useDataTableState";
import type { DataTableColumnDefinition, SortDirection } from "@/components/data-table/types";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { useOpenPositions } from "@/hooks/useOpenPositions";
import {
  buildMarkMapFromQuoteCache,
  parsePositionsQuoteCache,
  POSITIONS_QUOTE_CACHE_KEY,
  type CachedQuoteEntry,
  type PositionsQuoteCache,
} from "@/lib/positions/quote-cache";
import type { EquityQuoteRecord, OpenPosition, OptionQuoteResponse, QuotesResponse } from "@/types/api";

const SHOW_ALL_KEY = "kapman_table_positions_showAll";

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
  if (!expirationDate) {
    return null;
  }

  const expiration = new Date(expirationDate);
  const diffMs = expiration.getTime() - Date.now();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

function isQuoteUnavailable(payload: QuotesResponse): payload is { error: "unavailable" } {
  return typeof payload === "object" && payload !== null && "error" in payload && payload.error === "unavailable";
}

function isOptionQuoteUnavailable(payload: OptionQuoteResponse): payload is { error: "unavailable" } {
  return typeof payload === "object" && payload !== null && "error" in payload && payload.error === "unavailable";
}

function formatQuoteTimestamp(value: Date | null): string {
  if (!value) {
    return "—";
  }

  return value.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export default function Page() {
  const { positions, loading, error } = useOpenPositions();
  const { selectedAccounts, getAccountDisplayText } = useAccountFilterContext();

  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(1);
  const [markLoading, setMarkLoading] = useState(false);
  const [lastQuoted, setLastQuoted] = useState<Date | null>(null);
  const [markMap, setMarkMap] = useState<Record<string, number | null>>({});
  const [quoteUnavailable, setQuoteUnavailable] = useState(false);
  const [openColumnId, setOpenColumnId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SHOW_ALL_KEY);
      setShowAll(stored === "1");
    } catch {
      setShowAll(false);
    }
  }, []);

  const filteredPositions = useMemo(() => {
    return positions.filter((position) => selectedAccounts.includes(position.accountId));
  }, [positions, selectedAccounts]);

  useEffect(() => {
    if (filteredPositions.length === 0) {
      setMarkMap({});
      setLastQuoted(null);
      setQuoteUnavailable(false);
      return;
    }

    try {
      const parsedCache = parsePositionsQuoteCache(window.localStorage.getItem(POSITIONS_QUOTE_CACHE_KEY));
      if (!parsedCache) {
        setMarkMap({});
        setLastQuoted(null);
        setQuoteUnavailable(false);
        return;
      }

      setMarkMap(buildMarkMapFromQuoteCache(filteredPositions, parsedCache.quotes));
      const parsedTimestamp = new Date(parsedCache.timestamp);
      setLastQuoted(Number.isNaN(parsedTimestamp.getTime()) ? null : parsedTimestamp);
      setQuoteUnavailable(false);
    } catch {
      setMarkMap({});
      setLastQuoted(null);
      setQuoteUnavailable(false);
    }
  }, [filteredPositions]);

  const rows = useMemo(() => {
    return filteredPositions.map((position) => {
      const key = positionKey(position);
      const mark = markMap[key] ?? null;
      const multiplier = position.assetClass === "OPTION" ? 100 : 1;
      const marketValue = mark === null ? null : mark * position.netQty * multiplier;
      const unrealizedPnl = marketValue === null ? null : marketValue - position.costBasis;
      const pnlPct = unrealizedPnl === null || position.costBasis === 0 ? null : (unrealizedPnl / Math.abs(position.costBasis)) * 100;

      return {
        ...position,
        key,
        dte: getDte(position.expirationDate),
        mark,
        marketValue,
        unrealizedPnl,
        pnlPct,
      };
    });
  }, [filteredPositions, markMap]);

  const columns = useMemo<DataTableColumnDefinition<(typeof rows)[number]>[]>(() => [
    {
      id: "symbol",
      label: "Symbol",
      filterMode: "discrete",
      getFilterValues: (row) => row.underlyingSymbol,
      sortMode: "string",
      getSortValue: (row) => row.underlyingSymbol,
    },
    {
      id: "assetClass",
      label: "Type",
      filterMode: "discrete",
      getFilterValues: (row) => (row.assetClass === "OPTION" ? row.optionType ?? "OPTION" : "EQUITY"),
      sortMode: "string",
      getSortValue: (row) => (row.assetClass === "OPTION" ? row.optionType ?? "OPTION" : "EQUITY"),
    },
    {
      id: "strike",
      label: "Strike",
      align: "right",
      filterMode: "discrete",
      getFilterValues: (row) => row.strike ?? "—",
      sortMode: "number",
      getSortValue: (row) => (row.strike === null ? null : Number(row.strike)),
    },
    {
      id: "expirationDate",
      label: "Expiry",
      filterMode: "discrete",
      getFilterValues: (row) => row.expirationDate ?? "—",
      getFilterOptionLabel: (value) => (value === "—" ? value : new Date(value).toLocaleDateString()),
      sortMode: "date",
      getSortValue: (row) => row.expirationDate,
      defaultSortDirection: "asc",
    },
    {
      id: "dte",
      label: "DTE",
      align: "right",
      filterMode: "discrete",
      getFilterValues: (row) => (row.dte === null ? "—" : String(row.dte)),
      sortMode: "number",
      getSortValue: (row) => row.dte,
    },
    {
      id: "netQty",
      label: "Qty",
      align: "right",
      filterMode: "discrete",
      getFilterValues: (row) => String(row.netQty),
      sortMode: "number",
      getSortValue: (row) => row.netQty,
    },
    {
      id: "costBasis",
      label: "Cost Basis",
      align: "right",
      filterMode: "discrete",
      getFilterValues: (row) => String(row.costBasis),
      sortMode: "number",
      getSortValue: (row) => row.costBasis,
    },
    {
      id: "mark",
      label: "Mark",
      align: "right",
      filterMode: "discrete",
      getFilterValues: (row) => (row.mark === null ? "—" : String(row.mark)),
      sortMode: "number",
      getSortValue: (row) => row.mark,
    },
    {
      id: "marketValue",
      label: "Mkt Value",
      align: "right",
      filterMode: "discrete",
      getFilterValues: (row) => (row.marketValue === null ? "—" : String(row.marketValue)),
      sortMode: "number",
      getSortValue: (row) => row.marketValue,
    },
    {
      id: "unrealizedPnl",
      label: "Unrealized P&L",
      align: "right",
      filterMode: "discrete",
      getFilterValues: (row) => (row.unrealizedPnl === null ? "—" : String(row.unrealizedPnl)),
      sortMode: "number",
      getSortValue: (row) => row.unrealizedPnl,
    },
    {
      id: "pnlPct",
      label: "P&L %",
      align: "right",
      filterMode: "discrete",
      getFilterValues: (row) => (row.pnlPct === null ? "—" : String(row.pnlPct)),
      sortMode: "number",
      getSortValue: (row) => row.pnlPct,
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
  ], [getAccountDisplayText]);

  const table = useDataTableState({
    tableName: "positions",
    rows,
    columns,
    initialSort: { columnId: "unrealizedPnl", direction: "desc" },
  });

  useEffect(() => {
    setPage(1);
  }, [selectedAccounts, table.filters, table.sort]);

  const totals = useMemo(() => {
    const totalCostBasis = table.sortedRows.reduce((sum, row) => sum + row.costBasis, 0);
    const hasMissingMarketValue = table.sortedRows.some((row) => row.marketValue === null);
    const totalMarketValue = hasMissingMarketValue ? null : table.sortedRows.reduce((sum, row) => sum + (row.marketValue ?? 0), 0);
    const totalUnrealized = totalMarketValue === null ? null : totalMarketValue - totalCostBasis;

    return {
      totalCostBasis,
      totalMarketValue,
      totalUnrealized,
      hasMissingMarketValue,
    };
  }, [table.sortedRows]);

  const totalRows = table.sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / 25));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = showAll ? table.sortedRows : table.sortedRows.slice((currentPage - 1) * 25, currentPage * 25);

  async function handleRefreshQuotes() {
    if (filteredPositions.length === 0) {
      return;
    }

    setMarkLoading(true);
    setQuoteUnavailable(false);

    try {
      const timeoutMs = 8_000;
      const timestamp = new Date();
      const quotes: Record<string, CachedQuoteEntry> = {};
      let unavailable = false;

      const equityPositions = filteredPositions.filter((position) => position.assetClass === "EQUITY");
      const optionPositions = filteredPositions.filter((position) => position.assetClass === "OPTION");

      if (equityPositions.length > 0) {
        const symbols = Array.from(new Set(equityPositions.map((position) => position.symbol))).join(",");
        const equityPayload = await fetchJsonWithTimeout<QuotesResponse>(
          `/api/quotes?${new URLSearchParams({ symbols, refresh: "1", nonce: timestamp.toISOString() }).toString()}`,
          timeoutMs,
        );

        if (isQuoteUnavailable(equityPayload)) {
          unavailable = true;
        } else {
          const quoteMap = equityPayload as Record<string, EquityQuoteRecord>;
          for (const position of equityPositions) {
            const quote = quoteMap[position.symbol];
            quotes[position.instrumentKey] = {
              ask: quote?.ask ?? null,
              bid: quote?.bid ?? null,
              mark: quote?.mark ?? null,
            };

            if (!quote) {
              unavailable = true;
            }
          }
        }
      }

      if (optionPositions.length > 0) {
        const optionResults = await Promise.all(
          optionPositions.map(async (position) => {
            const expDate = position.expirationDate?.slice(0, 10);
            if (!position.optionType || !position.strike || !expDate) {
              return {
                instrumentKey: position.instrumentKey,
                quote: { ask: null, bid: null, mark: null },
                unavailable: true,
              };
            }

            try {
              const payload = await fetchJsonWithTimeout<OptionQuoteResponse>(
                `/api/option-quote?${new URLSearchParams({
                  symbol: position.underlyingSymbol,
                  strike: position.strike,
                  expDate,
                  contractType: position.optionType,
                  refresh: "1",
                  nonce: timestamp.toISOString(),
                }).toString()}`,
                timeoutMs,
              );

              if (isOptionQuoteUnavailable(payload)) {
                return {
                  instrumentKey: position.instrumentKey,
                  quote: { ask: null, bid: null, mark: null },
                  unavailable: true,
                };
              }

              return {
                instrumentKey: position.instrumentKey,
                quote: {
                  ask: payload.ask,
                  bid: payload.bid,
                  mark: payload.mark,
                },
                unavailable: false,
              };
            } catch {
              return {
                instrumentKey: position.instrumentKey,
                quote: { ask: null, bid: null, mark: null },
                unavailable: true,
              };
            }
          }),
        );

        for (const result of optionResults) {
          quotes[result.instrumentKey] = result.quote;
          if (result.unavailable) {
            unavailable = true;
          }
        }
      }

      const nextCache: PositionsQuoteCache = {
        timestamp: timestamp.toISOString(),
        quotes,
      };

      try {
        window.localStorage.setItem(POSITIONS_QUOTE_CACHE_KEY, JSON.stringify(nextCache));
      } catch {
        // Ignore localStorage errors.
      }

      setMarkMap(buildMarkMapFromQuoteCache(filteredPositions, nextCache.quotes));
      setLastQuoted(timestamp);
      setQuoteUnavailable(unavailable);
    } catch {
      setQuoteUnavailable(true);
    } finally {
      setMarkLoading(false);
    }
  }

  function toggleShowAll() {
    const next = !showAll;
    setShowAll(next);
    setPage(1);
    try {
      window.localStorage.setItem(SHOW_ALL_KEY, next ? "1" : "0");
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
    <section className="space-y-4 rounded-xl border border-border bg-panel p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-text">Open Positions</p>
          <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[11px] text-muted">{totalRows} positions</span>
          <span className="text-xs text-muted">Last quoted: {formatQuoteTimestamp(lastQuoted)}</span>
        </div>
      </header>

      {loading ? <LoadingSkeleton lines={6} /> : null}
      {!loading && error ? <p className="text-sm text-red-200">{error}</p> : null}
      {!loading && !error && totalRows === 0 ? (
        <div className="rounded-lg border border-border bg-panel-2 p-4 text-sm text-muted">No open positions for the selected accounts.</div>
      ) : null}

      {!loading && !error && totalRows > 0 ? (
        <div className="space-y-2">
          <div className="grid gap-2 md:grid-cols-3">
            <article className="rounded-lg border border-border bg-panel-2 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted">Total Cost Basis</p>
              <p className="mt-1 text-sm font-semibold text-text">{formatCurrency(totals.totalCostBasis)}</p>
            </article>
            <article className="rounded-lg border border-border bg-panel-2 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted">Total Market Value</p>
              <p className="mt-1 text-sm font-semibold text-text">
                {totals.totalMarketValue === null ? "—" : formatCurrency(totals.totalMarketValue)}
              </p>
              {totals.hasMissingMarketValue ? <p className="text-[11px] text-muted">Waiting on live marks</p> : null}
            </article>
            <article className="rounded-lg border border-border bg-panel-2 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted">Total Unrealized P&L</p>
              <p className={totals.totalUnrealized === null ? "mt-1 text-sm font-semibold text-text" : totals.totalUnrealized >= 0 ? "mt-1 text-sm font-semibold text-green-300" : "mt-1 text-sm font-semibold text-red-300"}>
                {totals.totalUnrealized === null ? "—" : formatSignedCurrency(totals.totalUnrealized)}
              </p>
            </article>
          </div>
          {quoteUnavailable ? <p className="text-xs text-amber-200">Live quotes unavailable. Showing cost basis only.</p> : null}

          <DataTableToolbar
            activeFilterCount={table.activeFilterCount}
            onClearAllFilters={() => {
              table.clearAllFilters();
              setPage(1);
            }}
            onToggleShowAll={toggleShowAll}
            showAll={showAll}
            totalRows={totalRows}
          >
            <button
              type="button"
              onClick={() => void handleRefreshQuotes()}
              disabled={markLoading}
              className="rounded border border-border bg-panel-2 px-2 py-1 text-xs text-text"
            >
              {markLoading ? "Refreshing..." : "Refresh Quotes"}
            </button>
          </DataTableToolbar>

          <div className={showAll ? "overflow-y-auto" : "overflow-auto"} style={showAll ? { maxHeight: "calc(100vh - 280px)" } : undefined}>
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
                      onToggle={() => setOpenColumnId((current) => (current === column.id ? null : column.id))}
                      options={table.filterOptions[column.id] ?? []}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row) => (
                  <tr key={row.key} className="border-t border-border text-text">
                    <td className="px-2 py-2 font-semibold">{row.underlyingSymbol}</td>
                    <td className="px-2 py-2">
                      {row.assetClass === "OPTION" ? (
                        <Badge variant={row.optionType === "PUT" ? "put" : "call"}>{row.optionType ?? "OPTION"}</Badge>
                      ) : (
                        <Badge variant="stub">EQUITY</Badge>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{row.strike ?? "—"}</td>
                    <td className="px-2 py-2">{row.expirationDate ? new Date(row.expirationDate).toLocaleDateString() : "—"}</td>
                    <td
                      className={[
                        "px-2 py-2 text-right",
                        row.dte === null ? "text-muted" : row.dte < 7 ? "text-red-300" : row.dte < 30 ? "text-amber-300" : "text-text",
                      ].join(" ")}
                    >
                      {row.dte ?? "—"}
                    </td>
                    <td className={row.netQty >= 0 ? "px-2 py-2 text-right text-green-300" : "px-2 py-2 text-right text-red-300"}>{row.netQty}</td>
                    <td className="px-2 py-2 text-right font-mono">{formatCurrency(row.costBasis)}</td>
                    <td className="px-2 py-2 text-right font-mono">
                      {markLoading ? <span className="text-muted">...</span> : row.mark === null ? "—" : formatCurrency(row.mark)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{row.marketValue === null ? "—" : formatCurrency(row.marketValue)}</td>
                    <td className={row.unrealizedPnl !== null && row.unrealizedPnl >= 0 ? "px-2 py-2 text-right text-green-300" : "px-2 py-2 text-right text-red-300"}>
                      {row.unrealizedPnl === null ? "—" : formatCurrency(row.unrealizedPnl)}
                    </td>
                    <td className={row.pnlPct !== null && row.pnlPct >= 0 ? "px-2 py-2 text-right text-green-300" : "px-2 py-2 text-right text-red-300"}>
                      {row.pnlPct === null ? "—" : formatPercent(row.pnlPct)}
                    </td>
                    <td className="px-2 py-2 text-muted">
                      <AccountLabel accountId={row.accountId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {showAll ? (
            <p className="text-xs text-muted">Showing all {totalRows} records</p>
          ) : (
            <div className="flex items-center justify-between text-xs text-muted">
              <p>
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={currentPage <= 1}
                  className="rounded border border-border px-2 py-1 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={currentPage >= totalPages}
                  className="rounded border border-border px-2 py-1 disabled:opacity-50"
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
