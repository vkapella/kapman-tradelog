"use client";

import { useEffect, useState } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import type {
  SchedulerFreshnessRecord,
  SchedulerHealth,
  SchedulerRunRecord,
  SchedulerStatusResponse,
} from "@/types/api";

export interface HealthCopy {
  label: string;
  tone: string;
  summary: string;
  nextAction: string | null;
}

export const HEALTH_COPY: Record<SchedulerHealth, HealthCopy> = {
  HEALTHY: {
    label: "Healthy",
    tone: "text-pos",
    summary: "The scheduled pipeline is running and market data is current.",
    nextAction: null,
  },
  RUNNING: {
    label: "Running",
    tone: "text-accent",
    summary: "A scheduled run is in progress.",
    nextAction: "Re-check once the run finishes; a stuck run is recovered automatically after its lease expires.",
  },
  STALE: {
    label: "Stale data",
    tone: "text-warn",
    summary: "Market data is older than the configured tolerance.",
    nextAction:
      "Confirm the scheduled machine is still armed, then run the market-data scheduler deploy script and re-run the pipeline to catch up.",
  },
  FAILED: {
    label: "Last run failed",
    tone: "text-neg",
    summary: "The most recent run did not complete.",
    nextAction: "Review the failure below, resolve the cause, then re-run the scheduled market-data job.",
  },
  NEVER_RUN: {
    label: "No runs recorded",
    tone: "text-text-2",
    summary: "No scheduled pipeline run has been recorded yet.",
    nextAction: "Deploy the scheduled machine with the market-data scheduler script, then run the pipeline once to seed history.",
  },
};

export function formatDuration(durationMs: number | null): string {
  if (durationMs === null || durationMs < 0) {
    return "—";
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

export function formatLag(lagDays: number | null): string {
  if (lagDays === null) {
    return "no data";
  }
  if (lagDays <= 0) {
    return "current";
  }
  return lagDays === 1 ? "1 day behind" : `${lagDays} days behind`;
}

export function formatTimestamp(value: string | null): string {
  if (!value) {
    return "—";
  }
  return value.replace("T", " ").slice(0, 19).concat(" UTC");
}

export function freshnessTone(record: SchedulerFreshnessRecord): string {
  if (record.state === "CURRENT") {
    return "text-pos";
  }
  return record.state === "MISSING" ? "text-neg" : "text-warn";
}

function RunSummary({ title, run }: { title: string; run: SchedulerRunRecord | null }) {
  return (
    <div className="rounded-lg border border-border bg-bg p-3">
      <p className="text-xs text-text-3">{title}</p>
      {run ? (
        <>
          <p className="text-sm font-medium text-text">{formatTimestamp(run.finishedAt ?? run.startedAt)}</p>
          <p className="text-xs text-text-2">
            {run.status} · {formatDuration(run.durationMs)}
            {run.commonMarkDate ? ` · through ${run.commonMarkDate}` : ""}
          </p>
        </>
      ) : (
        <p className="text-sm text-text-2">Never</p>
      )}
    </div>
  );
}

export interface SchedulerStatusBodyProps {
  data: SchedulerStatusResponse | null;
  loading: boolean;
  error: string | null;
}

/** Presentation only, so every state can be rendered directly in tests. */
export function SchedulerStatusBody({ data, loading, error }: SchedulerStatusBodyProps) {
  const copy = data ? HEALTH_COPY[data.health] : null;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-text">Scheduled pipeline</h2>
        <p className="text-sm text-text-2">
          Daily market-mark ingestion and analytics backfill. Operational status for the whole install, independent of account
          selection.
        </p>
      </header>

      {loading ? <LoadingSkeleton lines={4} /> : null}
      {error && !loading ? <p className="text-sm text-neg">{error}</p> : null}

      {!loading && !error && data && copy ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-bg p-4">
            <p className={`text-lg font-semibold ${copy.tone}`}>{copy.label}</p>
            <p className="mt-1 text-sm text-text-2">{copy.summary}</p>
            {copy.nextAction ? <p className="mt-2 text-sm text-text">Next: {copy.nextAction}</p> : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <RunSummary title="Last successful run" run={data.lastSuccessfulRun} />
            <RunSummary title="Last attempt" run={data.lastRun} />
          </div>

          <div>
            <h3 className="text-sm font-medium text-text">Data freshness</h3>
            <p className="text-xs text-text-3">Tolerance: {data.freshnessToleranceDays} days</p>
            <div className="mt-2 grid gap-3 md:grid-cols-3">
              {data.freshness.map((entry) => (
                <div key={entry.key} className="rounded-lg border border-border bg-bg p-3">
                  <p className="text-xs text-text-3">{entry.label}</p>
                  <p className="text-lg font-semibold text-text">{entry.latestDate ?? "—"}</p>
                  <p className={`text-xs ${freshnessTone(entry)}`}>{formatLag(entry.lagDays)}</p>
                </div>
              ))}
            </div>
          </div>

          {data.lastRun ? (
            <div>
              <h3 className="text-sm font-medium text-text">Last attempt stages</h3>
              <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {data.lastRun.stages.map((stage) => (
                  <div key={stage.key} className="rounded-lg border border-border bg-bg p-3">
                    <p className="text-xs text-text-3">{stage.label}</p>
                    <p className="text-sm font-medium text-text">{stage.status}</p>
                    <p className="text-xs text-text-2">
                      {stage.rowCount === null ? "no rows" : `${stage.rowCount} rows`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {data.lastRun?.errorMessage ? (
            <div className="rounded-lg border border-border bg-bg p-3">
              <p className="text-xs text-text-3">Failure detail</p>
              <p className="text-sm text-neg">{data.lastRun.errorMessage}</p>
            </div>
          ) : null}

          <p className="text-xs text-text-3">
            {data.alertsConfigured ? "External alerts are configured." : "External alerts are not configured."} Run history is kept
            for {data.retentionDays} days.
            {data.activeLeaseExpiresAt ? ` A run currently holds the lease until ${formatTimestamp(data.activeLeaseExpiresAt)}.` : ""}
          </p>
        </div>
      ) : null}
    </section>
  );
}

export function SchedulerStatusPanel() {
  const [data, setData] = useState<SchedulerStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStatus() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/scheduler/status", { cache: "no-store" });
        if (!response.ok) {
          setError("Unable to load scheduler status.");
          return;
        }
        const payload = (await response.json()) as { data: SchedulerStatusResponse };
        setData(payload.data);
      } catch {
        setError("Unable to load scheduler status.");
      } finally {
        setLoading(false);
      }
    }

    void loadStatus();
  }, []);

  return <SchedulerStatusBody data={data} loading={loading} error={error} />;
}
