import type { Prisma } from "@prisma/client";
import { inferSetupGroups, type SetupInferenceLot } from "./setup-inference";

export interface RebuildAccountSetupsResult {
  setupGroupsPersisted: number;
  uncategorizedCount: number;
}

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

  const inferred = inferSetupGroups(inferenceLots);

  for (const group of inferred.groups) {
    const created = await tx.setupGroup.create({
      data: {
        accountId,
        tag: group.tag,
        overrideTag: null,
        underlyingSymbol: group.underlyingSymbol,
        realizedPnl: group.realizedPnl,
        winRate: group.winRate,
        expectancy: group.expectancy,
        averageHoldDays: group.averageHoldDays,
      },
    });

    if (group.lotIds.length > 0) {
      await tx.setupGroupLot.createMany({
        data: group.lotIds.map((matchedLotId) => ({
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
