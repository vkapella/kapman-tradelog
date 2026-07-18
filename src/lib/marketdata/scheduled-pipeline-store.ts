import { MarkAssetClass, Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export const MARKET_DATA_PIPELINE_JOB_NAME = "daily-market-data";

export interface ScheduledPipelineProgress {
  hasEquityExecutions: boolean;
  hasOptionExecutions: boolean;
  earliestEquityMarkDate: Date | null;
  earliestOptionMarkDate: Date | null;
  latestEquityMarkDate: Date | null;
  latestOptionMarkDate: Date | null;
  latestValueSnapshotDate: Date | null;
}

export interface ScheduledPipelineLease {
  owner: string;
  expiresAt: Date;
}

export interface ScheduledPipelineStore {
  acquireLease(owner: string, now: Date, expiresAt: Date): Promise<boolean>;
  releaseLease(owner: string): Promise<void>;
  loadProgress(): Promise<ScheduledPipelineProgress>;
  loadActiveLease(now: Date): Promise<ScheduledPipelineLease | null>;
}

interface AccountSnapshotProgressRow {
  accountId: string;
  _max: {
    snapshotDate: Date | null;
  };
}

export function resolveLatestCompleteValueSnapshotDate(
  activeAccountIds: string[],
  rows: AccountSnapshotProgressRow[],
): Date | null {
  if (activeAccountIds.length === 0) {
    return null;
  }

  const latestByAccount = new Map(rows.map((row) => [row.accountId, row._max.snapshotDate]));
  let latestCompleteDate: Date | null = null;

  for (const accountId of activeAccountIds) {
    const accountLatestDate = latestByAccount.get(accountId) ?? null;
    if (!accountLatestDate) {
      return null;
    }
    if (!latestCompleteDate || accountLatestDate.getTime() < latestCompleteDate.getTime()) {
      latestCompleteDate = accountLatestDate;
    }
  }

  return latestCompleteDate;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export class PrismaScheduledPipelineStore implements ScheduledPipelineStore {
  constructor(private readonly prismaClient: PrismaClient = prisma) {}

  async acquireLease(owner: string, now: Date, expiresAt: Date): Promise<boolean> {
    try {
      await this.prismaClient.scheduledJobLease.create({
        data: {
          jobName: MARKET_DATA_PIPELINE_JOB_NAME,
          leaseOwner: owner,
          leaseExpiresAt: expiresAt,
        },
      });
      return true;
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }

    const claimed = await this.prismaClient.scheduledJobLease.updateMany({
      where: {
        jobName: MARKET_DATA_PIPELINE_JOB_NAME,
        leaseExpiresAt: { lte: now },
      },
      data: {
        leaseOwner: owner,
        leaseExpiresAt: expiresAt,
      },
    });

    return claimed.count === 1;
  }

  async releaseLease(owner: string): Promise<void> {
    await this.prismaClient.scheduledJobLease.deleteMany({
      where: {
        jobName: MARKET_DATA_PIPELINE_JOB_NAME,
        leaseOwner: owner,
      },
    });
  }

  async loadProgress(): Promise<ScheduledPipelineProgress> {
    const [
      equityExecution,
      optionExecution,
      activeAccounts,
      earliestEquityMark,
      earliestOptionMark,
      latestEquityMark,
      latestOptionMark,
    ] = await Promise.all([
      this.prismaClient.execution.findFirst({
        where: { assetClass: "EQUITY" },
        select: { id: true },
      }),
      this.prismaClient.execution.findFirst({
        where: { assetClass: "OPTION" },
        select: { id: true },
      }),
      this.prismaClient.account.findMany({
        where: {
          OR: [
            { executions: { some: {} } },
            { cashEvents: { some: {} } },
            { snapshots: { some: {} } },
          ],
        },
        select: { id: true },
        orderBy: { id: "asc" },
      }),
      this.prismaClient.historicalMark.findFirst({
        where: { assetClass: MarkAssetClass.EQUITY },
        orderBy: { markDate: "asc" },
        select: { markDate: true },
      }),
      this.prismaClient.historicalMark.findFirst({
        where: { assetClass: MarkAssetClass.OPTION },
        orderBy: { markDate: "asc" },
        select: { markDate: true },
      }),
      this.prismaClient.historicalMark.findFirst({
        where: { assetClass: MarkAssetClass.EQUITY },
        orderBy: { markDate: "desc" },
        select: { markDate: true },
      }),
      this.prismaClient.historicalMark.findFirst({
        where: { assetClass: MarkAssetClass.OPTION },
        orderBy: { markDate: "desc" },
        select: { markDate: true },
      }),
    ]);

    const activeAccountIds = activeAccounts.map((account) => account.id);
    const valueSnapshotProgress = activeAccountIds.length === 0
      ? []
      : await this.prismaClient.accountValueSnapshot.groupBy({
          by: ["accountId"],
          where: { accountId: { in: activeAccountIds } },
          _max: { snapshotDate: true },
          orderBy: { accountId: "asc" },
        });

    return {
      hasEquityExecutions: equityExecution !== null,
      hasOptionExecutions: optionExecution !== null,
      earliestEquityMarkDate: earliestEquityMark?.markDate ?? null,
      earliestOptionMarkDate: earliestOptionMark?.markDate ?? null,
      latestEquityMarkDate: latestEquityMark?.markDate ?? null,
      latestOptionMarkDate: latestOptionMark?.markDate ?? null,
      latestValueSnapshotDate: resolveLatestCompleteValueSnapshotDate(activeAccountIds, valueSnapshotProgress),
    };
  }

  async loadActiveLease(now: Date): Promise<ScheduledPipelineLease | null> {
    const lease = await this.prismaClient.scheduledJobLease.findFirst({
      where: {
        jobName: MARKET_DATA_PIPELINE_JOB_NAME,
        leaseExpiresAt: { gt: now },
      },
      select: {
        leaseOwner: true,
        leaseExpiresAt: true,
      },
    });

    return lease
      ? {
          owner: lease.leaseOwner,
          expiresAt: lease.leaseExpiresAt,
        }
      : null;
  }
}
