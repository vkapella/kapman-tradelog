"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import type { LegendProps } from "recharts";
import { Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { RangeFilterContext } from "@/contexts/RangeFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { formatCurrency, safeNumber } from "@/components/widgets/utils";
import type { SetupSummaryRecord } from "@/types/api";

interface SetupsPayload {
  data: SetupSummaryRecord[];
}

interface TooltipPayload {
  x: number;
  y: number;
  z: number;
  row: SetupSummaryRecord;
}

interface ScatterTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: TooltipPayload }>;
}

const tagColors: Record<string, string> = {
  long_call: "var(--accent)",
  stock: "var(--pos)",
  bull_vertical: "var(--warn)",
  diagonal: "var(--neg)",
  cash_secured_put: "var(--chart-purple)",
};

const INFO_LEGEND = [
  { label: "X axis: Average hold days", color: "var(--text-2)" },
  { label: "Y axis: Expectancy ($)", color: "var(--text)" },
  { label: "Bubble size: Realized P&L magnitude", color: "var(--border)" },
] as const;

const CATEGORY_LEGEND = [
  { tag: "long_call", color: tagColors.long_call },
  { tag: "stock", color: tagColors.stock },
  { tag: "bull_vertical", color: tagColors.bull_vertical },
  { tag: "diagonal", color: tagColors.diagonal },
  { tag: "cash_secured_put", color: tagColors.cash_secured_put },
  { tag: "other", color: "var(--text-2)" },
] as const;

type KnownSeriesTag = "long_call" | "stock" | "bull_vertical" | "diagonal" | "cash_secured_put";
const KNOWN_SERIES_TAGS: ReadonlySet<string> = new Set<string>([
  "long_call",
  "stock",
  "bull_vertical",
  "diagonal",
  "cash_secured_put",
]);

function toSeriesTag(tag: string): KnownSeriesTag | "other" {
  return KNOWN_SERIES_TAGS.has(tag) ? (tag as KnownSeriesTag) : "other";
}

function ScatterTooltip({ active, payload }: ScatterTooltipProps) {
  if (!active || !payload?.length) return null;
  const { row } = payload[0].payload;
  const tag = row.overrideTag ?? row.tag;
  const ticker = row.underlyingSymbol ?? "—";
  const lotCount = row.setupLotCount ?? 1;
  const openLabel = row.setupOpenDate ?? "—";
  const closeLabel = row.setupCloseDate ?? "Open";
  const dateRange = `${openLabel} → ${closeLabel}`;
  const showExpectancy = lotCount > 1;

  return (
    <div
      className="rounded border px-3 py-2 text-xs"
      style={{
        background: "var(--surface-2)",
        borderColor: "var(--border)",
        color: "var(--text)",
      }}
    >
      <p className="font-semibold">
        {ticker} · {tag}
      </p>
      <p>Lots: {lotCount}</p>
      <p>{dateRange}</p>
      <p>Hold: {safeNumber(row.averageHoldDays).toFixed(1)} days</p>
      {showExpectancy && <p>Expectancy: {formatCurrency(safeNumber(row.expectancy))} / lot</p>}
      <p>Realized P&L: {formatCurrency(safeNumber(row.realizedPnl))}</p>
    </div>
  );
}

interface ExpectancyLegendProps extends LegendProps {
  hiddenTags: Set<string>;
  onToggle: (tag: string) => void;
  multiLotOnly: boolean;
  onMultiLotToggle: () => void;
}

function ExpectancyLegend({ hiddenTags, onToggle, multiLotOnly, onMultiLotToggle }: ExpectancyLegendProps) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-text-2">
      <button
        type="button"
        onClick={onMultiLotToggle}
        aria-pressed={multiLotOnly}
        className={`flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] transition-colors ${
          multiLotOnly ? "border-accent text-accent" : "border-border text-text-2"
        }`}
      >
        Multi-lot only
      </button>
      {INFO_LEGEND.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-full border border-border"
            style={{ backgroundColor: item.color }}
          />
          <span>{item.label}</span>
        </div>
      ))}
      {CATEGORY_LEGEND.map((item) => {
        const hidden = hiddenTags.has(item.tag);
        return (
          <button
            key={item.tag}
            type="button"
            onClick={() => onToggle(item.tag)}
            className="flex items-center gap-2 transition-opacity"
            style={{ opacity: hidden ? 0.35 : 1 }}
            aria-pressed={!hidden}
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full border border-border"
              style={{ backgroundColor: item.color }}
            />
            <span>{item.tag}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ExpectancyScatterWidget() {
  const { selectedAccounts } = useAccountFilterContext();
  const { range, applyRangeToSearchParams } = useContext(RangeFilterContext);
  const [rows, setRows] = useState<SetupSummaryRecord[]>([]);
  const [hiddenTags, setHiddenTags] = useState<Set<string>>(new Set());
  const [multiLotOnly, setMultiLotOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      const query = new URLSearchParams({ page: "1", pageSize: "1000" });
      applyAccountIdsToSearchParams(query, selectedAccounts);
      applyRangeToSearchParams(query);
      const response = await fetch(`/api/setups?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as SetupsPayload;
      if (!cancelled) {
        setRows(payload.data);
      }
    }

    void loadRows();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts, range.startDate, range.endDate, applyRangeToSearchParams]);

  const grouped = useMemo(() => {
    const map = new Map<string, Array<{ x: number; y: number; z: number; row: SetupSummaryRecord }>>();

    for (const row of rows) {
      const rawTag = row.overrideTag ?? row.tag;
      const seriesTag = toSeriesTag(rawTag);
      const points = map.get(seriesTag) ?? [];
      const RAW_Z = Math.max(1, Math.abs(safeNumber(row.realizedPnl)));
      const Z_CAP = 15000;
      const z = Math.min(RAW_Z, Z_CAP);
      points.push({
        x: safeNumber(row.averageHoldDays),
        y: safeNumber(row.expectancy),
        z,
        row,
      });
      map.set(seriesTag, points);
    }

    if (multiLotOnly) {
      map.forEach((points, tag) => {
        map.set(tag, points.filter((p) => (p.row.setupLotCount ?? 1) > 1));
      });
    }

    return map;
  }, [rows, multiLotOnly]);

  function toggleTag(tag: string) {
    setHiddenTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  return (
    <WidgetCard title="Expectancy vs Hold">
      <div className="h-[28rem]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, bottom: 28, left: 8 }}>
            <XAxis
              dataKey="x"
              type="number"
              domain={[0, "auto"]}
              tickCount={6}
              label={{ value: "Hold (days)", position: "insideBottom", offset: -4, fill: "var(--text-2)", fontSize: 10 }}
              name="Average Hold (days)"
              tick={{ fill: "var(--text-2)", fontSize: 10 }}
            />
            <YAxis
              dataKey="y"
              type="number"
              label={{ value: "Expectancy ($)", angle: -90, position: "insideLeft", offset: 12, fill: "var(--text-2)", fontSize: 10 }}
              name="Expectancy ($ / lot)"
              tick={{ fill: "var(--text-2)", fontSize: 10 }}
            />
            <ZAxis dataKey="z" range={[40, 260]} />
            <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: "3 3" }} />
            <Legend
              verticalAlign="bottom"
              align="left"
              content={
                <ExpectancyLegend
                  hiddenTags={hiddenTags}
                  onToggle={toggleTag}
                  multiLotOnly={multiLotOnly}
                  onMultiLotToggle={() => setMultiLotOnly((v) => !v)}
                />
              }
            />
            {Array.from(grouped.entries())
              .filter(([tag]) => !hiddenTags.has(tag))
              .map(([tag, points]) => (
              <Scatter key={tag} data={points} fill={tagColors[tag] ?? "var(--text-2)"} />
              ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </WidgetCard>
  );
}
