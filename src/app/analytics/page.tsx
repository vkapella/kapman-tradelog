"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { KpiCard } from "@/components/KpiCard";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { formatCurrency, formatNullablePercent, safeNumber } from "@/components/widgets/utils";
import type { DiagnosticsResponse, MatchedLotRecord, SetupSummaryRecord } from "@/types/api";

const SHOW_ALL_KEY = "kapman_table_setups_showAll";

type SortColumn = "tag" | "underlyingSymbol" | "realizedPnl" | "winRate" | "expectancy" | "averageHoldDays";
type SortDirection = "asc" | "desc";

interface SetupsPayload {
  data: SetupSummaryRecord[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
  };
}

interface MatchedLotsPayload {
  data: MatchedLotRecord[];
}

interface DiagnosticsPayload {
  data: DiagnosticsResponse;
}

export default function Page() {
  const { selectedAccounts } = useAccountFilterContext();

  const [allSetups, setAllSetups] = useState<SetupSummaryRecord[]>([]);
  const [tableRows, setTableRows] = useState<SetupSummaryRecord[]>([]);
  const [tableMeta, setTableMeta] = useState({ total: 0, page: 1, pageSize: 25 });
  const [tablePage, setTablePage] = useState(1);
  const [showAll, setShowAll] = useState(false);

  const [matchedLots, setMatchedLots] = useState<MatchedLotRecord[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null);

  const [sortColumn, setSortColumn] = useState<SortColumn>("realizedPnl");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    try {
      setShowAll(window.localStorage.getItem(SHOW_ALL_KEY) === "1");
    } catch {
      setShowAll(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSetupsForChart() {
      const query = new URLSearchParams({ page: "1", pageSize: "1000" });
      applyAccountIdsToSearchParams(query, selectedAccounts);
      const response = await fetch(`/api/setups?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as SetupsPayload;
      if (!cancelled) {
        setAllSetups(payload.data);
      }
    }

    void loadSetupsForChart();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts]);

  useEffect(() => {
    let cancelled = false;

    async function loadTableRows() {
      const query = new URLSearchParams({
        page: String(showAll ? 1 : tablePage),
        pageSize: String(showAll ? 1000 : 25),
      });
      applyAccountIdsToSearchParams(query, selectedAccounts);
      const response = await fetch(`/api/setups?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as SetupsPayload;
      if (!cancelled) {
        setTableRows(payload.data);
        setTableMeta(payload.meta);
      }
    }

    void loadTableRows();

    return () => {
      cancelled = true;
    };
  }, [showAll, tablePage, selectedAccounts]);

  useEffect(() => {
    let cancelled = false;

    async function loadMatchedLotsAndDiagnostics() {
      const lotsQuery = new URLSearchParams({ page: "1", pageSize: "1000" });
      const diagnosticsQuery = new URLSearchParams();
      applyAccountIdsToSearchParams(lotsQuery, selectedAccounts);
      applyAccountIdsToSearchParams(diagnosticsQuery, selectedAccounts);

      const [lotsResponse, diagnosticsResponse] = await Promise.all([
        fetch(`/api/matched-lots?${lotsQuery.toString()}`, { cache: "no-store" }),
        fetch(`/api/diagnostics?${diagnosticsQuery.toString()}`, { cache: "no-store" }),
      ]);

      if (lotsResponse.ok) {
        const lotsPayload = (await lotsResponse.json()) as MatchedLotsPayload;
        if (!cancelled) {
          setMatchedLots(lotsPayload.data);
        }
      }

      if (diagnosticsResponse.ok) {
        const diagnosticsPayload = (await diagnosticsResponse.json()) as DiagnosticsPayload;
        if (!cancelled) {
          setDiagnostics(diagnosticsPayload.data);
        }
      }
    }

    void loadMatchedLotsAndDiagnostics();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts]);

  const filteredAllSetups = useMemo(() => allSetups.filter((row) => selectedAccounts.includes(row.accountId)), [allSetups, selectedAccounts]);
  const filteredLots = useMemo(() => matchedLots.filter((row) => selectedAccounts.includes(row.accountId)), [matchedLots, selectedAccounts]);

  const kpis = useMemo(() => {
    const totalPnl = filteredAllSetups.reduce((sum, row) => sum + safeNumber(row.realizedPnl), 0);
    const wins = filteredLots.filter((row) => row.outcome === "WIN").length;
    const losses = filteredLots.filter((row) => row.outcome === "LOSS").length;
    const avgHold = filteredLots.length === 0 ? 0 : filteredLots.reduce((sum, row) => sum + row.holdingDays, 0) / filteredLots.length;

    return {
      totalPnl,
      winRate: wins + losses === 0 ? null : (wins / (wins + losses)) * 100,
      avgHold,
      pairAmbiguities: diagnostics?.setupInference.setupInferencePairAmbiguousTotal ?? 0,
      shortCallPaired: diagnostics?.setupInference.setupInferenceShortCallPairedTotal ?? 0,
      synthExpires: diagnostics?.syntheticExpirationCount ?? 0,
    };
  }, [diagnostics, filteredAllSetups, filteredLots]);

  const pnlByTagData = useMemo(() => {
    const grouped = new Map<string, number>();

    for (const row of filteredAllSetups) {
      const tag = row.overrideTag ?? row.tag;
      grouped.set(tag, (grouped.get(tag) ?? 0) + safeNumber(row.realizedPnl));
    }

    return Array.from(grouped.entries()).map(([tag, pnl]) => ({ tag, pnl }));
  }, [filteredAllSetups]);

  const outcomeData = useMemo(() => {
    const wins = filteredLots.filter((row) => row.outcome === "WIN").length;
    const losses = filteredLots.filter((row) => row.outcome === "LOSS").length;
    const flat = filteredLots.filter((row) => row.outcome !== "WIN" && row.outcome !== "LOSS").length;

    return [
      { name: "WIN", value: wins, color: "var(--accent-2)" },
      { name: "LOSS", value: losses, color: "var(--danger)" },
      { name: "FLAT", value: flat, color: "var(--muted)" },
    ];
  }, [filteredLots]);

  const filteredTableRows = useMemo(() => {
    const rows = tableRows.filter((row) => selectedAccounts.includes(row.accountId));

    return [...rows].sort((left, right) => {
      const leftValue = left[sortColumn] ?? "";
      const rightValue = right[sortColumn] ?? "";

      const numericColumns = new Set<SortColumn>(["realizedPnl", "winRate", "expectancy", "averageHoldDays"]);
      const result = numericColumns.has(sortColumn)
        ? safeNumber(leftValue as string) - safeNumber(rightValue as string)
        : String(leftValue).localeCompare(String(rightValue));

      return sortDirection === "asc" ? result : result * -1;
    });
  }, [selectedAccounts, sortColumn, sortDirection, tableRows]);

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortColumn(column);
    setSortDirection(column === "realizedPnl" ? "desc" : "asc");
  }

  function toggleShowAll() {
    const next = !showAll;
    setShowAll(next);
    setTablePage(1);
    try {
      window.localStorage.setItem(SHOW_ALL_KEY, next ? "1" : "0");
    } catch {
      // Ignore localStorage errors.
    }
  }

  const canGoBack = tableMeta.page > 1;
  const canGoForward = tableMeta.page * tableMeta.pageSize < tableMeta.total;

  return (
    <section className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total P&L" value={formatCurrency(kpis.totalPnl)} colorVariant={kpis.totalPnl >= 0 ? "pos" : "neg"} />
        <KpiCard label="Win Rate (%)" value={formatNullablePercent(kpis.winRate, 1)} colorVariant="accent" />
        <KpiCard label="Avg Hold" value={kpis.avgHold.toFixed(2) + "d"} colorVariant="accent" />
        <KpiCard label="Pair Ambiguities" value={kpis.pairAmbiguities} colorVariant="neutral" />
        <KpiCard label="Short Call Paired" value={kpis.shortCallPaired} colorVariant="neutral" />
        <KpiCard label="Synth Expires" value={kpis.synthExpires} colorVariant="neutral" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-border bg-panel p-4">
          <h2 className="mb-2 text-sm font-semibold text-text">P&L by Setup Tag</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pnlByTagData}>
                <XAxis dataKey="tag" tick={{ fill: "var(--muted)", fontSize: 10 }} />
                <YAxis tick={{ fill: "var(--muted)", fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "var(--panel-2)", borderColor: "var(--border)", color: "var(--text)" }} />
                <Bar dataKey="pnl" fill="var(--accent)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-xl border border-border bg-panel p-4">
          <h2 className="mb-2 text-sm font-semibold text-text">Win / Loss / Flat</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={outcomeData} dataKey="value" innerRadius={46} outerRadius={72}>
                  {outcomeData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>

      <article className="rounded-xl border border-border bg-panel p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-text">Setup Analytics Table</h2>
          <button type="button" onClick={toggleShowAll} className="rounded border border-border bg-panel-2 px-2 py-1 text-xs text-text">
            {showAll ? "Show pages" : `Show all ${tableMeta.total}`}
          </button>
        </div>

        <div className={showAll ? "overflow-y-auto" : "overflow-auto"} style={showAll ? { maxHeight: "calc(100vh - 280px)" } : undefined}>
          <table className="min-w-full text-xs">
              <thead className="sticky top-0 z-10 bg-panel-2 text-muted">
              <tr>
                <th className="px-2 py-2 text-left">
                  <button type="button" onClick={() => toggleSort("tag")}>Tag</button>
                </th>
                <th className="px-2 py-2 text-left">
                  <button type="button" onClick={() => toggleSort("underlyingSymbol")}>Underlying</button>
                </th>
                <th className="px-2 py-2 text-right">
                  <button type="button" onClick={() => toggleSort("realizedPnl")}>Realized P&L ($)</button>
                </th>
                <th className="px-2 py-2 text-right">
                  <button type="button" onClick={() => toggleSort("winRate")} title="Percent of closed lots with positive outcome. Flat lots excluded.">
                    Win Rate (%)
                  </button>
                </th>
                <th className="px-2 py-2 text-right">
                  <button type="button" onClick={() => toggleSort("expectancy")} title="Average realized P&L per matched lot in this setup.">
                    Expectancy ($ / lot)
                  </button>
                </th>
                <th className="px-2 py-2 text-right">
                  <button type="button" onClick={() => toggleSort("averageHoldDays")}>Avg Hold</button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredTableRows.map((row) => (
                <tr key={row.id} className="border-t border-border text-text">
                  <td className="px-2 py-2">{row.overrideTag ?? row.tag}</td>
                  <td className="px-2 py-2">{row.underlyingSymbol}</td>
                  <td className="px-2 py-2 text-right">{formatCurrency(safeNumber(row.realizedPnl))}</td>
                  <td className="px-2 py-2 text-right">{formatNullablePercent(row.winRate === null ? null : safeNumber(row.winRate) * 100, 1)}</td>
                  <td className="px-2 py-2 text-right">{formatCurrency(safeNumber(row.expectancy)) + " / lot"}</td>
                  <td className="px-2 py-2 text-right">{safeNumber(row.averageHoldDays).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showAll ? (
          <p className="mt-2 text-xs text-muted">Showing all {tableMeta.total} records</p>
        ) : (
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            <p>
              Showing page {tableMeta.page} of {Math.max(1, Math.ceil(tableMeta.total / tableMeta.pageSize))} ({tableMeta.total} rows)
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTablePage((current) => Math.max(1, current - 1))}
                disabled={!canGoBack}
                className="rounded border border-border px-2 py-1 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setTablePage((current) => current + 1)}
                disabled={!canGoForward}
                className="rounded border border-border px-2 py-1 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </article>
    </section>
  );
}
