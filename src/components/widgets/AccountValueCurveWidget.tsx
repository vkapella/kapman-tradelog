"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { RangeFilterContext } from "@/contexts/RangeFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { formatCompactCurrency, formatCurrency, safeNumber } from "@/components/widgets/utils";
import type { AccountValueSeriesPoint, AccountValueSeriesResponse } from "@/types/api";

interface AccountValueSeriesPayload {
  data: AccountValueSeriesResponse;
}

interface ChartPoint {
  date: string;
  cash: number;
  stockEtf: number;
  options: number;
  total: number;
  brokerNlv: number | null;
  reconcileDelta: number | null;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}

function formatSignedCurrency(value: number): string {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${formatCurrency(Math.abs(value))}`;
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const row = payload[0].payload;

  return (
    <div className="rounded border border-border bg-surface-2 px-3 py-2 text-xs text-text">
      <p className="font-semibold">{row.date}</p>
      <p>Cash: {formatCurrency(row.cash)}</p>
      <p>Stock / ETF: {formatCurrency(row.stockEtf)}</p>
      <p>Options: {formatCurrency(row.options)}</p>
      <p>Total: {formatCurrency(row.total)}</p>
      {row.brokerNlv === null ? null : <p>Broker NLV: {formatCurrency(row.brokerNlv)}</p>}
      {row.reconcileDelta === null ? null : <p>Broker vs reconstructed: {formatSignedCurrency(row.reconcileDelta)}</p>}
    </div>
  );
}

function toChartPoint(point: AccountValueSeriesPoint): ChartPoint {
  return {
    date: point.date,
    cash: safeNumber(point.cash),
    stockEtf: safeNumber(point.stockEtf),
    options: safeNumber(point.options),
    total: safeNumber(point.total),
    brokerNlv: point.brokerNlv === null ? null : safeNumber(point.brokerNlv),
    reconcileDelta: point.reconcileDelta === null ? null : safeNumber(point.reconcileDelta),
  };
}

export function AccountValueCurveWidget() {
  const { selectedAccounts } = useAccountFilterContext();
  const { range, applyRangeToSearchParams } = useContext(RangeFilterContext);

  const [data, setData] = useState<AccountValueSeriesResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSeries() {
      setIsLoading(true);
      setError(null);

      try {
        const query = new URLSearchParams();
        applyAccountIdsToSearchParams(query, selectedAccounts);
        applyRangeToSearchParams(query);

        const response = await fetch(`/api/analysis/account-value-series?${query.toString()}`, { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) {
            setData(null);
            setError("Unable to load account value history.");
            setIsLoading(false);
          }
          return;
        }

        const payload = (await response.json()) as AccountValueSeriesPayload;

        if (!cancelled) {
          setData(payload.data);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setData(null);
          setError("Unable to load account value history.");
          setIsLoading(false);
        }
      }
    }

    void loadSeries();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts, range.startDate, range.endDate, applyRangeToSearchParams]);

  const points = useMemo(() => data?.points.map(toChartPoint) ?? [], [data]);
  const daysWithUnpriced = data?.meta.daysWithUnpriced ?? 0;
  const hasBrokerNlvGaps = points.length > 0 && points.some((point) => point.brokerNlv === null);

  return (
    <WidgetCard title="Account Value Curve">
      {isLoading ? <p className="text-xs text-text-2">Loading value history...</p> : null}
      {error ? <p className="text-xs text-neg">{error}</p> : null}

      {!isLoading && !error && points.length === 0 ? (
        <p className="text-xs text-text-2">No value history yet — run the value-snapshot backfill.</p>
      ) : null}

      {!isLoading && !error && points.length > 0 ? (
        <>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points}>
                <XAxis dataKey="date" tick={{ fill: "var(--text-2)", fontSize: 10 }} />
                <YAxis tick={{ fill: "var(--text-2)", fontSize: 10 }} tickFormatter={(value) => formatCompactCurrency(Number(value))} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="cash" stackId="value" stroke="var(--accent)" fill="var(--accent-dim)" />
                <Area type="monotone" dataKey="stockEtf" stackId="value" stroke="var(--pos)" fill="var(--pos-dim)" />
                <Area type="monotone" dataKey="options" stackId="value" stroke="var(--warn)" fill="var(--warn-dim)" />
                <Line type="monotone" dataKey="total" stroke="var(--text)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="brokerNlv" stroke="var(--neg)" strokeWidth={2} dot={false} strokeDasharray="6 4" connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {daysWithUnpriced > 0 || hasBrokerNlvGaps ? (
            <div className="mt-3 rounded border border-border bg-surface-2 px-3 py-2 text-xs text-text-2">
              {daysWithUnpriced > 0 ? (
                <p>
                  {daysWithUnpriced} {daysWithUnpriced === 1 ? "day has" : "days have"} positions without historical marks; those are valued at 0 and the total may be
                  understated.
                </p>
              ) : null}
              {hasBrokerNlvGaps ? <p>Broker NLV shown only on days where all selected accounts reported it.</p> : null}
            </div>
          ) : null}
        </>
      ) : null}
    </WidgetCard>
  );
}
