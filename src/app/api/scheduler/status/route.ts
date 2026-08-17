import { detailResponse } from "@/lib/api/responses";
import {
  DEFAULT_FRESHNESS_LAG_DAYS,
  resolveAlertConfig,
} from "@/lib/marketdata/pipeline-alerts";
import {
  DEFAULT_RUN_RETENTION_DAYS,
  PipelineRunStatus,
  PrismaPipelineRunStore,
} from "@/lib/marketdata/pipeline-run-store";
import {
  MARKET_DATA_PIPELINE_JOB_NAME,
  PrismaScheduledPipelineStore,
} from "@/lib/marketdata/scheduled-pipeline-store";
import {
  buildFreshnessRecords,
  resolveSchedulerHealth,
  toSchedulerRunRecord,
} from "@/lib/marketdata/scheduler-status";
import type { SchedulerStatusResponse } from "@/types/api";

// Always query the live database at request time; never statically prerender
// this handler at build (no DB is available then). Required because this GET
// takes no Request argument, which would otherwise make it prerenderable.
export const dynamic = "force-dynamic";

// Operational status is account-independent: it reports pipeline health for the
// whole install and never takes an account filter.
export async function GET() {
  const now = new Date();
  const alertConfig = resolveAlertConfig();
  const toleranceDays = alertConfig?.freshnessLagDays ?? DEFAULT_FRESHNESS_LAG_DAYS;

  const runStore = new PrismaPipelineRunStore();
  const pipelineStore = new PrismaScheduledPipelineStore();

  const [lastRunRow, lastSuccessRow, progress, activeLease] = await Promise.all([
    runStore.latestRun(MARKET_DATA_PIPELINE_JOB_NAME),
    runStore.latestRunWithStatus(MARKET_DATA_PIPELINE_JOB_NAME, PipelineRunStatus.SUCCEEDED),
    pipelineStore.loadProgress(),
    pipelineStore.loadActiveLease(now),
  ]);

  const freshness = buildFreshnessRecords(
    {
      equityMarks: progress.latestEquityMarkDate,
      optionMarks: progress.latestOptionMarkDate,
      accountValues: progress.latestValueSnapshotDate,
    },
    now,
    toleranceDays,
  );

  const lastRun = lastRunRow ? toSchedulerRunRecord(lastRunRow) : null;

  const payload: SchedulerStatusResponse = {
    jobName: MARKET_DATA_PIPELINE_JOB_NAME,
    checkedAt: now.toISOString(),
    health: resolveSchedulerHealth(lastRun, freshness),
    lastRun,
    lastSuccessfulRun: lastSuccessRow ? toSchedulerRunRecord(lastSuccessRow) : null,
    freshness,
    freshnessToleranceDays: toleranceDays,
    retentionDays: DEFAULT_RUN_RETENTION_DAYS,
    alertsConfigured: alertConfig !== null,
    activeLeaseExpiresAt: activeLease ? activeLease.expiresAt.toISOString() : null,
  };

  return detailResponse(payload);
}
