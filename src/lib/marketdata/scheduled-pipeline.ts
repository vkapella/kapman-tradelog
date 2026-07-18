import { randomUUID } from "node:crypto";
import { backfillLotExcursions, type BackfillLotExcursionsInput, type BackfillLotExcursionsSummary } from "@/lib/analysis/backfill-lot-excursions";
import { backfillValueSnapshots, type BackfillValueSnapshotsInput, type BackfillValueSnapshotsSummary } from "@/lib/analysis/backfill-value-snapshots";
import { ingestEquityMarks, type IngestEquityMarksInput, type IngestEquityMarksSummary } from "@/lib/marketdata/ingest-equity-marks";
import { ingestOptionMarks, type IngestOptionMarksInput, type IngestOptionMarksSummary } from "@/lib/marketdata/ingest-option-marks";
import { PrismaScheduledPipelineStore, type ScheduledPipelineProgress, type ScheduledPipelineStore } from "@/lib/marketdata/scheduled-pipeline-store";

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
  logger?: LoggerLike;
  owner?: string;
  ingestEquity?: (input: IngestEquityMarksInput) => Promise<IngestEquityMarksSummary>;
  ingestOptions?: (input: IngestOptionMarksInput) => Promise<IngestOptionMarksSummary>;
  backfillValues?: (input: BackfillValueSnapshotsInput) => Promise<BackfillValueSnapshotsSummary>;
  backfillExcursions?: (input: BackfillLotExcursionsInput) => Promise<BackfillLotExcursionsSummary>;
}

export interface ScheduledMarketDataPipelineSummary {
  status: "SUCCEEDED" | "NOOP" | "SKIPPED_LOCKED";
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
  const logger = input.logger ?? console;
  const owner = input.owner ?? randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + leaseMinutes * 60 * 1000);

  const acquired = await store.acquireLease(owner, now, leaseExpiresAt);
  if (!acquired) {
    logEvent(logger, "skipped_locked", { owner, eligibleEndDate: dateKey(eligibleEndDate) });
    return {
      status: "SKIPPED_LOCKED",
      eligibleEndDate: dateKey(eligibleEndDate),
      derivedStartDate: null,
      commonMarkDate: null,
      equity: null,
      options: null,
      values: null,
      excursions: null,
    };
  }

  try {
    const initialProgress = await store.loadProgress();
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
      logEvent(logger, "noop", {
        commonMarkDate: commonMarkDate ? dateKey(commonMarkDate) : null,
      });
      return {
        status: "NOOP",
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
    if (!finalProgress.latestValueSnapshotDate || finalProgress.latestValueSnapshotDate.getTime() < commonMarkDate.getTime()) {
      throw new Error(`Account-value snapshots did not reach common mark date ${dateKey(commonMarkDate)}.`);
    }

    logEvent(logger, "succeeded", {
      commonMarkDate: dateKey(commonMarkDate),
      unpricedPositionCount: values.unpricedPositionCount,
      unpricedExcursionDays: excursions.unpricedDays,
    });

    return {
      status: "SUCCEEDED",
      eligibleEndDate: dateKey(eligibleEndDate),
      derivedStartDate: dateKey(derivedStartDate),
      commonMarkDate: dateKey(commonMarkDate),
      equity,
      options,
      values,
      excursions,
    };
  } catch (error) {
    logger.warn(JSON.stringify({
      component: "scheduled-market-data",
      event: "failed",
      error: sanitizePipelineError(error),
    }));
    throw error;
  } finally {
    await store.releaseLease(owner);
  }
}
