import type { Prisma } from "@prisma/client";
import { toEndOfDayUtcIso } from "@/lib/api/account-scope";

export interface StrategyDateRangeInput {
  startDate: string | null;
  endDate: string | null;
}

function buildTradeDateRange({ startDate, endDate }: StrategyDateRangeInput): Prisma.DateTimeFilter | undefined {
  if (!startDate && !endDate) {
    return undefined;
  }

  return {
    ...(startDate ? { gte: new Date(startDate) } : {}),
    ...(endDate ? { lte: toEndOfDayUtcIso(endDate) } : {}),
  };
}

export function buildMatchedLotOpenDateWhere(input: StrategyDateRangeInput): Prisma.MatchedLotWhereInput | undefined {
  const tradeDate = buildTradeDateRange(input);
  if (!tradeDate) {
    return undefined;
  }

  return {
    openExecution: {
      tradeDate,
    },
  };
}

export function buildSetupOpenDateWhere(input: StrategyDateRangeInput): Prisma.SetupGroupWhereInput | undefined {
  const matchedLotOpenDateWhere = buildMatchedLotOpenDateWhere(input);
  if (!matchedLotOpenDateWhere) {
    return undefined;
  }

  return {
    lots: {
      some: {
        matchedLot: matchedLotOpenDateWhere,
      },
      every: {
        matchedLot: matchedLotOpenDateWhere,
      },
    },
  };
}
