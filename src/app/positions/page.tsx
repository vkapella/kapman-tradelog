"use client";

import { useEffect, useMemo, useState } from "react";
import { AccountLabel } from "@/components/accounts/AccountLabel";
import { Badge } from "@/components/Badge";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { useOpenPositions } from "@/hooks/useOpenPositions";
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
  const { selectedAccounts } = useAccountFilterContext();

  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(1);
  const [markLoading, setMarkLoading] = useState(false);
  const [lastQuoted, setLastQuoted] = useState<Date | null>(null);
  const [markMap, setMarkMap] = useState<Record<string, number | null>>({});
  const [quoteUnavailable, setQuoteUnavailable] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);

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
    let cancelled = false;

    async function fetchMarks() {
      if (filteredPositions.length === 0) {
        if (!cancelled) {
          setMarkMap({});
          setLastQuoted(null);
          setQuoteUnavailable(false);
        }
        return;
      }

      setMarkLoading(true);

      try {
        const nextMap: Record<string, number | null> = {};
        let unavailable = false;
        const timeoutMs = 8_000;
        const shouldForceRefresh = refreshCounter > 0;
        const refreshNonce = String(refreshCounter);

        const equityPositions = filteredPositions.filter((position) => position.assetClass === "EQUITY");
        const optionPositions = filteredPositions.filter((position) => position.assetClass === "OPTION");

        if (equityPositions.length > 0) {
          const symbols = Array.from(new Set(equityPositions.map((position) => position.symbol))).join(",");
          const quoteParams = new URLSearchParams({ symbols });
          if (shouldForceRefresh) {
            quoteParams.set("refresh", "1");
            quoteParams.set("nonce", refreshNonce);
          }
          const equityPayload = await fetchJsonWithTimeout<QuotesResponse>(
            `/api/quotes?${quoteParams.toString()}`,
            timeoutMs,
          );

          if (isQuoteUnavailable(equityPayload)) {
            unavailable = true;
          } else {
            const quoteMap = equityPayload as Record<string, EquityQuoteRecord>;
            for (const position of equityPositions) {
              const quote = quoteMap[position.symbol];
              nextMap[positionKey(position)] = quote ? quote.mark : null;
            }
          }
        }

        if (optionPositions.length > 0) {
          const optionResults = await Promise.all(
            optionPositions.map(async (position) => {
              const key = positionKey(position);
              const expDate = position.expirationDate?.slice(0, 10);
              if (!position.optionType || !position.strike || !expDate) {
                return {
                  key,
                  mark: null,
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
                    ...(shouldForceRefresh ? { refresh: "1", nonce: refreshNonce } : {}),
                  }).toString()}`,
                  timeoutMs,
                );

                if (isOptionQuoteUnavailable(payload)) {
                  return {
                    key,
                    mark: null,
                    unavailable: true,
                  };
                }

                return {
                  key,
                  mark: payload.mark,
                  unavailable: false,
                };
              } catch {
                return {
                  key,
                  mark: null,
                  unavailable: true,
                };
              }
            }),
          );

          for (const result of optionResults) {
            nextMap[result.key] = result.mark;
            if (result.unavailable) {
              unavailable = true;
            }
          }
        }

        if (!cancelled) {
          const hasAnyLiveMarks = Object.values(nextMap).some((mark) => mark !== null);
          setMarkMap(nextMap);
          setQuoteUnavailable(unavailable || !hasAnyLiveMarks);
          setLastQuoted(hasAnyLiveMarks ? new Date() : null);
        }
      } catch {
        if (!cancelled) {
          setMarkMap({});
          setQuoteUnavailable(true);
          setLastQuoted(null);
        }
      } finally {
        if (!cancelled) {
          setMarkLoading(false);
        }
      }
    }

    void fetchMarks();

    return () => {
      cancelled = true;
    };
  }, [filteredPositions, refreshCounter]);

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

  const totals = useMemo(() => {
    const totalCostBasis = rows.reduce((sum, row) => sum + row.costBasis, 0);
    const hasMissingMarketValue = rows.some((row) => row.marketValue === null);
    const totalMarketValue = hasMissingMarketValue ? null : rows.reduce((sum, row) => sum + (row.marketValue ?? 0), 0);
    const totalUnrealized = totalMarketValue === null ? null : totalMarketValue - totalCostBasis;

    return {
      totalCostBasis,
      totalMarketValue,
      totalUnrealized,
      hasMissingMarketValue,
    };
  }, [rows]);

  const pageSize = 25;
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = showAll ? rows : rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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

  return (
    <section className="space-y-4 rounded-xl border border-border bg-panel p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-text">Open Positions</p>
          <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[11px] text-muted">{total} positions</span>
          <span className="text-xs text-muted">Last quoted: {lastQuoted ? lastQuoted.toLocaleTimeString() : "—"}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRefreshCounter((current) => current + 1)}
            disabled={markLoading}
            className="rounded border border-border bg-panel-2 px-2 py-1 text-xs text-text"
          >
            {markLoading ? "Refreshing..." : "Refresh Quotes"}
          </button>
          <button type="button" onClick={toggleShowAll} className="rounded border border-border bg-panel-2 px-2 py-1 text-xs text-text">
            {showAll ? "Show pages" : `Show all ${total}`}
          </button>
        </div>
      </header>

      {loading ? <LoadingSkeleton lines={6} /> : null}
      {!loading && error ? <p className="text-sm text-red-200">{error}</p> : null}
      {!loading && !error && total === 0 ? (
        <div className="rounded-lg border border-border bg-panel-2 p-4 text-sm text-muted">No open positions for the selected accounts.</div>
      ) : null}

      {!loading && !error && total > 0 ? (
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
          <div className={showAll ? "overflow-y-auto" : "overflow-auto"} style={showAll ? { maxHeight: "calc(100vh - 280px)" } : undefined}>
            <table className="min-w-full text-xs">
              <thead className="bg-panel-2 text-muted">
                <tr>
                  <th className="px-2 py-2 text-left">Symbol</th>
                  <th className="px-2 py-2 text-left">Type</th>
                  <th className="px-2 py-2 text-right">Strike</th>
                  <th className="px-2 py-2 text-left">Expiry</th>
                  <th className="px-2 py-2 text-right">DTE</th>
                  <th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-right">Cost Basis</th>
                  <th className="px-2 py-2 text-right">Mark</th>
                  <th className="px-2 py-2 text-right">Mkt Value</th>
                  <th className="px-2 py-2 text-right">Unrealized P&L</th>
                  <th className="px-2 py-2 text-right">P&L %</th>
                  <th className="px-2 py-2 text-left">Account</th>
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

          {!showAll ? (
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
          ) : (
            <p className="text-xs text-muted">Showing all {total} records</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
