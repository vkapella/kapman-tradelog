import { Prisma } from "@prisma/client";
import { buildAccountScopeWhere, parseAccountIds } from "@/lib/api/account-scope";
import { detailResponse } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import type { TtsEvidenceResponse } from "@/types/api";

function getMonthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function getWeeksInMonth(monthKey: string): number {
  const [year, month] = monthKey.split("-").map((value) => Number(value));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.max(1, daysInMonth / 7);
}

function computeMedian(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);

  if (ordered.length % 2 === 0) {
    return (ordered[middle - 1]! + ordered[middle]!) / 2;
  }

  return ordered[middle]!;
}

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
        createdAt: true,
        closeExecution: {
          select: {
            tradeDate: true,
          },
        },
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
  const executionMonths = new Map<
    string,
    {
      tradeCount: number;
      activeDays: Set<string>;
      grossProceedsProxy: number;
    }
  >();
  const holdingMonths = new Map<string, number[]>();

  for (const execution of executions) {
    const month = getMonthKey(execution.tradeDate);
    const current = executionMonths.get(month) ?? {
      tradeCount: 0,
      activeDays: new Set<string>(),
      grossProceedsProxy: 0,
    };

    current.tradeCount += 1;
    current.activeDays.add(execution.tradeDate.toISOString().slice(0, 10));
    current.grossProceedsProxy += Math.abs(Number(execution.quantity)) * Number(execution.price ?? 0);
    executionMonths.set(month, current);
  }

  for (const lot of matchedLots) {
    const referenceDate = lot.closeExecution?.tradeDate ?? lot.createdAt;
    const month = getMonthKey(referenceDate);
    const current = holdingMonths.get(month) ?? [];
    current.push(lot.holdingDays);
    holdingMonths.set(month, current);
  }

  const monthlySeries = Array.from(new Set([...Array.from(executionMonths.keys()), ...Array.from(holdingMonths.keys())]))
    .sort()
    .slice(-6)
    .map((month) => {
      const executionMonth = executionMonths.get(month);
      const holdingMonth = holdingMonths.get(month) ?? [];
      const averageHoldingPeriodDays =
        holdingMonth.length > 0 ? holdingMonth.reduce((sum, value) => sum + value, 0) / holdingMonth.length : null;
      const medianHoldingPeriodDays = computeMedian(holdingMonth);
      const tradeCount = executionMonth?.tradeCount ?? 0;

      return {
        month,
        tradeCount,
        tradesPerMonth: tradeCount,
        activeDaysPerWeek: (executionMonth?.activeDays.size ?? 0) / getWeeksInMonth(month),
        averageHoldingPeriodDays:
          averageHoldingPeriodDays === null ? null : Number(averageHoldingPeriodDays.toFixed(2)),
        medianHoldingPeriodDays:
          medianHoldingPeriodDays === null ? null : Number(medianHoldingPeriodDays.toFixed(2)),
        annualizedTradeCount: tradeCount * 12,
        grossProceedsProxy: (executionMonth?.grossProceedsProxy ?? 0).toFixed(2),
      };
    });

  const payload: TtsEvidenceResponse = {
    tradesPerMonth: Number(tradesPerMonth.toFixed(2)),
    activeDaysPerWeek: Number(activeDaysPerWeek.toFixed(2)),
    averageHoldingPeriodDays: Number(averageHoldingPeriodDays.toFixed(2)),
    medianHoldingPeriodDays: Number(medianHoldingPeriodDays.toFixed(2)),
    annualizedTradeCount: Math.round(tradesPerMonth * 12),
    grossProceedsProxy: grossProceeds.toFixed(2),
    holdingPeriodDistribution,
    monthlySeries,
  };

  return detailResponse(payload);
}
