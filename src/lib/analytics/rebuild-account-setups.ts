import type { Prisma } from "@prisma/client";
import { buildInferenceLots, STOCK_ANCHOR_PREFIX } from "./inference-lot-builder";
import { inferSetupGroups } from "./setup-inference";

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

  const allInferenceLots = await buildInferenceLots(tx, accountId, matchedLots);
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
