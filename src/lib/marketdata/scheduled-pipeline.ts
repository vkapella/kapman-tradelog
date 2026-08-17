import { randomUUID } from "node:crypto";
import { backfillLotExcursions, type BackfillLotExcursionsInput, type BackfillLotExcursionsSummary } from "@/lib/analysis/backfill-lot-excursions";
import { backfillValueSnapshots, type BackfillValueSnapshotsInput, type BackfillValueSnapshotsSummary } from "@/lib/analysis/backfill-value-snapshots";
import { ingestEquityMarks, type IngestEquityMarksInput, type IngestEquityMarksSummary } from "@/lib/marketdata/ingest-equity-marks";
import { ingestOptionMarks, type IngestOptionMarksInput, type IngestOptionMarksSummary } from "@/lib/marketdata/ingest-option-marks";
import { notifyPipelineOutcome, type NotifyPipelineOutcomeInput } from "@/lib/marketdata/pipeline-alerts";
import {
  DEFAULT_RUN_RETENTION_DAYS,
  PipelineRunStatus,
  PipelineRunTrigger,
  PrismaPipelineRunStore,
  stageResult,
  type PipelineRunStore,
} from "@/lib/marketdata/pipeline-run-store";
import {
  MARKET_DATA_PIPELINE_JOB_NAME,
  PrismaScheduledPipelineStore,
  type ScheduledPipelineProgress,
  type ScheduledPipelineStore,
} from "@/lib/marketdata/scheduled-pipeline-store";

interface LoggerLike {
  log(message: string): void;
  warn(message: string): void;
}

interface DateRange {
  startDate?: Date;
  endDate: Date;
}

export interface ScheduledMarketDataPipelineInput {
  now?: Date;
  publicationLagDays?: number;
  leaseMinutes?: number;
  startDate?: Date;
  endDate?: Date;
  store?: ScheduledPipelineStore;
  runStore?: PipelineRunStore;
  trigger?: PipelineRunTrigger;
  retentionDays?: number;
  notifyAlerts?: (input: NotifyPipelineOutcomeInput) => Promise<void>;
  logger?: LoggerLike;
  owner?: string;
  ingestEquity?: (input: IngestEquityMarksInput) => Promise<IngestEquityMarksSummary>;
  ingestOptions?: (input: IngestOptionMarksInput) => Promise<IngestOptionMarksSummary>;
  backfillValues?: (input: BackfillValueSnapshotsInput) => Promise<BackfillValueSnapshotsSummary>;
  backfillExcursions?: (input: BackfillLotExcursionsInput) => Promise<BackfillLotExcursionsSummary>;
}

export interface ScheduledMarketDataPipelineSummary {
  status: "SUCCEEDED" | "NOOP" | "SKIPPED_LOCKED";
  /// Durable run-history row for this attempt; null only when history is unavailable.
  runId: string | null;
  eligibleEndDate: string;
  derivedStartDate: string | null;
  commonMarkDate: string | null;
  equity: IngestEquityMarksSummary | null;
  options: IngestOptionMarksSummary | null;
  values: BackfillValueSnapshotsSummary | null;
  excursions: BackfillLotExcursionsSummary | null;
}

export const DEFAULT_PUBLICATION_LAG_DAYS = 2;
export const DEFAULT_PIPELINE_LEASE_MINUTES = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(startOfUtcDay(date).getTime() + days * DAY_MS);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function minDate(values: Array<Date | null | undefined>): Date | null {
  return values.reduce<Date | null>((result, value) => {
    if (!value) {
      return result;
    }
    return result === null || value.getTime() < result.getTime() ? value : result;
  }, null);
}

function maxEligibleEndDate(explicitEndDate: Date | undefined, eligibleEndDate: Date): Date {
  if (!explicitEndDate) {
    return eligibleEndDate;
  }
  const normalized = startOfUtcDay(explicitEndDate);
  return normalized.getTime() < eligibleEndDate.getTime() ? normalized : eligibleEndDate;
}

export function parsePositiveIntegerSetting(value: string | undefined, fallback: number, envName: string): number {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }

  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`Invalid ${envName}: expected a positive integer.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${envName}: expected a positive integer.`);
  }

  return parsed;
}

export function resolveEligibleEndDate(now: Date, publicationLagDays: number): Date {
  if (!Number.isSafeInteger(publicationLagDays) || publicationLagDays <= 0) {
    throw new Error("publicationLagDays must be a positive integer.");
  }
  return addUtcDays(now, publicationLagDays * -1);
}

export function resolveIncrementalRange(input: {
  latestDate: Date | null;
  eligibleEndDate: Date;
  explicitStartDate?: Date;
}): DateRange | null {
  const startDate = input.explicitStartDate
    ? startOfUtcDay(input.explicitStartDate)
    : input.latestDate
      ? addUtcDays(input.latestDate, 1)
      : undefined;

  if (startDate && startDate.getTime() > input.eligibleEndDate.getTime()) {
    return null;
  }

  return {
    startDate,
    endDate: input.eligibleEndDate,
  };
}

export function resolveCommonMarkDate(progress: ScheduledPipelineProgress): Date | null {
  const requiredDates: Date[] = [];
  if (progress.hasEquityExecutions) {
    if (!progress.latestEquityMarkDate) {
      return null;
    }
    requiredDates.push(progress.latestEquityMarkDate);
  }
  if (progress.hasOptionExecutions) {
    if (!progress.latestOptionMarkDate) {
      return null;
    }
    requiredDates.push(progress.latestOptionMarkDate);
  }
  return minDate(requiredDates);
}

function logEvent<T extends object>(logger: LoggerLike, event: string, details: T): void {
  logger.log(JSON.stringify({ component: "scheduled-market-data", event, ...details }));
}

export function sanitizePipelineError(
  error: unknown,
  env: Record<string, string | undefined> = process.env,
): string {
  let message = error instanceof Error ? error.message : String(error);
  const secretNames = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "POLYGON_API_KEY", "DATABASE_URL"];
  for (const secretName of secretNames) {
    const secretValue = env[secretName];
    if (secretValue && secretValue.length > 0) {
      message = message.split(secretValue).join("[REDACTED]");
    }
  }
  return message;
}

export async function runScheduledMarketDataPipeline(
  input: ScheduledMarketDataPipelineInput = {},
): Promise<ScheduledMarketDataPipelineSummary> {
  const now = input.now ?? new Date();
  const publicationLagDays = input.publicationLagDays ?? DEFAULT_PUBLICATION_LAG_DAYS;
  const leaseMinutes = input.leaseMinutes ?? DEFAULT_PIPELINE_LEASE_MINUTES;
  const eligibleEndDate = maxEligibleEndDate(input.endDate, resolveEligibleEndDate(now, publicationLagDays));
  const store = input.store ?? new PrismaScheduledPipelineStore();
  const runStore = input.runStore ?? new PrismaPipelineRunStore();
  const trigger = input.trigger ?? PipelineRunTrigger.SCHEDULED;
  const retentionDays = input.retentionDays ?? DEFAULT_RUN_RETENTION_DAYS;
  const notifyAlerts = input.notifyAlerts ?? notifyPipelineOutcome;
  const logger = input.logger ?? console;
  const owner = input.owner ?? randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + leaseMinutes * 60 * 1000);

  // Resolve rows stranded by a process that died mid-run before this attempt
  // reads or writes any history, so the recovery is visible in run history.
  const recoveredCount = await runStore.recoverAbandonedRuns(MARKET_DATA_PIPELINE_JOB_NAME, now);
  if (recoveredCount > 0) {
    logEvent(logger, "recovered_abandoned_runs", { count: recoveredCount });
  }

  // Freshness reported to alerts on the failure path, where no final progress read happens.
  let lastKnownProgress: ScheduledPipelineProgress | null = null;

  async function announce(
    runStatus: PipelineRunStatus,
    progressSnapshot: ScheduledPipelineProgress | null,
    extra: { errorMessage?: string | null; consecutiveLockedCount?: number } = {},
  ): Promise<void> {
    try {
      await notifyAlerts({
        jobName: MARKET_DATA_PIPELINE_JOB_NAME,
        now,
        runStatus,
        recoveredAbandonedCount: recoveredCount,
        freshness: {
          latestEquityMarkDate: progressSnapshot?.latestEquityMarkDate ?? null,
          latestOptionMarkDate: progressSnapshot?.latestOptionMarkDate ?? null,
          latestValueSnapshotDate: progressSnapshot?.latestValueSnapshotDate ?? null,
        },
        logger,
        ...extra,
      });
    } catch (error) {
      // Alerting is best-effort; a broken notifier must not fail a good run.
      logger.warn(JSON.stringify({
        component: "scheduled-market-data",
        event: "alert_dispatch_failed",
        error: sanitizePipelineError(error),
      }));
    }
  }

  const runBase = {
    jobName: MARKET_DATA_PIPELINE_JOB_NAME,
    trigger,
    leaseOwner: owner,
    startedAt: now,
    requestedStartDate: input.startDate ?? null,
    requestedEndDate: input.endDate ?? null,
    eligibleEndDate,
  };

  const acquired = await store.acquireLease(owner, now, leaseExpiresAt);
  if (!acquired) {
    // Contention is recorded so repeated lock-outs are visible and alertable.
    const lockedRunId = await runStore.startRun({ ...runBase, leaseExpiresAt: null });
    await runStore.finalizeRun({
      runId: lockedRunId,
      status: PipelineRunStatus.SKIPPED_LOCKED,
      finishedAt: now,
    });
    logEvent(logger, "skipped_locked", { owner, runId: lockedRunId, eligibleEndDate: dateKey(eligibleEndDate) });
    await announce(PipelineRunStatus.SKIPPED_LOCKED, null, {
      consecutiveLockedCount: await runStore.countConsecutiveLocked(MARKET_DATA_PIPELINE_JOB_NAME),
    });
    return {
      status: "SKIPPED_LOCKED",
      runId: lockedRunId,
      eligibleEndDate: dateKey(eligibleEndDate),
      derivedStartDate: null,
      commonMarkDate: null,
      equity: null,
      options: null,
      values: null,
      excursions: null,
    };
  }

  const runId = await runStore.startRun({ ...runBase, leaseExpiresAt });

  try {
    const initialProgress = await store.loadProgress();
    lastKnownProgress = initialProgress;
    const equityRange = initialProgress.hasEquityExecutions
      ? resolveIncrementalRange({ latestDate: initialProgress.latestEquityMarkDate, eligibleEndDate, explicitStartDate: input.startDate })
      : null;
    const optionRange = initialProgress.hasOptionExecutions
      ? resolveIncrementalRange({ latestDate: initialProgress.latestOptionMarkDate, eligibleEndDate, explicitStartDate: input.startDate })
      : null;

    logEvent(logger, "started", {
      owner,
      eligibleEndDate: dateKey(eligibleEndDate),
      equityStartDate: equityRange?.startDate ? dateKey(equityRange.startDate) : null,
      optionStartDate: optionRange?.startDate ? dateKey(optionRange.startDate) : null,
    });

    const equity = equityRange
      ? await (input.ingestEquity ?? ingestEquityMarks)({ ...equityRange, now, logger })
      : null;
    if (equity) {
      logEvent(logger, "equity_complete", equity);
    }

    const options = optionRange
      ? await (input.ingestOptions ?? ingestOptionMarks)({ ...optionRange, now, source: "s3", logger })
      : null;
    if (options) {
      logEvent(logger, "options_complete", {
        ...options,
        contractsMissing: options.contractsMissing.length,
      });
    }

    const refreshedProgress = await store.loadProgress();
    lastKnownProgress = refreshedProgress;
    const latestCommonMarkDate = resolveCommonMarkDate(refreshedProgress);
    if ((refreshedProgress.hasEquityExecutions || refreshedProgress.hasOptionExecutions) && latestCommonMarkDate === null) {
      throw new Error("Required historical marks are still unavailable after ingestion.");
    }
    const commonMarkDate = latestCommonMarkDate && latestCommonMarkDate.getTime() > eligibleEndDate.getTime()
      ? eligibleEndDate
      : latestCommonMarkDate;

    const earliestRequiredMarkDate = minDate([
      refreshedProgress.hasEquityExecutions ? refreshedProgress.earliestEquityMarkDate : null,
      refreshedProgress.hasOptionExecutions ? refreshedProgress.earliestOptionMarkDate : null,
    ]);
    const snapshotCatchupStart = commonMarkDate
      ? refreshedProgress.latestValueSnapshotDate
        ? refreshedProgress.latestValueSnapshotDate.getTime() < commonMarkDate.getTime()
          ? addUtcDays(refreshedProgress.latestValueSnapshotDate, 1)
          : null
        : earliestRequiredMarkDate
      : null;
    const derivedStartDate = minDate([
      equityRange?.startDate,
      optionRange?.startDate,
      equity ? new Date(`${equity.startDate}T00:00:00.000Z`) : null,
      options ? new Date(`${options.startDate}T00:00:00.000Z`) : null,
      snapshotCatchupStart,
    ]);

    if (!commonMarkDate || !derivedStartDate || derivedStartDate.getTime() > commonMarkDate.getTime()) {
      await runStore.finalizeRun({
        runId,
        status: PipelineRunStatus.NOOP,
        finishedAt: new Date(),
        commonMarkDate,
        equity: stageResult(equity),
        option: stageResult(options),
        values: stageResult(null),
        excursion: stageResult(null),
        latestEquityMarkDate: refreshedProgress.latestEquityMarkDate,
        latestOptionMarkDate: refreshedProgress.latestOptionMarkDate,
        latestValueSnapshotDate: refreshedProgress.latestValueSnapshotDate,
      });
      logEvent(logger, "noop", {
        runId,
        commonMarkDate: commonMarkDate ? dateKey(commonMarkDate) : null,
      });
      await announce(PipelineRunStatus.NOOP, refreshedProgress);
      return {
        status: "NOOP",
        runId,
        eligibleEndDate: dateKey(eligibleEndDate),
        derivedStartDate: null,
        commonMarkDate: commonMarkDate ? dateKey(commonMarkDate) : null,
        equity,
        options,
        values: null,
        excursions: null,
      };
    }

    const values = await (input.backfillValues ?? backfillValueSnapshots)({
      startDate: derivedStartDate,
      endDate: commonMarkDate,
      now,
      logger,
    });
    logEvent(logger, "values_complete", values);

    const excursions = await (input.backfillExcursions ?? backfillLotExcursions)({
      endDate: commonMarkDate,
      includeOpen: true,
      now: commonMarkDate,
      logger,
    });
    logEvent(logger, "excursions_complete", excursions);

    const finalProgress = await store.loadProgress();
    lastKnownProgress = finalProgress;
    if (!finalProgress.latestValueSnapshotDate || finalProgress.latestValueSnapshotDate.getTime() < commonMarkDate.getTime()) {
      throw new Error(`Account-value snapshots did not reach common mark date ${dateKey(commonMarkDate)}.`);
    }

    await runStore.finalizeRun({
      runId,
      status: PipelineRunStatus.SUCCEEDED,
      finishedAt: new Date(),
      effectiveStartDate: derivedStartDate,
      effectiveEndDate: commonMarkDate,
      commonMarkDate,
      equity: stageResult(equity),
      option: stageResult(options),
      values: stageResult(values, values.snapshotsUpserted),
      excursion: stageResult(excursions, excursions.excursionsUpserted),
      latestEquityMarkDate: finalProgress.latestEquityMarkDate,
      latestOptionMarkDate: finalProgress.latestOptionMarkDate,
      latestValueSnapshotDate: finalProgress.latestValueSnapshotDate,
      unpricedPositionCount: values.unpricedPositionCount,
      unpricedExcursionDays: excursions.unpricedDays,
    });

    logEvent(logger, "succeeded", {
      runId,
      commonMarkDate: dateKey(commonMarkDate),
      unpricedPositionCount: values.unpricedPositionCount,
      unpricedExcursionDays: excursions.unpricedDays,
    });
    await announce(PipelineRunStatus.SUCCEEDED, finalProgress);

    return {
      status: "SUCCEEDED",
      runId,
      eligibleEndDate: dateKey(eligibleEndDate),
      derivedStartDate: dateKey(derivedStartDate),
      commonMarkDate: dateKey(commonMarkDate),
      equity,
      options,
      values,
      excursions,
    };
  } catch (error) {
    const sanitized = sanitizePipelineError(error);
    await runStore.finalizeRun({
      runId,
      status: PipelineRunStatus.FAILED,
      finishedAt: new Date(),
      errorMessage: sanitized,
    });
    logger.warn(JSON.stringify({
      component: "scheduled-market-data",
      event: "failed",
      runId,
      error: sanitized,
    }));
    await announce(PipelineRunStatus.FAILED, lastKnownProgress, { errorMessage: sanitized });
    throw error;
  } finally {
    await store.releaseLease(owner);
    const prunedCount = await runStore.pruneRuns(MARKET_DATA_PIPELINE_JOB_NAME, now, retentionDays);
    if (prunedCount > 0) {
      logEvent(logger, "pruned_run_history", { count: prunedCount, retentionDays });
    }
  }
}
