import type { Prisma } from "@prisma/client";
import { inferSetupGroups, type SetupInferenceLot } from "./setup-inference";

export interface RebuildAccountSetupsResult {
  setupGroupsPersisted: number;
  uncategorizedCount: number;
}

const STOCK_ANCHOR_PREFIX = "stock-anchor::";

export async function rebuildAccountSetups(
  tx: Prisma.TransactionClient,
  accountId: string,
): Promise<RebuildAccountSetupsResult> {
  await tx.setupGroup.deleteMany({ where: { accountId } });

  const matchedLots = await tx.matchedLot.findMany({
    where: { accountId },
    include: {
      openExecution: true,
      closeExecution: true,
    },
    orderBy: [{ openExecution: { tradeDate: "asc" } }, { id: "asc" }],
  });

  const inferenceLots: SetupInferenceLot[] = matchedLots.map((lot) => ({
    id: lot.id,
    accountId: lot.accountId,
    symbol: lot.openExecution.symbol,
    underlyingSymbol: lot.openExecution.underlyingSymbol ?? lot.openExecution.symbol,
    openTradeDate: lot.openExecution.tradeDate,
    closeTradeDate: lot.closeExecution?.tradeDate ?? null,
    realizedPnl: Number(lot.realizedPnl),
    holdingDays: lot.holdingDays,
    openAssetClass: lot.openExecution.assetClass,
    openSide: lot.openExecution.side,
    optionType: lot.openExecution.optionType,
    strike: lot.openExecution.strike ? Number(lot.openExecution.strike) : null,
    expirationDate: lot.openExecution.expirationDate,
    openSpreadGroupId: lot.openExecution.spreadGroupId,
  }));

  const matchedOpenExecutionIds = new Set(matchedLots.map((lot) => lot.openExecutionId));
  const openEquityExecutions = await tx.execution.findMany({
    where: {
      accountId,
      assetClass: "EQUITY",
      side: "BUY",
      openingClosingEffect: { in: ["TO_OPEN", "UNKNOWN"] },
      id: { notIn: Array.from(matchedOpenExecutionIds) },
    },
    orderBy: [{ tradeDate: "asc" }, { id: "asc" }],
  });

  const stockAnchorLots: SetupInferenceLot[] = openEquityExecutions.map((execution) => ({
    id: `${STOCK_ANCHOR_PREFIX}${execution.id}`,
    accountId: execution.accountId,
    symbol: execution.symbol,
    underlyingSymbol: execution.underlyingSymbol ?? execution.symbol,
    openTradeDate: execution.tradeDate,
    closeTradeDate: null,
    realizedPnl: 0,
    holdingDays: 0,
    openAssetClass: "EQUITY",
    openSide: "BUY",
    optionType: null,
    strike: null,
    expirationDate: null,
    openSpreadGroupId: null,
  }));

  const allInferenceLots = [...inferenceLots, ...stockAnchorLots];
  const inferred = inferSetupGroups(allInferenceLots);
  const lotMetricsById = new Map(
    allInferenceLots.map((lot) => [
      lot.id,
      {
        realizedPnl: lot.realizedPnl,
        holdingDays: lot.holdingDays,
      },
    ]),
  );

  for (const group of inferred.groups) {
    const groupMetrics = group.lotIds.reduce(
      (acc, lotId) => {
        const lot = lotMetricsById.get(lotId);
        if (!lot) {
          return acc;
        }

        acc.realizedPnl += lot.realizedPnl;
        acc.holdingDays += lot.holdingDays;
        acc.lotCount += 1;

        if (lot.realizedPnl > 0) {
          acc.wins += 1;
        } else if (lot.realizedPnl < 0) {
          acc.losses += 1;
        }

        return acc;
      },
      { realizedPnl: 0, holdingDays: 0, lotCount: 0, wins: 0, losses: 0 },
    );

    const denominator = groupMetrics.wins + groupMetrics.losses;
    const winRate = denominator > 0 ? groupMetrics.wins / denominator : null;
    const expectancy = groupMetrics.lotCount > 0 ? groupMetrics.realizedPnl / groupMetrics.lotCount : null;
    const averageHoldDays = groupMetrics.lotCount > 0 ? groupMetrics.holdingDays / groupMetrics.lotCount : null;

    const created = await tx.setupGroup.create({
      data: {
        accountId,
        tag: group.tag,
        overrideTag: null,
        underlyingSymbol: group.underlyingSymbol,
        realizedPnl: groupMetrics.realizedPnl,
        winRate,
        expectancy,
        averageHoldDays,
      },
    });

    const persistableLotIds = group.lotIds.filter((id) => !id.startsWith(STOCK_ANCHOR_PREFIX));
    if (persistableLotIds.length > 0) {
      await tx.setupGroupLot.createMany({
        data: persistableLotIds.map((matchedLotId) => ({
          setupGroupId: created.id,
          matchedLotId,
        })),
      });
    }
  }

  return {
    setupGroupsPersisted: inferred.groups.length,
    uncategorizedCount: inferred.uncategorizedCount,
  };
}
