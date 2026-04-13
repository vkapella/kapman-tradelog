import { Prisma } from "@prisma/client";
import { buildAccountScopeWhere, parseAccountIds } from "@/lib/api/account-scope";
import { detailResponse } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import type { TtsEvidenceResponse } from "@/types/api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const accountIds = parseAccountIds(url.searchParams.get("accountIds"));
  const whereAccount = buildAccountScopeWhere(accountIds);

  const [executions, matchedLots] = await Promise.all([
    prisma.execution.findMany({
      where: whereAccount as Prisma.ExecutionWhereInput | undefined,
      select: {
        tradeDate: true,
        quantity: true,
        price: true,
      },
      orderBy: [{ tradeDate: "asc" }, { id: "asc" }],
    }),
    prisma.matchedLot.findMany({
      where: whereAccount as Prisma.MatchedLotWhereInput | undefined,
      select: {
        holdingDays: true,
      },
    }),
  ]);

  const totalTrades = executions.length;
  const activeDays = new Set(executions.map((row) => row.tradeDate.toISOString().slice(0, 10))).size;
  const grossProceeds = executions.reduce((sum, row) => {
    const price = Number(row.price ?? 0);
    const quantity = Math.abs(Number(row.quantity));
    return sum + price * quantity;
  }, 0);

  let monthCount = 1;
  let weekCount = 1;
  if (executions.length > 1) {
    const first = executions[0].tradeDate;
    const last = executions[executions.length - 1].tradeDate;
    const yearDiff = last.getUTCFullYear() - first.getUTCFullYear();
    const monthDiff = last.getUTCMonth() - first.getUTCMonth();
    monthCount = Math.max(1, yearDiff * 12 + monthDiff + 1);

    const dayDiff = Math.max(1, Math.floor((last.getTime() - first.getTime()) / (24 * 60 * 60 * 1000)) + 1);
    weekCount = Math.max(1, dayDiff / 7);
  }

  const holdingDays = matchedLots.map((lot) => lot.holdingDays).sort((left, right) => left - right);
  const averageHoldingPeriodDays =
    holdingDays.length > 0 ? holdingDays.reduce((sum, value) => sum + value, 0) / holdingDays.length : 0;

  let medianHoldingPeriodDays = 0;
  if (holdingDays.length > 0) {
    const middle = Math.floor(holdingDays.length / 2);
    if (holdingDays.length % 2 === 0) {
      medianHoldingPeriodDays = (holdingDays[middle - 1] + holdingDays[middle]) / 2;
    } else {
      medianHoldingPeriodDays = holdingDays[middle];
    }
  }

  const holdingPeriodDistribution = [
    { bucket: "0-1d", count: holdingDays.filter((value) => value <= 1).length },
    { bucket: "2-5d", count: holdingDays.filter((value) => value >= 2 && value <= 5).length },
    { bucket: "6-20d", count: holdingDays.filter((value) => value >= 6 && value <= 20).length },
    { bucket: "21d+", count: holdingDays.filter((value) => value >= 21).length },
  ];

  const tradesPerMonth = monthCount > 0 ? totalTrades / monthCount : totalTrades;
  const activeDaysPerWeek = activeDays / weekCount;

  const payload: TtsEvidenceResponse = {
    tradesPerMonth: Number(tradesPerMonth.toFixed(2)),
    activeDaysPerWeek: Number(activeDaysPerWeek.toFixed(2)),
    averageHoldingPeriodDays: Number(averageHoldingPeriodDays.toFixed(2)),
    medianHoldingPeriodDays: Number(medianHoldingPeriodDays.toFixed(2)),
    annualizedTradeCount: Math.round(tradesPerMonth * 12),
    grossProceedsProxy: grossProceeds.toFixed(2),
    holdingPeriodDistribution,
  };

  return detailResponse(payload);
}
