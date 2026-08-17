import type { ScheduledPipelineRun } from "@prisma/client";
import { lagInDays } from "@/lib/marketdata/pipeline-alerts";
import type {
  SchedulerFreshnessRecord,
  SchedulerFreshnessState,
  SchedulerHealth,
  SchedulerRunRecord,
  SchedulerSourceKey,
  SchedulerStageSummary,
} from "@/types/api";

const STAGE_LABELS: Array<{ key: SchedulerStageSummary["key"]; label: string }> = [
  { key: "equity", label: "Equity marks" },
  { key: "option", label: "Option marks" },
  { key: "values", label: "Account values" },
  { key: "excursion", label: "Lot excursions" },
];

const SOURCE_LABELS: Record<SchedulerSourceKey, string> = {
  equityMarks: "Equity marks",
  optionMarks: "Option marks",
  accountValues: "Account values",
};

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function toSchedulerRunRecord(row: ScheduledPipelineRun): SchedulerRunRecord {
  const stageValues: Record<SchedulerStageSummary["key"], { status: SchedulerStageSummary["status"]; rowCount: number | null }> = {
    equity: { status: row.equityStatus, rowCount: row.equityRowCount },
    option: { status: row.optionStatus, rowCount: row.optionRowCount },
    values: { status: row.valuesStatus, rowCount: row.valuesRowCount },
    excursion: { status: row.excursionStatus, rowCount: row.excursionRowCount },
  };

  return {
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: toIso(row.finishedAt),
    durationMs: row.durationMs,
    requestedStartDate: toIsoDate(row.requestedStartDate),
    requestedEndDate: toIsoDate(row.requestedEndDate),
    effectiveStartDate: toIsoDate(row.effectiveStartDate),
    effectiveEndDate: toIsoDate(row.effectiveEndDate),
    eligibleEndDate: toIsoDate(row.eligibleEndDate),
    commonMarkDate: toIsoDate(row.commonMarkDate),
    stages: STAGE_LABELS.map(({ key, label }) => ({
      key,
      label,
      status: stageValues[key].status,
      rowCount: stageValues[key].rowCount,
    })),
    latestEquityMarkDate: toIsoDate(row.latestEquityMarkDate),
    latestOptionMarkDate: toIsoDate(row.latestOptionMarkDate),
    latestValueSnapshotDate: toIsoDate(row.latestValueSnapshotDate),
    unpricedPositionCount: row.unpricedPositionCount,
    unpricedExcursionDays: row.unpricedExcursionDays,
    errorMessage: row.errorMessage,
  };
}

export function toFreshnessState(latest: Date | null, now: Date, toleranceDays: number): SchedulerFreshnessState {
  if (!latest) {
    return "MISSING";
  }
  const lag = lagInDays(latest, now);
  return lag !== null && lag > toleranceDays ? "STALE" : "CURRENT";
}

export function buildFreshnessRecords(
  sources: Record<SchedulerSourceKey, Date | null>,
  now: Date,
  toleranceDays: number,
): SchedulerFreshnessRecord[] {
  return (Object.keys(SOURCE_LABELS) as SchedulerSourceKey[]).map((key) => ({
    key,
    label: SOURCE_LABELS[key],
    latestDate: toIsoDate(sources[key]),
    lagDays: lagInDays(sources[key], now),
    state: toFreshnessState(sources[key], now, toleranceDays),
  }));
}

/**
 * Collapse run outcome and data freshness into one operator-facing verdict.
 * Stale data outranks a green run: a pipeline that stops firing altogether
 * leaves a successful last run behind, which is the failure mode this reports.
 */
export function resolveSchedulerHealth(
  lastRun: { status: SchedulerRunRecord["status"] } | null,
  freshness: SchedulerFreshnessRecord[],
): SchedulerHealth {
  if (!lastRun) {
    return "NEVER_RUN";
  }
  if (freshness.some((entry) => entry.state !== "CURRENT")) {
    return "STALE";
  }
  if (lastRun.status === "FAILED" || lastRun.status === "ABANDONED") {
    return "FAILED";
  }
  if (lastRun.status === "RUNNING") {
    return "RUNNING";
  }
  return "HEALTHY";
}
