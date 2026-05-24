import { Prisma } from "@prisma/client";
import { buildAccountIdWhere, buildAccountScopeWhere, parseAccountIds, parseDateRangeParams, toEndOfDayUtcIso } from "@/lib/api/account-scope";
import { detailResponse } from "@/lib/api/responses";
import { loadAccountBalanceContext } from "@/lib/accounts/account-balance-context";
import { getStartingCapitalSummary } from "@/lib/accounts/starting-capital";
import { prisma } from "@/lib/db/prisma";
import { computeMaxDrawdown } from "@/lib/overview/max-drawdown";
import { calculateReturnOnCapital, EXTERNAL_CAPITAL_ROW_TYPES, snapshotValue } from "@/lib/overview/return-on-capital";
import { serializePositionSnapshotAccountIds } from "@/lib/positions/position-snapshot";
import type { OverviewSummaryResponse } from "@/types/api";

function formatNullableMetric(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return value.toFixed(2);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const accountIds = parseAccountIds(url.searchParams.get("accountIds"));
  const { startDate, endDate } = parseDateRangeParams(url.searchParams);
  const startDateBound = startDate ? new Date(startDate) : null;
  const endDateBound = endDate ? toEndOfDayUtcIso(endDate) : null;
  const whereAccount = buildAccountScopeWhere(accountIds);
  const executionDateWhere = startDate || endDate
    ? {
        eventTimestamp: {
          ...(startDateBound ? { gte: startDateBound } : {}),
          ...(endDateBound ? { lte: endDateBound } : {}),
        },
      }
    : undefined;
  const matchedLotDateWhere = startDate || endDate
    ? {
        OR: [
          {
            closeExecution: {
              is: {
                tradeDate: {
                  ...(startDateBound ? { gte: startDateBound } : {}),
                  ...(endDateBound ? { lte: endDateBound } : {}),
                },
              },
            },
          },
          {
            AND: [
              { closeExecution: { is: null } },
              {
                openExecution: {
                  tradeDate: {
                    ...(startDateBound ? { gte: startDateBound } : {}),
                    ...(endDateBound ? { lte: endDateBound } : {}),
                  },
                },
              },
            ],
          },
        ],
      }
    : undefined;
  const setupDateWhere = startDate || endDate
    ? {
        createdAt: {
          ...(startDateBound ? { gte: startDateBound } : {}),
          ...(endDateBound ? { lte: endDateBound } : {}),
        },
      }
    : undefined;
  const snapshotDateWhere = startDate || endDate
    ? {
        snapshotDate: {
          ...(startDateBound ? { gte: startDateBound } : {}),
          ...(endDateBound ? { lte: endDateBound } : {}),
        },
      }
    : undefined;

  const scopedAccounts = await prisma.account.findMany({
    where: buildAccountIdWhere(accountIds) as Prisma.AccountWhereInput | undefined,
    select: { id: true, accountId: true },
    orderBy: { id: "asc" },
  });
  const internalAccountIds = scopedAccounts.map((account) => account.id);
  const accountExternalIdsByInternalId = new Map(scopedAccounts.map((account) => [account.id, account.accountId]));
  const positionSnapshotAccountIdsJson = serializePositionSnapshotAccountIds(internalAccountIds);

  const [
    executionCount,
    matchedLots,
    setupCount,
    imports,
    snapshotCount,
    snapshots,
    accountBalances,
    startingCapitalSummary,
    beginningSnapshotRows,
    endingSnapshotRows,
    capitalFlowRows,
    latestPositionSnapshot,
  ] = await Promise.all([
    prisma.execution.count({
      where: { AND: [whereAccount as Prisma.ExecutionWhereInput, executionDateWhere as Prisma.ExecutionWhereInput].filter(Boolean) },
    }),
    prisma.matchedLot.findMany({
      where: { AND: [whereAccount as Prisma.MatchedLotWhereInput, matchedLotDateWhere as Prisma.MatchedLotWhereInput].filter(Boolean) },
      select: { realizedPnl: true, holdingDays: true, outcome: true },
    }),
    prisma.setupGroup.count({
      where: { AND: [whereAccount as Prisma.SetupGroupWhereInput, setupDateWhere as Prisma.SetupGroupWhereInput].filter(Boolean) },
    }),
    prisma.import.findMany({
      where: whereAccount as Prisma.ImportWhereInput | undefined,
      select: { status: true, parsedRows: true, skippedRows: true },
    }),
    prisma.dailyAccountSnapshot.count({
      where: {
        AND: [whereAccount as Prisma.DailyAccountSnapshotWhereInput, snapshotDateWhere as Prisma.DailyAccountSnapshotWhereInput].filter(Boolean),
      },
    }),
    prisma.dailyAccountSnapshot.findMany({
      where: {
        AND: [whereAccount as Prisma.DailyAccountSnapshotWhereInput, snapshotDateWhere as Prisma.DailyAccountSnapshotWhereInput].filter(Boolean),
      },
      include: {
        account: {
          select: { accountId: true },
        },
      },
      orderBy: [{ snapshotDate: "asc" }, { id: "asc" }],
    }),
    loadAccountBalanceContext(accountIds),
    getStartingCapitalSummary(accountIds),
    prisma.dailyAccountSnapshot.findMany({
      where: {
        accountId: { in: internalAccountIds },
        ...(startDateBound ? { snapshotDate: { lte: startDateBound } } : {}),
      },
      orderBy: [{ snapshotDate: startDateBound ? "desc" : "asc" }, { id: "asc" }],
    }),
    prisma.dailyAccountSnapshot.findMany({
      where: {
        accountId: { in: internalAccountIds },
        ...(endDateBound ? { snapshotDate: { lte: endDateBound } } : {}),
      },
      orderBy: [{ snapshotDate: "desc" }, { id: "asc" }],
    }),
    prisma.cashEvent.findMany({
      where: {
        accountId: { in: internalAccountIds },
        rowType: { in: [...EXTERNAL_CAPITAL_ROW_TYPES] },
        eventDate: {
          ...(startDateBound ? { gte: startDateBound } : {}),
          ...(endDateBound ? { lte: endDateBound } : {}),
        },
      },
      select: { amount: true },
    }),
    prisma.positionSnapshot.findFirst({
      where: {
        accountIds: positionSnapshotAccountIdsJson,
        status: "COMPLETE",
        currentNlv: { not: null },
        ...(endDateBound ? { snapshotAt: { lte: endDateBound } } : {}),
      },
      orderBy: [{ snapshotAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: { currentNlv: true },
    }),
  ]);

  const totalPnl = matchedLots.reduce((sum, lot) => sum + Number(lot.realizedPnl), 0);
  const avgHold =
    matchedLots.length > 0
      ? matchedLots.reduce((sum, lot) => sum + lot.holdingDays, 0) / matchedLots.length
      : 0;
  const winningLots = matchedLots.filter((lot) => lot.outcome === "WIN");
  const losingLots = matchedLots.filter((lot) => lot.outcome === "LOSS");
  const grossWins = winningLots.reduce((sum, lot) => sum + Math.max(0, Number(lot.realizedPnl)), 0);
  const grossLosses = losingLots.reduce((sum, lot) => sum + Math.abs(Math.min(0, Number(lot.realizedPnl))), 0);
  const expectancy = matchedLots.length > 0 ? totalPnl / matchedLots.length : null;
  const winRate = winningLots.length + losingLots.length > 0 ? (winningLots.length / (winningLots.length + losingLots.length)) * 100 : null;
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : null;
  const parsedRows = imports.reduce((sum, row) => sum + row.parsedRows, 0);
  const skippedRows = imports.reduce((sum, row) => sum + row.skippedRows, 0);
  const committedImports = imports.filter((row) => row.status === "COMMITTED").length;
  const failedImports = imports.filter((row) => row.status === "FAILED").length;
  const startingCapital = startingCapitalSummary.total;
  const currentNlv = accountBalances.reduce((sum, accountBalance) => {
    return sum + (accountBalance.brokerNetLiquidationValue ?? accountBalance.cash);
  }, 0);
  const totalReturnPct = startingCapital > 0 ? ((currentNlv - startingCapital) / startingCapital) * 100 : null;
  const beginningSnapshotsByAccountId = new Map<string, (typeof beginningSnapshotRows)[number]>();
  for (const snapshot of beginningSnapshotRows) {
    if (!beginningSnapshotsByAccountId.has(snapshot.accountId)) {
      beginningSnapshotsByAccountId.set(snapshot.accountId, snapshot);
    }
  }
  const endingSnapshotsByAccountId = new Map<string, (typeof endingSnapshotRows)[number]>();
  for (const snapshot of endingSnapshotRows) {
    if (!endingSnapshotsByAccountId.has(snapshot.accountId)) {
      endingSnapshotsByAccountId.set(snapshot.accountId, snapshot);
    }
  }
  const missingBeginningValueAccountIds = internalAccountIds
    .filter((accountId) => !beginningSnapshotsByAccountId.has(accountId))
    .map((accountId) => accountExternalIdsByInternalId.get(accountId) ?? accountId);
  const missingEndingValueAccountIds =
    latestPositionSnapshot && latestPositionSnapshot.currentNlv !== null
      ? []
      : internalAccountIds
          .filter((accountId) => !endingSnapshotsByAccountId.has(accountId))
          .map((accountId) => accountExternalIdsByInternalId.get(accountId) ?? accountId);
  const beginningValue =
    missingBeginningValueAccountIds.length > 0
      ? null
      : internalAccountIds.reduce((sum, accountId) => {
          const snapshot = beginningSnapshotsByAccountId.get(accountId);
          return snapshot ? sum + snapshotValue(snapshot) : sum;
        }, 0);
  const snapshotEndingValue =
    missingEndingValueAccountIds.length > 0
      ? null
      : internalAccountIds.reduce((sum, accountId) => {
          const snapshot = endingSnapshotsByAccountId.get(accountId);
          return snapshot ? sum + snapshotValue(snapshot) : sum;
        }, 0);
  const endingValue =
    latestPositionSnapshot && latestPositionSnapshot.currentNlv !== null
      ? Number(latestPositionSnapshot.currentNlv)
      : snapshotEndingValue;
  const endingValueSource =
    latestPositionSnapshot && latestPositionSnapshot.currentNlv !== null
      ? "position_snapshot"
      : endingValue === null
        ? "unavailable"
        : "daily_account_snapshot";
  const positiveExternalContributions = capitalFlowRows.reduce((sum, row) => {
    const amount = Number(row.amount);
    return amount > 0 ? sum + amount : sum;
  }, 0);
  const withdrawals = capitalFlowRows.reduce((sum, row) => {
    const amount = Number(row.amount);
    return amount < 0 ? sum + Math.abs(amount) : sum;
  }, 0);
  const returnOnCapital = calculateReturnOnCapital({
    beginningValue,
    endingValue,
    positiveExternalContributions,
    withdrawals,
    missingBeginningValueAccountIds,
    missingEndingValueAccountIds,
    endingValueSource,
  });
  const maxDrawdown = computeMaxDrawdown(
    snapshots.map((snapshot) => ({
      accountId: snapshot.account.accountId,
      snapshotDate: snapshot.snapshotDate,
      balance: Number(snapshot.balance),
      totalCash: snapshot.totalCash === null ? null : Number(snapshot.totalCash),
      brokerNetLiquidationValue:
        snapshot.brokerNetLiquidationValue === null ? null : Number(snapshot.brokerNetLiquidationValue),
    })),
  );

  const payload: OverviewSummaryResponse = {
    netPnl: totalPnl.toFixed(2),
    executionCount,
    matchedLotCount: matchedLots.length,
    setupCount,
    averageHoldDays: avgHold.toFixed(2),
    winRate: formatNullableMetric(winRate),
    totalReturnPct: formatNullableMetric(totalReturnPct),
    returnOnCapitalPct: formatNullableMetric(returnOnCapital.returnOnCapitalPct),
    returnOnCapital: {
      beginningValue: formatNullableMetric(returnOnCapital.beginningValue),
      endingValue: formatNullableMetric(returnOnCapital.endingValue),
      netExternalContributions: returnOnCapital.netExternalContributions.toFixed(2),
      positiveExternalContributions: returnOnCapital.positiveExternalContributions.toFixed(2),
      withdrawals: returnOnCapital.withdrawals.toFixed(2),
      returnDollars: formatNullableMetric(returnOnCapital.returnDollars),
      capitalBase: formatNullableMetric(returnOnCapital.capitalBase),
      accountCount: internalAccountIds.length,
      missingBeginningValueAccountIds: returnOnCapital.missingBeginningValueAccountIds,
      missingEndingValueAccountIds: returnOnCapital.missingEndingValueAccountIds,
      endingValueSource: returnOnCapital.endingValueSource,
    },
    profitFactor: formatNullableMetric(profitFactor),
    expectancy: formatNullableMetric(expectancy),
    maxDrawdown: formatNullableMetric(maxDrawdown),
    startingCapital: startingCapital.toFixed(2),
    currentNlv: currentNlv.toFixed(2),
    snapshotCount,
    importQuality: {
      totalImports: imports.length,
      committedImports,
      failedImports,
      parsedRows,
      skippedRows,
    },
    snapshotSeries: snapshots.map((snapshot) => ({
      accountId: snapshot.account.accountId,
      snapshotDate: snapshot.snapshotDate.toISOString(),
      balance: (snapshot.totalCash ?? snapshot.balance).toString(),
      totalCash: snapshot.totalCash != null ? snapshot.totalCash.toString() : null,
      brokerNetLiquidationValue:
        snapshot.brokerNetLiquidationValue != null ? snapshot.brokerNetLiquidationValue.toString() : null,
    })),
    accountBalances: accountBalances.map((accountBalance) => ({
      accountId: accountBalance.accountExternalId,
      cash: accountBalance.cash.toFixed(2),
      cashAsOf: accountBalance.cashAsOf,
      brokerNetLiquidationValue:
        accountBalance.brokerNetLiquidationValue === null ? null : accountBalance.brokerNetLiquidationValue.toFixed(2),
    })),
  };

  return detailResponse(payload);
}
