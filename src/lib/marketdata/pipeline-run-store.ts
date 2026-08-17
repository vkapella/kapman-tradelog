import {
  PipelineRunStatus,
  PipelineRunTrigger,
  PipelineStageStatus,
  type Prisma,
  type PrismaClient,
  type ScheduledPipelineRun,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export const DEFAULT_RUN_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/// Terminal statuses a RUNNING row can never return to on its own.
const TERMINAL_STATUSES: PipelineRunStatus[] = [
  PipelineRunStatus.SUCCEEDED,
  PipelineRunStatus.NOOP,
  PipelineRunStatus.FAILED,
  PipelineRunStatus.SKIPPED_LOCKED,
  PipelineRunStatus.ABANDONED,
];

export interface PipelineStageResult {
  status: PipelineStageStatus;
  rowCount: number | null;
}

export interface StartPipelineRunInput {
  jobName: string;
  trigger: PipelineRunTrigger;
  leaseOwner: string;
  leaseExpiresAt: Date | null;
  startedAt: Date;
  requestedStartDate?: Date | null;
  requestedEndDate?: Date | null;
  eligibleEndDate?: Date | null;
}

export interface FinalizePipelineRunInput {
  runId: string;
  status: PipelineRunStatus;
  finishedAt: Date;
  effectiveStartDate?: Date | null;
  effectiveEndDate?: Date | null;
  commonMarkDate?: Date | null;
  equity?: PipelineStageResult;
  option?: PipelineStageResult;
  values?: PipelineStageResult;
  excursion?: PipelineStageResult;
  latestEquityMarkDate?: Date | null;
  latestOptionMarkDate?: Date | null;
  latestValueSnapshotDate?: Date | null;
  unpricedPositionCount?: number | null;
  unpricedExcursionDays?: number | null;
  errorMessage?: string | null;
}

export interface ListPipelineRunsInput {
  jobName: string;
  page: number;
  pageSize: number;
}

export interface ListPipelineRunsResult {
  rows: ScheduledPipelineRun[];
  total: number;
}

export interface PipelineRunStore {
  startRun(input: StartPipelineRunInput): Promise<string>;
  finalizeRun(input: FinalizePipelineRunInput): Promise<void>;
  recoverAbandonedRuns(jobName: string, now: Date): Promise<number>;
  pruneRuns(jobName: string, now: Date, retentionDays: number): Promise<number>;
  latestRun(jobName: string): Promise<ScheduledPipelineRun | null>;
  latestRunWithStatus(jobName: string, status: PipelineRunStatus): Promise<ScheduledPipelineRun | null>;
  listRuns(input: ListPipelineRunsInput): Promise<ListPipelineRunsResult>;
  countConsecutiveLocked(jobName: string): Promise<number>;
}

/**
 * Count the unbroken streak of lock-outs at the head of the history. Anything
 * other than SKIPPED_LOCKED ends the streak, so a single successful run clears it.
 */
export function countLeadingLocked(statuses: PipelineRunStatus[]): number {
  let count = 0;
  for (const status of statuses) {
    if (status !== PipelineRunStatus.SKIPPED_LOCKED) {
      break;
    }
    count += 1;
  }
  return count;
}

/**
 * Resolve a stage result from an orchestration summary. A stage that never ran
 * is SKIPPED rather than PENDING, so a finalized row never keeps a start-time
 * placeholder.
 */
export function stageResult(summary: unknown, rowCount?: number | null): PipelineStageResult {
  if (!summary) {
    return { status: PipelineStageStatus.SKIPPED, rowCount: null };
  }
  if (rowCount !== undefined) {
    return { status: PipelineStageStatus.SUCCEEDED, rowCount };
  }
  // Ingestion summaries report their own upsert count; backfills pass one in.
  const inferred = (summary as { rowsUpserted?: unknown }).rowsUpserted;
  return {
    status: PipelineStageStatus.SUCCEEDED,
    rowCount: typeof inferred === "number" ? inferred : null,
  };
}

/**
 * A RUNNING row whose lease has expired belongs to a process that died without
 * finalizing. `leaseExpiresAt: null` falls back to the retention-independent
 * grace window so a row written before a crash still resolves.
 */
export function isAbandonedRun(run: Pick<ScheduledPipelineRun, "status" | "leaseExpiresAt" | "startedAt">, now: Date, graceMs: number): boolean {
  if (run.status !== PipelineRunStatus.RUNNING) {
    return false;
  }
  const deadline = run.leaseExpiresAt ?? new Date(run.startedAt.getTime() + graceMs);
  return deadline.getTime() <= now.getTime();
}

export class PrismaPipelineRunStore implements PipelineRunStore {
  constructor(
    private readonly prismaClient: Pick<PrismaClient, "scheduledPipelineRun"> = prisma,
    private readonly abandonedGraceMs: number = 6 * 60 * 60 * 1000,
  ) {}

  async startRun(input: StartPipelineRunInput): Promise<string> {
    const created = await this.prismaClient.scheduledPipelineRun.create({
      data: {
        jobName: input.jobName,
        trigger: input.trigger,
        status: PipelineRunStatus.RUNNING,
        leaseOwner: input.leaseOwner,
        leaseExpiresAt: input.leaseExpiresAt,
        startedAt: input.startedAt,
        requestedStartDate: input.requestedStartDate ?? null,
        requestedEndDate: input.requestedEndDate ?? null,
        eligibleEndDate: input.eligibleEndDate ?? null,
      },
      select: { id: true },
    });

    return created.id;
  }

  async finalizeRun(input: FinalizePipelineRunInput): Promise<void> {
    const existing = await this.prismaClient.scheduledPipelineRun.findUnique({
      where: { id: input.runId },
      select: { startedAt: true },
    });

    const data: Prisma.ScheduledPipelineRunUpdateInput = {
      status: input.status,
      finishedAt: input.finishedAt,
      durationMs: existing ? input.finishedAt.getTime() - existing.startedAt.getTime() : null,
      effectiveStartDate: input.effectiveStartDate ?? null,
      effectiveEndDate: input.effectiveEndDate ?? null,
      commonMarkDate: input.commonMarkDate ?? null,
      latestEquityMarkDate: input.latestEquityMarkDate ?? null,
      latestOptionMarkDate: input.latestOptionMarkDate ?? null,
      latestValueSnapshotDate: input.latestValueSnapshotDate ?? null,
      unpricedPositionCount: input.unpricedPositionCount ?? null,
      unpricedExcursionDays: input.unpricedExcursionDays ?? null,
      errorMessage: input.errorMessage ?? null,
    };

    if (input.equity) {
      data.equityStatus = input.equity.status;
      data.equityRowCount = input.equity.rowCount;
    }
    if (input.option) {
      data.optionStatus = input.option.status;
      data.optionRowCount = input.option.rowCount;
    }
    if (input.values) {
      data.valuesStatus = input.values.status;
      data.valuesRowCount = input.values.rowCount;
    }
    if (input.excursion) {
      data.excursionStatus = input.excursion.status;
      data.excursionRowCount = input.excursion.rowCount;
    }

    await this.prismaClient.scheduledPipelineRun.update({
      where: { id: input.runId },
      data,
    });
  }

  async recoverAbandonedRuns(jobName: string, now: Date): Promise<number> {
    const graceDeadline = new Date(now.getTime() - this.abandonedGraceMs);

    const recovered = await this.prismaClient.scheduledPipelineRun.updateMany({
      where: {
        jobName,
        status: PipelineRunStatus.RUNNING,
        OR: [
          { leaseExpiresAt: { lte: now } },
          { leaseExpiresAt: null, startedAt: { lte: graceDeadline } },
        ],
      },
      data: {
        status: PipelineRunStatus.ABANDONED,
        finishedAt: now,
        errorMessage: "Run abandoned: process ended without finalizing before the lease expired.",
      },
    });

    return recovered.count;
  }

  async pruneRuns(jobName: string, now: Date, retentionDays: number): Promise<number> {
    if (!Number.isSafeInteger(retentionDays) || retentionDays <= 0) {
      return 0;
    }

    const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
    const pruned = await this.prismaClient.scheduledPipelineRun.deleteMany({
      where: {
        jobName,
        startedAt: { lt: cutoff },
        status: { in: TERMINAL_STATUSES },
      },
    });

    return pruned.count;
  }

  async latestRun(jobName: string): Promise<ScheduledPipelineRun | null> {
    return this.prismaClient.scheduledPipelineRun.findFirst({
      where: { jobName },
      orderBy: { startedAt: "desc" },
    });
  }

  async latestRunWithStatus(jobName: string, status: PipelineRunStatus): Promise<ScheduledPipelineRun | null> {
    return this.prismaClient.scheduledPipelineRun.findFirst({
      where: { jobName, status },
      orderBy: { startedAt: "desc" },
    });
  }

  async listRuns(input: ListPipelineRunsInput): Promise<ListPipelineRunsResult> {
    const [rows, total] = await Promise.all([
      this.prismaClient.scheduledPipelineRun.findMany({
        where: { jobName: input.jobName },
        orderBy: { startedAt: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prismaClient.scheduledPipelineRun.count({ where: { jobName: input.jobName } }),
    ]);

    return { rows, total };
  }

  async countConsecutiveLocked(jobName: string): Promise<number> {
    const recent = await this.prismaClient.scheduledPipelineRun.findMany({
      where: { jobName, status: { not: PipelineRunStatus.RUNNING } },
      orderBy: { startedAt: "desc" },
      take: 50,
      select: { status: true },
    });

    return countLeadingLocked(recent.map((row) => row.status));
  }
}

export { PipelineRunStatus, PipelineRunTrigger, PipelineStageStatus };
