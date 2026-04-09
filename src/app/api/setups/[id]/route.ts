import { detailResponse, errorResponse } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import type { SetupDetailResponse } from "@/types/api";

export async function GET(_request: Request, context: { params: { id: string } }) {
  const setupGroup = await prisma.setupGroup.findUnique({
    where: { id: context.params.id },
    include: {
      lots: {
        include: {
          matchedLot: {
            include: {
              openExecution: true,
              closeExecution: true,
            },
          },
        },
      },
    },
  });

  if (!setupGroup) {
    return errorResponse("NOT_FOUND", "Setup group not found.", [`Setup ${context.params.id} does not exist.`], 404);
  }

  const lots = setupGroup.lots.map((entry) => entry.matchedLot);
  const executionIds = lots.flatMap((lot) => [lot.openExecutionId, lot.closeExecutionId].filter(Boolean) as string[]);

  const payload: SetupDetailResponse = {
    setup: {
      id: setupGroup.id,
      accountId: setupGroup.accountId,
      tag: setupGroup.tag,
      overrideTag: setupGroup.overrideTag,
      underlyingSymbol: setupGroup.underlyingSymbol,
      realizedPnl: setupGroup.realizedPnl?.toString() ?? null,
      winRate: setupGroup.winRate?.toString() ?? null,
      expectancy: setupGroup.expectancy?.toString() ?? null,
      averageHoldDays: setupGroup.averageHoldDays?.toString() ?? null,
    },
    lots: lots.map((lot) => ({
      id: lot.id,
      accountId: lot.accountId,
      symbol: lot.openExecution.symbol,
      openTradeDate: lot.openExecution.tradeDate.toISOString(),
      closeTradeDate: lot.closeExecution?.tradeDate.toISOString() ?? null,
      openImportId: lot.openExecution.importId,
      closeImportId: lot.closeExecution?.importId ?? null,
      quantity: lot.quantity.toString(),
      realizedPnl: lot.realizedPnl.toString(),
      holdingDays: lot.holdingDays,
      outcome: lot.outcome,
      openExecutionId: lot.openExecutionId,
      closeExecutionId: lot.closeExecutionId,
    })),
    executionIds,
  };

  return detailResponse(payload);
}
