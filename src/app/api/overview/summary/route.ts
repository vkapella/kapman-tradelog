import { Prisma } from "@prisma/client";
import { buildAccountIdWhere, buildAccountScopeWhere, parseAccountIds, parseDateRangeParams, toEndOfDayUtcIso } from "@/lib/api/account-scope";
import { buildMatchedLotOpenDateWhere, buildSetupOpenDateWhere } from "@/lib/api/strategy-date-range";
import { detailResponse } from "@/lib/api/responses";
import { loadAccountBalanceContext } from "@/lib/accounts/account-balance-context";
import { getStartingCapitalSummary } from "@/lib/accounts/starting-capital";
import { prisma } from "@/lib/db/prisma";
import { computeMaxDrawdown } from "@/lib/overview/max-drawdown";
import {
  calculateReturnOnCapital,
  combineBeginningValueSources,
  EXTERNAL_CAPITAL_ROW_TYPES,
  resolveBeginningValue,
  type ReturnOnCapitalBeginningValueSource,
  type ReturnOnCapitalEndingValueSource,
  snapshotValue,
} from "@/lib/overview/return-on-capital";
import { buildAggregateScope } from "@/lib/api/aggregate-scope";
import { inKindTransferValue, isExternalFlowRow } from "@/lib/ledger/cash-row-classification";
import {
  parsePositionSnapshotAccountValuesJson,
  parsePositionSnapshotPositionsJson,
  serializePositionSnapshotAccountIds,
} from "@/lib/positions/position-snapshot";
import { resolveLiveAccountValue } from "@/lib/positions/live-account-value";
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
  const matchedLotDateWhere = buildMatchedLotOpenDateWhere({ startDate, endDate });
  const setupDateWhere = buildSetupOpenDateWhere({ startDate, endDate });
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
    select: { id: true, accountId: true, paperMoney: true, legalEntity: { select: { slug: true } } },
    orderBy: { id: "asc" },
  });
  const internalAccountIds = scopedAccounts.map((account) => account.id);
  const accountExternalIdsByInternalId = new Map(scopedAccounts.map((account) => [account.id, account.accountId]));
  const perAccountPositionScopeKeys = internalAccountIds.map((accountId) => serializePositionSnapshotAccountIds([accountId]));

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
    latestPerAccountChildRows,
    latestPerAccountPositionSnapshots,
    inKindCandidateExecutions,
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
      select: { amount: true, rowType: true, description: true },
    }),
    // Latest per-account child rows (#339): any COMPLETE run contributes its
    // per-account result, so multi-account snapshots are no longer discarded.
    prisma.positionSnapshotAccount.findMany({
      where: {
        accountId: { in: internalAccountIds },
        run: {
          status: "COMPLETE",
          ...(endDateBound ? { snapshotAt: { lte: endDateBound } } : {}),
        },
      },
      orderBy: [{ inputsRevision: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { id: "desc" }],
      select: {
        accountId: true,
        inputsRevision: true,
        reconstructedNlv: true,
        run: { select: { snapshotAt: true, createdAt: true, id: true } },
      },
    }),
    // Legacy fallback for accounts whose only snapshots predate the child table.
    prisma.positionSnapshot.findMany({
      where: {
        accountIds: { in: perAccountPositionScopeKeys },
        status: "COMPLETE",
        ...(endDateBound ? { snapshotAt: { lte: endDateBound } } : {}),
      },
      orderBy: [{ snapshotAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: {
        accountIds: true,
        currentNlv: true,
        positionsJson: true,
        accountValuesJson: true,
        snapshotAt: true,
      },
    }),
    // In-kind (ACAT) receives inside the period are external contributions the
    // cash ledger does not carry (#357).
    prisma.execution.findMany({
      where: {
        accountId: { in: internalAccountIds },
        assetClass: "EQUITY",
        side: "BUY",
        tradeDate: {
          ...(startDateBound ? { gte: startDateBound } : {}),
          ...(endDateBound ? { lte: endDateBound } : {}),
        },
      },
      select: { id: true, accountId: true, assetClass: true, side: true, quantity: true, price: true, rawRowJson: true },
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
  // Value-engine total on (or just before) each beginning date, used when the
  // daily snapshot carries cash only (#358).
  const beginningValueSnapshotByAccountId = new Map<string, { toString(): string } | number>();
  await Promise.all(
    Array.from(beginningSnapshotsByAccountId.entries()).map(async ([accountId, snapshot]) => {
      if (snapshot.brokerNetLiquidationValue !== null && snapshot.brokerNetLiquidationValue !== undefined) {
        return;
      }
      const lowerBound = new Date(snapshot.snapshotDate.getTime() - 10 * 24 * 60 * 60 * 1000);
      const valueSnapshot = (await prisma.accountValueSnapshot.findFirst({
        where: { accountId, snapshotDate: { lte: snapshot.snapshotDate, gte: lowerBound } },
        orderBy: { snapshotDate: "desc" },
        select: { totalValue: true },
      })) ?? null;
      if (valueSnapshot) {
        beginningValueSnapshotByAccountId.set(accountId, valueSnapshot.totalValue);
      }
    }),
  );
  const latestPositionNlvByAccountId = new Map<string, number>();
  // Child rows are ordered by (inputsRevision DESC NULLS LAST, createdAt DESC),
  // so the first row per account is the source-data-freshest result. Rows with
  // a null reconstructed NLV are skipped: a later-revision-but-incomplete
  // compute must not mask an older complete one.
  for (const child of latestPerAccountChildRows) {
    if (latestPositionNlvByAccountId.has(child.accountId) || child.reconstructedNlv === null) {
      continue;
    }
    latestPositionNlvByAccountId.set(child.accountId, Number(child.reconstructedNlv));
  }
  for (const row of latestPerAccountPositionSnapshots) {
    let parsedScope: unknown;
    try {
      parsedScope = JSON.parse(row.accountIds) as unknown;
    } catch {
      continue;
    }
    if (!Array.isArray(parsedScope) || parsedScope.length !== 1) {
      continue;
    }
    const scopedAccountId = String(parsedScope[0]);
    if (latestPositionNlvByAccountId.has(scopedAccountId)) {
      continue;
    }
    const storedValue = parsePositionSnapshotAccountValuesJson(row.accountValuesJson)
      .find((value) => value.accountId === scopedAccountId);
    const accountExternalId = accountExternalIdsByInternalId.get(scopedAccountId) ?? scopedAccountId;
    const resolvedValue = storedValue ?? (row.positionsJson && row.snapshotAt
      ? resolveLiveAccountValue({
          accountId: scopedAccountId,
          accountExternalId,
          positions: parsePositionSnapshotPositionsJson(row.positionsJson),
          balance: accountBalances.find((entry) => entry.accountExternalId === accountExternalId) ?? null,
          marksAsOf: row.snapshotAt,
        })
      : null);
    const reconstructedNlv = resolvedValue?.reconstructedNlv
      ?? (row.currentNlv === null ? null : row.currentNlv.toString());
    if (reconstructedNlv !== null) {
      latestPositionNlvByAccountId.set(scopedAccountId, Number(reconstructedNlv));
    }
  }
  const currentNlv = internalAccountIds.every((accountId) => latestPositionNlvByAccountId.has(accountId))
    ? internalAccountIds.reduce((sum, accountId) => sum + (latestPositionNlvByAccountId.get(accountId) ?? 0), 0)
    : null;
  const totalReturnPct = currentNlv !== null && startingCapital > 0
    ? ((currentNlv - startingCapital) / startingCapital) * 100
    : null;
  const missingEndingValueAccountIds = internalAccountIds
    .filter((accountId) => !latestPositionNlvByAccountId.has(accountId) && !endingSnapshotsByAccountId.has(accountId))
    .map((accountId) => accountExternalIdsByInternalId.get(accountId) ?? accountId);
  const beginningResolutions = internalAccountIds.flatMap((accountId) => {
    const snapshot = beginningSnapshotsByAccountId.get(accountId);
    return snapshot ? [resolveBeginningValue(snapshot, beginningValueSnapshotByAccountId.get(accountId) ?? null)] : [];
  });
  const beginningValue =
    missingBeginningValueAccountIds.length > 0
      ? null
      : beginningResolutions.reduce((sum, resolved) => sum + resolved.value, 0);
  const beginningValueSource: ReturnOnCapitalBeginningValueSource =
    beginningValue === null ? "unavailable" : combineBeginningValueSources(beginningResolutions.map((resolved) => resolved.source));
  const endingResolution = internalAccountIds.map((accountId) => {
    const positionNlv = latestPositionNlvByAccountId.get(accountId);
    if (positionNlv !== undefined) {
      return { source: "position_snapshot" as const, value: positionNlv };
    }
    const snapshot = endingSnapshotsByAccountId.get(accountId);
    if (snapshot) {
      return { source: "daily_account_snapshot" as const, value: snapshotValue(snapshot) };
    }
    return null;
  });
  const endingValue =
    missingEndingValueAccountIds.length > 0
      ? null
      : endingResolution.reduce((sum, resolved) => (resolved ? sum + resolved.value : sum), 0);
  const endingSourceSet = new Set(
    endingResolution.reduce<Array<"position_snapshot" | "daily_account_snapshot">>((sources, resolved) => {
      if (!resolved) {
        return sources;
      }
      sources.push(resolved.source);
      return sources;
    }, []),
  );
  let endingValueSource: ReturnOnCapitalEndingValueSource = "unavailable";
  if (endingSourceSet.size === 1 && endingSourceSet.has("position_snapshot")) {
    endingValueSource = "position_snapshot";
  } else if (endingSourceSet.size === 1 && endingSourceSet.has("daily_account_snapshot")) {
    endingValueSource = "daily_account_snapshot";
  } else if (endingSourceSet.size > 1) {
    endingValueSource = "mixed";
  } else if (endingValue !== null) {
    endingValueSource = "daily_account_snapshot";
  }
  // Classified, not summed raw: an external row type is not enough (a paper
  // forex journal is excluded, #361/#362).
  const externalFlowRows = capitalFlowRows.filter((row) => isExternalFlowRow({ rowType: row.rowType ?? "TRANSFER_IN", amount: row.amount, description: row.description ?? null }));
  const positiveExternalContributions = externalFlowRows.reduce((sum, row) => {
    const amount = Number(row.amount);
    return amount > 0 ? sum + amount : sum;
  }, 0);
  const withdrawals = externalFlowRows.reduce((sum, row) => {
    const amount = Number(row.amount);
    return amount < 0 ? sum + Math.abs(amount) : sum;
  }, 0);
  const inKindContributions = (inKindCandidateExecutions ?? []).reduce((sum, execution) => sum + inKindTransferValue(execution), 0);
  const returnOnCapital = calculateReturnOnCapital({
    beginningValue,
    beginningValueSource,
    endingValue,
    positiveExternalContributions,
    inKindContributions,
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
    totalReturnPctBasis: "legacy_growth_over_starting_capital_includes_funding",
    returnOnCapitalPct: formatNullableMetric(returnOnCapital.returnOnCapitalPct),
    returnOnCapital: {
      beginningValue: formatNullableMetric(returnOnCapital.beginningValue),
      beginningValueSource: returnOnCapital.beginningValueSource,
      inKindContributions: returnOnCapital.inKindContributions.toFixed(2),
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
    scope: buildAggregateScope(accountIds, scopedAccounts),
    profitFactor: formatNullableMetric(profitFactor),
    expectancy: formatNullableMetric(expectancy),
    maxDrawdown: formatNullableMetric(maxDrawdown),
    startingCapital: startingCapital.toFixed(2),
    currentNlv: currentNlv === null ? null : currentNlv.toFixed(2),
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
