import { Prisma } from "@prisma/client";
import { buildAccountScopeWhere, parseAccountIds } from "@/lib/api/account-scope";
import { detailResponse } from "@/lib/api/responses";
import { loadAccountBalanceContext } from "@/lib/accounts/account-balance-context";
import { getStartingCapitalSummary } from "@/lib/accounts/starting-capital";
import { prisma } from "@/lib/db/prisma";
import { computeMaxDrawdown } from "@/lib/overview/max-drawdown";
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
  const whereAccount = buildAccountScopeWhere(accountIds);

  const [executionCount, matchedLots, setupCount, imports, snapshotCount, snapshots, accountBalances, startingCapitalSummary] = await Promise.all([
    prisma.execution.count({ where: whereAccount as Prisma.ExecutionWhereInput | undefined }),
    prisma.matchedLot.findMany({
      where: whereAccount as Prisma.MatchedLotWhereInput | undefined,
      select: { realizedPnl: true, holdingDays: true, outcome: true },
    }),
    prisma.setupGroup.count({ where: whereAccount as Prisma.SetupGroupWhereInput | undefined }),
    prisma.import.findMany({
      where: whereAccount as Prisma.ImportWhereInput | undefined,
      select: { status: true, parsedRows: true, skippedRows: true },
    }),
    prisma.dailyAccountSnapshot.count({ where: whereAccount as Prisma.DailyAccountSnapshotWhereInput | undefined }),
    prisma.dailyAccountSnapshot.findMany({
      where: whereAccount as Prisma.DailyAccountSnapshotWhereInput | undefined,
      include: {
        account: {
          select: { accountId: true },
        },
      },
      orderBy: [{ snapshotDate: "asc" }, { id: "asc" }],
    }),
    loadAccountBalanceContext(accountIds),
    getStartingCapitalSummary(accountIds),
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
