"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, Cell, LabelList, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { formatCompactCurrency, safeNumber } from "@/components/widgets/utils";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import {
  getOverallTtsReadinessStatus,
  getTtsMetricStatus,
  getTtsStatusColor,
  getTtsStatusLabel,
  getTtsStatusTintClass,
  type TtsRagStatus,
} from "@/lib/tts/readiness";
import type { TtsEvidenceResponse } from "@/types/api";

interface TtsPayload {
  data: TtsEvidenceResponse;
}

interface TtsMetricSectionDefinition {
  id: string;
  label: string;
  value: string;
  target: string;
  status: TtsRagStatus;
  description: string;
  trendKey:
    | "tradesPerMonth"
    | "activeDaysPerWeek"
    | "averageHoldingPeriodDays"
    | "annualizedTradeCount"
    | "medianHoldingPeriodDays"
    | "grossProceedsProxy";
}

function StatusDot({ status }: { status: TtsRagStatus }) {
  return <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getTtsStatusColor(status) }} />;
}

function Sparkline({
  series,
  dataKey,
}: {
  series: TtsEvidenceResponse["monthlySeries"];
  dataKey: TtsMetricSectionDefinition["trendKey"];
}) {
  const chartSeries = series.map((entry) => ({
    month: entry.month,
    value: dataKey === "grossProceedsProxy" ? safeNumber(entry.grossProceedsProxy) : entry[dataKey],
  }));
  const hasTrend = chartSeries.filter((entry) => entry.value !== null).length >= 2;

  if (!hasTrend) {
    return <p className="text-[11px] text-muted">Trend pending more monthly history.</p>;
  }

  return (
    <div className="h-16">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartSeries}>
          <XAxis dataKey="month" hide />
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function MetricSection({
  definition,
  series,
}: {
  definition: TtsMetricSectionDefinition;
  series: TtsEvidenceResponse["monthlySeries"];
}) {
  return (
    <section className="rounded-2xl border border-border bg-panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted">{definition.label}</p>
          <p className="mt-2 text-3xl font-semibold text-text">{definition.value}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-panel-2 px-3 py-1 text-xs text-text">
          <StatusDot status={definition.status} />
          <span>{getTtsStatusLabel(definition.status)}</span>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">{definition.target}</p>
      <div className="mt-4 rounded-xl border border-border bg-panel-2 p-3">
        <Sparkline series={series} dataKey={definition.trendKey} />
      </div>
      <p className="mt-4 text-sm text-muted">{definition.description}</p>
    </section>
  );
}

function buildDistributionData(data: TtsEvidenceResponse) {
  const total = data.holdingPeriodDistribution.reduce((sum, bucket) => sum + bucket.count, 0);

  return data.holdingPeriodDistribution.map((bucket) => {
    const percentage = total > 0 ? (bucket.count / total) * 100 : 0;
    let color = "var(--color-text-danger)";
    if (bucket.bucket === "0-1d" || bucket.bucket === "2-5d") {
      color = "var(--color-text-success)";
    } else if (bucket.bucket === "6-20d") {
      color = "var(--color-text-warning)";
    }

    return {
      ...bucket,
      color,
      percentage,
      annotation: `${bucket.count} (${percentage.toFixed(0)}%)`,
    };
  });
}

export function TtsEvidencePanel() {
  const { selectedAccounts } = useAccountFilterContext();
  const [data, setData] = useState<TtsEvidenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadEvidence() {
      setLoading(true);
      setError(null);

      const query = new URLSearchParams();
      applyAccountIdsToSearchParams(query, selectedAccounts);

      const response = await fetch(`/api/tts/evidence?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        setError("Unable to load evidence metrics.");
        setLoading(false);
        return;
      }

      const payload = (await response.json()) as TtsPayload;
      setData(payload.data);
      setLoading(false);
    }

    void loadEvidence();
  }, [selectedAccounts]);

  const hasData = Boolean(data && data.annualizedTradeCount > 0);
  const overallStatus = data ? getOverallTtsReadinessStatus(data) : "info";
  const distributionData = useMemo(() => (data ? buildDistributionData(data) : []), [data]);
  const metricSections: TtsMetricSectionDefinition[] = data
    ? [
        {
          id: "tradesPerMonth",
          label: "Trades Per Month",
          value: data.tradesPerMonth.toFixed(1),
          target: "Target >= 60 per month for stronger trader-frequency evidence.",
          status: getTtsMetricStatus("tradesPerMonth", data),
          description: "Courts look for regular, continuous execution volume rather than sporadic bursts of activity.",
          trendKey: "tradesPerMonth",
        },
        {
          id: "activeDaysPerWeek",
          label: "Active Days Per Week",
          value: data.activeDaysPerWeek.toFixed(1),
          target: "Target >= 4 trading days per week.",
          status: getTtsMetricStatus("activeDaysPerWeek", data),
          description: "This shows whether the activity is week-in, week-out trading rather than occasional position management.",
          trendKey: "activeDaysPerWeek",
        },
        {
          id: "averageHoldingPeriodDays",
          label: "Average Holding Period",
          value: `${data.averageHoldingPeriodDays.toFixed(1)}d`,
          target: "Target <= 31 days to avoid an appreciation-seeking profile.",
          status: getTtsMetricStatus("averageHoldingPeriodDays", data),
          description: "Average hold duration helps distinguish short-duration trading from longer-term investing intent.",
          trendKey: "averageHoldingPeriodDays",
        },
        {
          id: "annualizedTradeCount",
          label: "Annualized Trade Count",
          value: data.annualizedTradeCount.toFixed(0),
          target: "Target >= 720 annualized trades.",
          status: getTtsMetricStatus("annualizedTradeCount", data),
          description: "Annualized volume helps frame whether the observed pace scales to a full-year trading pattern.",
          trendKey: "annualizedTradeCount",
        },
        {
          id: "medianHoldingPeriodDays",
          label: "Median Holding Period",
          value: `${data.medianHoldingPeriodDays.toFixed(1)}d`,
          target: "Supplemental duration context only.",
          status: "info",
          description: "Median hold shows the typical trade duration without being skewed by a few outlier holds.",
          trendKey: "medianHoldingPeriodDays",
        },
        {
          id: "grossProceedsProxy",
          label: "Gross Trading Proceeds",
          value: formatCompactCurrency(safeNumber(data.grossProceedsProxy)),
          target: "Used as a substantiality signal rather than a pass/fail threshold.",
          status: "info",
          description:
            "Courts have used gross proceeds as a substantiality proxy. This value intentionally excludes the option x100 multiplier.",
          trendKey: "grossProceedsProxy",
        },
      ]
    : [];

  return (
    <section className="space-y-6">
      <header className="rounded-2xl border border-border bg-panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">TTS Evidence / Readiness</p>
            <h1 className="text-3xl font-semibold text-text">Court-relevant trading activity metrics</h1>
            <p className="max-w-3xl text-sm text-muted">
              Evidence-oriented activity metrics only. These are readiness signals for documentation, not legal determinations.
            </p>
          </div>
          <span className={["rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em]", getTtsStatusTintClass(overallStatus)].join(" ")}>
            {getTtsStatusLabel(overallStatus)}
          </span>
        </div>
      </header>

      {loading ? <LoadingSkeleton lines={8} /> : null}
      {error ? <p className="text-sm text-[color:var(--color-text-danger)]">{error}</p> : null}

      {!loading && !error && !hasData ? (
        <div className="rounded-2xl border border-border bg-panel p-6">
          <h2 className="text-xl font-semibold text-text">No evidence metrics yet</h2>
          <p className="mt-2 text-sm text-muted">Commit imports and generate matched lots to compute holding-period and activity evidence metrics.</p>
          <Link href="/imports" className="mt-4 inline-block text-sm text-[color:var(--accent)] underline">
            Go to Imports & Connections
          </Link>
        </div>
      ) : null}

      {!loading && !error && data && hasData ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {metricSections.map((metric) => (
              <div key={metric.id} className="rounded-2xl border border-border bg-panel p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">{metric.label}</p>
                  <StatusDot status={metric.status} />
                </div>
                <p className="mt-3 text-2xl font-semibold text-text">{metric.value}</p>
                <p className="mt-1 text-[11px] text-muted">{metric.target}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {metricSections.map((metric) => (
              <MetricSection key={metric.id} definition={metric} series={data.monthlySeries} />
            ))}
          </div>

          <section className="rounded-2xl border border-border bg-panel p-5">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.22em] text-muted">Time-In-Market Distribution</p>
              <h2 className="text-2xl font-semibold text-text">Holding-period profile</h2>
              <p className="text-sm text-muted">Courts use this to verify activity is short-duration, not appreciation-seeking.</p>
            </div>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distributionData} layout="vertical" margin={{ left: 8, right: 48 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="bucket" type="category" width={56} tick={{ fill: "var(--muted)", fontSize: 12 }} />
                  <Bar dataKey="count" radius={[0, 8, 8, 0]} isAnimationActive={false}>
                    {distributionData.map((entry) => (
                      <Cell key={entry.bucket} fill={entry.color} />
                    ))}
                    <LabelList dataKey="annotation" position="right" fill="var(--text)" fontSize={12} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
