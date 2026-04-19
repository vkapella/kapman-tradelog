import type { Prisma, PrismaClient } from "@prisma/client";
import type { SetupInferenceLot } from "./setup-inference";

export const STOCK_ANCHOR_PREFIX = "stock-anchor::";

type TransactionClient = Prisma.TransactionClient;
type DbClient = PrismaClient | TransactionClient;

export interface MatchedLotWithExecutions {
  id: string;
  accountId: string;
  openExecutionId: string;
  realizedPnl: { toString(): string } | number;
  holdingDays: number;
  openExecution: {
    symbol: string;
    underlyingSymbol: string | null;
    tradeDate: Date;
    assetClass: string;
    side: string | null;
    optionType: string | null;
    strike: { toString(): string } | null;
    expirationDate: Date | null;
    spreadGroupId: string | null;
  };
  closeExecution: {
    tradeDate: Date;
  } | null;
}

export async function buildInferenceLots(
  db: DbClient,
  accountId: string,
  matchedLots: MatchedLotWithExecutions[],
): Promise<SetupInferenceLot[]> {
  const fromMatchedLots: SetupInferenceLot[] = matchedLots.map((lot) => ({
    id: lot.id,
    accountId: lot.accountId,
    symbol: lot.openExecution.symbol,
    underlyingSymbol: lot.openExecution.underlyingSymbol ?? lot.openExecution.symbol,
    openTradeDate: lot.openExecution.tradeDate,
    closeTradeDate: lot.closeExecution?.tradeDate ?? null,
    realizedPnl: Number(lot.realizedPnl),
    holdingDays: lot.holdingDays,
    openAssetClass: lot.openExecution.assetClass as SetupInferenceLot["openAssetClass"],
    openSide: lot.openExecution.side as SetupInferenceLot["openSide"],
    optionType: lot.openExecution.optionType,
    strike: lot.openExecution.strike ? Number(lot.openExecution.strike) : null,
    expirationDate: lot.openExecution.expirationDate,
    openSpreadGroupId: lot.openExecution.spreadGroupId,
  }));

  const matchedOpenExecutionIds = new Set(matchedLots.map((lot) => lot.openExecutionId));
  const openEquityExecutions = await db.execution.findMany({
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

  return [...fromMatchedLots, ...stockAnchorLots];
}
