"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { Legend, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartToggleLegend } from "@/components/widgets/ChartToggleLegend";
import { InfoTooltip, type InfoTooltipContent } from "@/components/widgets/InfoTooltip";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { RangeFilterContext } from "@/contexts/RangeFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { fetchAllPages } from "@/lib/api/fetch-all-pages";
import type { LotExcursionRecord } from "@/types/api";
import { WidgetCard } from "./WidgetCard";
import { CATEGORY_LEGEND, getSeriesTagColor, toSeriesTag } from "./setup-tag-colors";
import { formatCurrency, formatNullablePercent, safeNumber } from "./utils";

type SortColumn = "symbol" | "realizedPnl" | "realizedReturnPct" | "mfe" | "mae" | "mfePct" | "maePct" | "unpricedDays";
type SortDirection = "asc" | "desc";

interface ChartPoint {
  matchedLotId: string;
  symbol: string;
  realizedReturnPct: number;
  mfePct: number;
  maePct: number;
  unpricedDays: number;
  setupTag: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}

const EXCURSION_COLUMN_TEMPLATE = "120px 120px 130px 110px 110px 100px 100px 110px";

const SUMMARY_HELP: Record<"lots" | "averageMfe" | "averageMae", InfoTooltipContent> = {
  lots: {
    formula: "Count of visible matched lots with persisted lot-excursion records.",
    source: "/api/analysis/excursions, filtered by selected accounts, date range, and active setup-tag legend categories.",
    interpretation: "Shows how many lots are included in the scatter, summary averages, and detail table after legend toggles.",
  },
  averageMfe: {
    formula: "Average of lot MFE % across visible priced excursion rows.",
    source: "LotExcursion.mfePct, computed from historical high marks during each lot's holding window.",
    interpretation: "Higher values mean the visible lots offered more favorable unrealized upside before they closed.",
  },
  averageMae: {
    formula: "Average of lot MAE % across visible priced excursion rows.",
    source: "LotExcursion.maePct, computed from historical low marks during each lot's holding window.",
    interpretation: "More negative values mean the visible lots experienced deeper adverse unrealized drawdowns before they closed.",
  },
};

function displaySymbol(row: Pick<LotExcursionRecord, "symbol" | "underlyingSymbol">): string {
  return row.underlyingSymbol ?? row.symbol;
}

function formatFractionPercent(value: string | null, digits = 1): string {
  if (value === null) {
    return "N/A";
  }

  return formatNullablePercent(safeNumber(value) * 100, digits);
}

function sortValue(row: LotExcursionRecord, column: SortColumn): string | number {
  if (column === "symbol") {
    return displaySymbol(row);
  }

  if (column === "unpricedDays") {
    return row.unpricedDays;
  }

  return safeNumber(row[column]);
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0].payload;

  return (
    <div className="rounded border border-border bg-surface-2 px-3 py-2 text-xs text-text">
      <p className="font-semibold">{point.symbol}</p>
      <p>Setup: {point.setupTag}</p>
      <p>Realized return: {formatNullablePercent(point.realizedReturnPct * 100, 1)}</p>
      <p>MFE: {formatNullablePercent(point.mfePct * 100, 1)}</p>
      <p>MAE: {formatNullablePercent(point.maePct * 100, 1)}</p>
      {point.unpricedDays > 0 ? <p className="text-warn">{point.unpricedDays} unpriced days</p> : null}
    </div>
  );
}

export function ExcursionWidget() {
  const { accountsLoading, selectedAccounts } = useAccountFilterContext();
  const { range, applyRangeToSearchParams, isHydrated } = useContext(RangeFilterContext);
  const [rows, setRows] = useState<LotExcursionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hiddenTags, setHiddenTags] = useState<Set<string>>(new Set());
  const [sortColumn, setSortColumn] = useState<SortColumn>("mfePct");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const filtersReady = !accountsLoading && isHydrated;

  useEffect(() => {
    let cancelled = false;

    async function loadExcursions() {
      if (!filtersReady) {
        setIsLoading(true);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const query = new URLSearchParams();
        applyAccountIdsToSearchParams(query, selectedAccounts);
        applyRangeToSearchParams(query);
        const payload = await fetchAllPages<LotExcursionRecord>("/api/analysis/excursions", query);

        if (!cancelled) {
          setRows(payload.data);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setError("Unable to load MFE / MAE excursions.");
          setIsLoading(false);
        }
      }
    }

    void loadExcursions();

    return () => {
      cancelled = true;
    };
  }, [filtersReady, selectedAccounts, range.startDate, range.endDate, applyRangeToSearchParams]);

  const visibleRows = useMemo(() => {
    return rows.filter((row) => !hiddenTags.has(toSeriesTag(row.setupTag)));
  }, [rows, hiddenTags]);

  const chartPoints = useMemo<ChartPoint[]>(() => {
    return visibleRows
      .filter((row) => row.realizedReturnPct !== null && row.mfePct !== null && row.maePct !== null)
      .map((row) => ({
        matchedLotId: row.matchedLotId,
        symbol: displaySymbol(row),
        realizedReturnPct: safeNumber(row.realizedReturnPct),
        mfePct: safeNumber(row.mfePct),
        maePct: safeNumber(row.maePct),
        unpricedDays: row.unpricedDays,
        setupTag: toSeriesTag(row.setupTag),
      }));
  }, [visibleRows]);

  const groupedChartPoints = useMemo(() => {
    const grouped = new Map<string, ChartPoint[]>();

    for (const point of chartPoints) {
      const points = grouped.get(point.setupTag) ?? [];
      points.push(point);
      grouped.set(point.setupTag, points);
    }

    return grouped;
  }, [chartPoints]);

  const xAxisDomain = useMemo<[number, number]>(() => {
    if (chartPoints.length === 0) {
      return [-1, 1];
    }

    const maxAbs = Math.max(0.01, ...chartPoints.map((point) => Math.abs(point.realizedReturnPct)));
    const padded = maxAbs * 1.1;
    return [-padded, padded];
  }, [chartPoints]);

  const xAxisTicks = useMemo(() => {
    const [min, max] = xAxisDomain;
    return [min, min / 2, 0, max / 2, max];
  }, [xAxisDomain]);

  const sortedRows = useMemo(() => {
    return [...visibleRows].sort((left, right) => {
      const leftValue = sortValue(left, sortColumn);
      const rightValue = sortValue(right, sortColumn);
      const result = typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue));
      return sortDirection === "asc" ? result : result * -1;
    });
  }, [visibleRows, sortColumn, sortDirection]);

  const summary = useMemo(() => {
    const pricedRows = visibleRows.filter((row) => row.mfePct !== null && row.maePct !== null);
    const totalUnpricedDays = visibleRows.reduce((sum, row) => sum + row.unpricedDays, 0);
    if (pricedRows.length === 0) {
      return { averageMfePct: null, averageMaePct: null, totalUnpricedDays };
    }

    return {
      averageMfePct: pricedRows.reduce((sum, row) => sum + safeNumber(row.mfePct), 0) / pricedRows.length,
      averageMaePct: pricedRows.reduce((sum, row) => sum + safeNumber(row.maePct), 0) / pricedRows.length,
      totalUnpricedDays,
    };
  }, [visibleRows]);

  function toggleTag(tag: string) {
    setHiddenTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortColumn(column);
    setSortDirection(column === "mae" || column === "maePct" ? "asc" : "desc");
  }

  return (
    <WidgetCard title="MFE / MAE Excursions">
      {isLoading ? <p className="text-xs text-text-2">Loading lot excursions...</p> : null}
      {error ? <p className="text-xs text-neg">{error}</p> : null}

      {!isLoading && !error && rows.length === 0 ? (
        <div className="rounded border border-border bg-surface-2 px-3 py-3 text-xs text-text-2">
          <p>No lot excursions yet. Run the lot-excursion backfill after historical marks are loaded.</p>
        </div>
      ) : null}

      {!isLoading && !error && rows.length > 0 ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded border border-border bg-surface-2 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-text-2">Lots</p>
                <InfoTooltip label="MFE / MAE Lots" content={SUMMARY_HELP.lots} />
              </div>
              <p className="text-lg font-semibold text-text">{visibleRows.length}</p>
            </div>
            <div className="rounded border border-border bg-surface-2 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-text-2">Avg MFE</p>
                <InfoTooltip label="Average MFE" content={SUMMARY_HELP.averageMfe} />
              </div>
              <p className="text-lg font-semibold text-pos">{formatNullablePercent(summary.averageMfePct === null ? null : summary.averageMfePct * 100, 1)}</p>
            </div>
            <div className="rounded border border-border bg-surface-2 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-text-2">Avg MAE</p>
                <InfoTooltip label="Average MAE" content={SUMMARY_HELP.averageMae} />
              </div>
              <p className="text-lg font-semibold text-neg">{formatNullablePercent(summary.averageMaePct === null ? null : summary.averageMaePct * 100, 1)}</p>
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 12, bottom: 28, left: 8 }}>
                <XAxis
                  dataKey="realizedReturnPct"
                  type="number"
                  domain={xAxisDomain}
                  ticks={xAxisTicks}
                  tickCount={7}
                  name="Realized return"
                  label={{ value: "Realized return %", position: "insideBottom", offset: -4, fill: "var(--text-2)", fontSize: 10 }}
                  tick={{ fill: "var(--text-2)", fontSize: 10 }}
                  tickFormatter={(value) => formatNullablePercent(Number(value) * 100, 0)}
                />
                <ReferenceLine x={0} stroke="var(--border)" strokeDasharray="3 3" />
                <YAxis
                  dataKey="mfePct"
                  type="number"
                  domain={["auto", "auto"]}
                  tickCount={6}
                  name="MFE"
                  label={{ value: "MFE %", angle: -90, position: "insideLeft", offset: 12, fill: "var(--text-2)", fontSize: 10 }}
                  tick={{ fill: "var(--text-2)", fontSize: 10 }}
                  tickFormatter={(value) => formatNullablePercent(Number(value) * 100, 0)}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ strokeDasharray: "3 3" }} />
                <Legend
                  verticalAlign="bottom"
                  align="left"
                  content={<ChartToggleLegend hiddenItems={hiddenTags} items={CATEGORY_LEGEND} onToggle={toggleTag} />}
                />
                {Array.from(groupedChartPoints.entries()).map(([tag, points]) => (
                  <Scatter key={tag} data={points} fill={getSeriesTagColor(tag)} />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {summary.totalUnpricedDays > 0 ? (
            <div className="rounded border border-border bg-surface-2 px-3 py-2 text-xs text-warn">
              {summary.totalUnpricedDays} lot-days are missing marks; MFE / MAE may be understated for flagged lots.
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid border-b border-border bg-surface-2 text-xs font-semibold text-text-2" style={{ gridTemplateColumns: EXCURSION_COLUMN_TEMPLATE }}>
                <button type="button" className="px-2 py-2 text-left" onClick={() => toggleSort("symbol")}>Symbol</button>
                <button type="button" className="px-2 py-2 text-right" onClick={() => toggleSort("realizedPnl")}>Realized</button>
                <button type="button" className="px-2 py-2 text-right" onClick={() => toggleSort("realizedReturnPct")}>Return</button>
                <button type="button" className="px-2 py-2 text-right" onClick={() => toggleSort("mfe")}>MFE $</button>
                <button type="button" className="px-2 py-2 text-right" onClick={() => toggleSort("mae")}>MAE $</button>
                <button type="button" className="px-2 py-2 text-right" onClick={() => toggleSort("mfePct")}>MFE %</button>
                <button type="button" className="px-2 py-2 text-right" onClick={() => toggleSort("maePct")}>MAE %</button>
                <button type="button" className="px-2 py-2 text-right" onClick={() => toggleSort("unpricedDays")}>Unpriced</button>
              </div>
              <div className="max-h-80 overflow-y-auto text-xs text-text">
                {sortedRows.length === 0 ? (
                  <div className="border-b border-border px-2 py-3 text-text-2">No lots match the visible setup categories.</div>
                ) : null}
                {sortedRows.map((row) => (
                  <div key={row.id} className="grid border-b border-border" style={{ gridTemplateColumns: EXCURSION_COLUMN_TEMPLATE }}>
                    <div className="px-2 py-2">{displaySymbol(row)}</div>
                    <div className={`px-2 py-2 text-right ${safeNumber(row.realizedPnl) >= 0 ? "text-pos" : "text-neg"}`}>{formatCurrency(safeNumber(row.realizedPnl))}</div>
                    <div className="px-2 py-2 text-right">{formatFractionPercent(row.realizedReturnPct)}</div>
                    <div className="px-2 py-2 text-right text-pos">{formatCurrency(safeNumber(row.mfe))}</div>
                    <div className="px-2 py-2 text-right text-neg">{formatCurrency(safeNumber(row.mae))}</div>
                    <div className="px-2 py-2 text-right">{formatFractionPercent(row.mfePct)}</div>
                    <div className="px-2 py-2 text-right">{formatFractionPercent(row.maePct)}</div>
                    <div className={`px-2 py-2 text-right ${row.unpricedDays > 0 ? "text-warn" : ""}`}>{row.unpricedDays}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </WidgetCard>
  );
}
