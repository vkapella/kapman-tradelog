import { NextResponse } from "next/server";
import { parseAccountIds, parseDateRangeParams, toEndOfDayUtcIso } from "@/lib/api/account-scope";
import { prisma } from "@/lib/db/prisma";
import {
  parsePositionSnapshotAccountValuesJson,
  parsePositionSnapshotPositionsJson,
  resolvePositionSnapshotAccountIds,
  serializePositionSnapshotAccountIds,
  toPositionSnapshotMoneyString,
} from "@/lib/positions/position-snapshot";
import { loadAccountBalanceContext } from "@/lib/accounts/account-balance-context";
import { resolveLiveAccountValue, sumCompleteReconstructedNlv } from "@/lib/positions/live-account-value";
import type { PositionSnapshotResponse, PositionSnapshotResponseData } from "@/types/api";

type SnapshotRow = {
  id: string;
  snapshotAt: Date;
  status: "PENDING" | "COMPLETE" | "FAILED";
  errorMessage: string | null;
  accountIds: string;
  positionsJson: string;
  accountValuesJson: string;
  unrealizedPnl: { toString(): string } | null;
  realizedPnl: { toString(): string } | null;
  cashAdjustments: { toString(): string } | null;
  manualAdjustments: { toString(): string } | null;
  currentNlv: { toString(): string } | null;
  startingCapital: { toString(): string } | null;
  totalGain: { toString(): string } | null;
  unexplainedDelta: { toString(): string } | null;
};

async function mapSnapshotRow(row: SnapshotRow): Promise<PositionSnapshotResponseData> {
  const positions = parsePositionSnapshotPositionsJson(row.positionsJson);
  let accountValues = parsePositionSnapshotAccountValuesJson(row.accountValuesJson);

  if (row.status === "COMPLETE" && accountValues.length === 0 && row.accountIds) {
    let accountIds: string[] = [];
    try {
      const parsed = JSON.parse(row.accountIds) as unknown;
      accountIds = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      accountIds = [];
    }

    const [accounts, balances] = await Promise.all([
      prisma.account.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, accountId: true },
        orderBy: { id: "asc" },
      }),
      loadAccountBalanceContext(accountIds),
    ]);
    accountValues = accounts.map((account) => resolveLiveAccountValue({
      accountId: account.id,
      accountExternalId: account.accountId,
      positions,
      balance: balances.find((entry) => entry.accountExternalId === account.accountId) ?? null,
      marksAsOf: row.snapshotAt,
    }));
  }

  const resolvedCurrentNlv = accountValues.length > 0
    ? sumCompleteReconstructedNlv(accountValues)
    : row.currentNlv === null ? null : Number(row.currentNlv);
  return {
    id: row.id,
    snapshotAt: row.snapshotAt.toISOString(),
    status: row.status,
    errorMessage: row.errorMessage ?? undefined,
    positions,
    accountValues,
    unrealizedPnl: toPositionSnapshotMoneyString(row.unrealizedPnl),
    realizedPnl: toPositionSnapshotMoneyString(row.realizedPnl),
    cashAdjustments: toPositionSnapshotMoneyString(row.cashAdjustments),
    manualAdjustments: toPositionSnapshotMoneyString(row.manualAdjustments),
    currentNlv: resolvedCurrentNlv === null ? null : resolvedCurrentNlv.toFixed(2),
    startingCapital: toPositionSnapshotMoneyString(row.startingCapital),
    totalGain: toPositionSnapshotMoneyString(row.totalGain),
    unexplainedDelta: toPositionSnapshotMoneyString(row.unexplainedDelta),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const snapshotId = url.searchParams.get("snapshotId");
  const { startDate, endDate } = parseDateRangeParams(url.searchParams);

  let snapshot: SnapshotRow | null;
  if (snapshotId) {
    snapshot = await prisma.positionSnapshot.findUnique({
      where: { id: snapshotId },
      select: {
        id: true,
        snapshotAt: true,
        status: true,
        errorMessage: true,
        accountIds: true,
        positionsJson: true,
        accountValuesJson: true,
        unrealizedPnl: true,
        realizedPnl: true,
        cashAdjustments: true,
        manualAdjustments: true,
        currentNlv: true,
        startingCapital: true,
        totalGain: true,
        unexplainedDelta: true,
      },
    });
  } else {
    const requestedAccountIds = parseAccountIds(url.searchParams.get("accountIds"));
    const resolvedAccountIds = await resolvePositionSnapshotAccountIds(requestedAccountIds);
    const accountIdsJson = serializePositionSnapshotAccountIds(resolvedAccountIds);

    const dateScope =
      startDate || endDate
        ? {
            snapshotAt: {
              ...(startDate ? { gte: new Date(startDate) } : {}),
              ...(endDate ? { lte: toEndOfDayUtcIso(endDate) } : {}),
            },
          }
        : undefined;
    snapshot = await prisma.positionSnapshot.findFirst({
      where: dateScope ? { AND: [{ accountIds: accountIdsJson }, dateScope] } : { accountIds: accountIdsJson },
      orderBy: [{ snapshotAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        snapshotAt: true,
        status: true,
        errorMessage: true,
        accountIds: true,
        positionsJson: true,
        accountValuesJson: true,
        unrealizedPnl: true,
        realizedPnl: true,
        cashAdjustments: true,
        manualAdjustments: true,
        currentNlv: true,
        startingCapital: true,
        totalGain: true,
        unexplainedDelta: true,
      },
    });
  }

  if (!snapshot) {
    const payload: PositionSnapshotResponse = {
      data: null,
      meta: {
        snapshotExists: false,
      },
    };
    return NextResponse.json(payload);
  }

  const snapshotAge = Math.max(0, Math.floor((Date.now() - snapshot.snapshotAt.getTime()) / 1000));
  const payload: PositionSnapshotResponse = {
    data: await mapSnapshotRow(snapshot),
    meta: {
      snapshotExists: true,
      snapshotAge,
    },
  };

  return NextResponse.json(payload);
}
