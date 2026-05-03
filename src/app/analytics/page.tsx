"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { KpiCard } from "@/components/KpiCard";
import { VirtualGridBody, VirtualGridHeaderRow, VirtualGridTableShell } from "@/components/data-table/VirtualGridTable";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { RangeFilterContext } from "@/contexts/RangeFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import type { InfoTooltipContent } from "@/components/widgets/InfoTooltip";
import { formatCurrency, formatNullablePercent, safeNumber } from "@/components/widgets/utils";
import type { DiagnosticsResponse, MatchedLotRecord, SetupSummaryRecord } from "@/types/api";

type SortColumn = "tag" | "underlyingSymbol" | "realizedPnl" | "winRate" | "expectancy" | "averageHoldDays";
type SortDirection = "asc" | "desc";

const ANALYTICS_SETUPS_COLUMN_TEMPLATE = "220px 180px 170px 150px 190px 130px";

interface SetupsPayload { data: SetupSummaryRecord[]; }
interface MatchedLotsPayload { data: MatchedLotRecord[]; }
interface DiagnosticsPayload { data: DiagnosticsResponse; }

const analyticsKpiHelpText: Record<string, InfoTooltipContent> = {
  totalPnl: { formula: "Sum of realized P&L across setup groups in scope.", source: "/api/setups", interpretation: "Shows aggregate realized performance for the current analytics scope." },
  winRate: { formula: "WIN count / (WIN + LOSS count), excluding FLAT lots.", source: "/api/matched-lots", interpretation: "Shows the share of closed lots that finished profitable." },
  avgHold: { formula: "Average holdingDays across matched lots in scope.", source: "/api/matched-lots", interpretation: "Shows the typical holding period of closed activity." },
  pairAmbiguities: { formula: "Count of ambiguous setup-pairing diagnostics.", source: "/api/diagnostics", interpretation: "Higher counts indicate more setup inference ambiguity that needs review." },
  shortCallPaired: { formula: "Count of short-call pairings detected by setup inference diagnostics.", source: "/api/diagnostics", interpretation: "Shows how often the inference engine paired short calls into covered-call style cases." },
  synthExpires: { formula: "Count of synthetic expiration closes surfaced in diagnostics.", source: "/api/diagnostics", interpretation: "Highlights how many closes were inferred rather than sourced directly from broker rows." },
};

export default function Page() {
  const { selectedAccounts } = useAccountFilterContext();
  const { range, applyRangeToSearchParams } = useContext(RangeFilterContext);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [allSetups, setAllSetups] = useState<SetupSummaryRecord[]>([]);
  const [matchedLots, setMatchedLots] = useState<MatchedLotRecord[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>("realizedPnl");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    let cancelled = false;
    async function loadSetups() {
      const query = new URLSearchParams({ page: "1", pageSize: "1000" });
      applyAccountIdsToSearchParams(query, selectedAccounts);
      applyRangeToSearchParams(query);
      const response = await fetch(`/api/setups?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as SetupsPayload;
      if (!cancelled) setAllSetups(payload.data);
    }
    void loadSetups();
    return () => { cancelled = true; };
  }, [selectedAccounts, range.startDate, range.endDate, applyRangeToSearchParams]);

  useEffect(() => {
    let cancelled = false;
    async function loadMatchedLotsAndDiagnostics() {
      const lotsQuery = new URLSearchParams({ page: "1", pageSize: "1000" });
      const diagnosticsQuery = new URLSearchParams();
      applyAccountIdsToSearchParams(lotsQuery, selectedAccounts);
      applyAccountIdsToSearchParams(diagnosticsQuery, selectedAccounts);
      applyRangeToSearchParams(lotsQuery);
      applyRangeToSearchParams(diagnosticsQuery);
      const [lotsResponse, diagnosticsResponse] = await Promise.all([
        fetch(`/api/matched-lots?${lotsQuery.toString()}`, { cache: "no-store" }),
        fetch(`/api/diagnostics?${diagnosticsQuery.toString()}`, { cache: "no-store" }),
      ]);
      if (lotsResponse.ok) {
        const lotsPayload = (await lotsResponse.json()) as MatchedLotsPayload;
        if (!cancelled) setMatchedLots(lotsPayload.data);
      }
      if (diagnosticsResponse.ok) {
        const diagnosticsPayload = (await diagnosticsResponse.json()) as DiagnosticsPayload;
        if (!cancelled) setDiagnostics(diagnosticsPayload.data);
      }
    }
    void loadMatchedLotsAndDiagnostics();
    return () => { cancelled = true; };
  }, [selectedAccounts, range.startDate, range.endDate, applyRangeToSearchParams]);

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
    return [{ name: "WIN", value: wins, color: "var(--pos)" }, { name: "LOSS", value: losses, color: "var(--neg)" }, { name: "FLAT", value: flat, color: "var(--text-2)" }];
  }, [filteredLots]);

  const sortedTableRows = useMemo(() => {
    const numericColumns = new Set<SortColumn>(["realizedPnl", "winRate", "expectancy", "averageHoldDays"]);
    return [...filteredAllSetups].sort((left, right) => {
      const leftValue = left[sortColumn] ?? "";
      const rightValue = right[sortColumn] ?? "";
      const result = numericColumns.has(sortColumn) ? safeNumber(leftValue as string) - safeNumber(rightValue as string) : String(leftValue).localeCompare(String(rightValue));
      return sortDirection === "asc" ? result : result * -1;
    });
  }, [filteredAllSetups, sortColumn, sortDirection]);

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection(column === "realizedPnl" ? "desc" : "asc");
  }

  return (
    <section className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total P&L" value={formatCurrency(kpis.totalPnl)} colorVariant={kpis.totalPnl >= 0 ? "pos" : "neg"} helpText={analyticsKpiHelpText.totalPnl} />
        <KpiCard label="Win Rate (%)" value={formatNullablePercent(kpis.winRate, 1)} colorVariant="accent" helpText={analyticsKpiHelpText.winRate} />
        <KpiCard label="Avg Hold" value={kpis.avgHold.toFixed(2) + "d"} colorVariant="accent" helpText={analyticsKpiHelpText.avgHold} />
        <KpiCard label="Pair Ambiguities" value={kpis.pairAmbiguities} colorVariant="neutral" helpText={analyticsKpiHelpText.pairAmbiguities} />
        <KpiCard label="Short Call Paired" value={kpis.shortCallPaired} colorVariant="neutral" helpText={analyticsKpiHelpText.shortCallPaired} />
        <KpiCard label="Synth Expires" value={kpis.synthExpires} colorVariant="neutral" helpText={analyticsKpiHelpText.synthExpires} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold text-text">P&L by Setup Tag</h2>
          <div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={pnlByTagData}><XAxis dataKey="tag" tick={{ fill: "var(--text-2)", fontSize: 10 }} /><YAxis tick={{ fill: "var(--text-2)", fontSize: 10 }} /><Tooltip contentStyle={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }} /><Bar dataKey="pnl" fill="var(--accent)" /></BarChart></ResponsiveContainer></div>
        </article>
        <article className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold text-text">Win / Loss / Flat</h2>
          <div className="h-56"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={outcomeData} dataKey="value" innerRadius={46} outerRadius={72}>{outcomeData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie></PieChart></ResponsiveContainer></div>
        </article>
      </div>

      <article className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold text-text">Setup Analytics Table</h2><span className="text-xs text-text-2">{sortedTableRows.length} rows</span></div>
        <VirtualGridTableShell height="calc(100vh - 480px)" scrollContainerRef={scrollContainerRef}>
          <VirtualGridHeaderRow columnTemplate={ANALYTICS_SETUPS_COLUMN_TEMPLATE} className="bg-surface-2 text-text-2">
            <div className="px-2 py-2 text-left"><button type="button" onClick={() => toggleSort("tag")}>Tag</button></div>
            <div className="px-2 py-2 text-left"><button type="button" onClick={() => toggleSort("underlyingSymbol")}>Underlying</button></div>
            <div className="px-2 py-2 text-right"><button type="button" onClick={() => toggleSort("realizedPnl")}>Realized P&amp;L ($)</button></div>
            <div className="px-2 py-2 text-right"><button type="button" onClick={() => toggleSort("winRate")} title="Percent of closed lots with positive outcome. Flat lots excluded.">Win Rate (%)</button></div>
            <div className="px-2 py-2 text-right"><button type="button" onClick={() => toggleSort("expectancy")} title="Average realized P&L per matched lot in this setup.">Expectancy ($ / lot)</button></div>
            <div className="px-2 py-2 text-right"><button type="button" onClick={() => toggleSort("averageHoldDays")}>Avg Hold</button></div>
          </VirtualGridHeaderRow>
          <VirtualGridBody
            columnTemplate={ANALYTICS_SETUPS_COLUMN_TEMPLATE}
            rows={sortedTableRows}
            scrollContainerRef={scrollContainerRef}
            getRowKey={(row) => row.id}
            renderRow={(row) => (
              <>
                <div className="px-2 py-2">{row.overrideTag ?? row.tag}</div>
                <div className="px-2 py-2">{row.underlyingSymbol}</div>
                <div className="px-2 py-2 text-right">{formatCurrency(safeNumber(row.realizedPnl))}</div>
                <div className="px-2 py-2 text-right">{formatNullablePercent(row.winRate === null ? null : safeNumber(row.winRate) * 100, 1)}</div>
                <div className="px-2 py-2 text-right">{formatCurrency(safeNumber(row.expectancy)) + " / lot"}</div>
                <div className="px-2 py-2 text-right">{safeNumber(row.averageHoldDays).toFixed(2)}</div>
              </>
            )}
          />
        </VirtualGridTableShell>
      </article>
    </section>
  );
}
