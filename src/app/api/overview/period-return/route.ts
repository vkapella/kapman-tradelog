import type { PeriodReturnResponse } from "@/types/api";
import {
  buildAccountIdWhere,
  parseAccountIds,
  parseDateRangeParams,
  toEndOfDayUtcIso,
} from "@/lib/api/account-scope";
import { detailResponse, errorResponse } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import { EXTERNAL_CAPITAL_ROW_TYPES } from "@/lib/overview/return-on-capital";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { startDate, endDate } = parseDateRangeParams(url.searchParams);

  if (!startDate || !endDate) {
    return errorResponse("MISSING_PARAMS", "startDate and endDate are required", []);
  }

  const accountIds = parseAccountIds(url.searchParams.get("accountIds"));
  const accountIdWhere = buildAccountIdWhere(accountIds);

  const startDateBound = new Date(startDate);
  const endDateBound = toEndOfDayUtcIso(endDate);

  const internalAccountIds =
    accountIds.length > 0
      ? (
          await prisma.account.findMany({
            where: accountIdWhere,
            select: { id: true },
          })
        ).map((a) => a.id)
      : (await prisma.account.findMany({ select: { id: true } })).map((a) => a.id);

  const [startingSnapshots, endingSnapshots, cashAggregate] = await Promise.all([
    prisma.dailyAccountSnapshot.findMany({
      where: {
        accountId: { in: internalAccountIds },
        snapshotDate: { lte: startDateBound },
      },
      orderBy: { snapshotDate: "desc" },
      distinct: ["accountId"],
    }),
    prisma.dailyAccountSnapshot.findMany({
      where: {
        accountId: { in: internalAccountIds },
        snapshotDate: { lte: endDateBound },
      },
      orderBy: { snapshotDate: "desc" },
      distinct: ["accountId"],
    }),
    prisma.cashEvent.aggregate({
      where: {
        accountId: { in: internalAccountIds },
        rowType: { in: [...EXTERNAL_CAPITAL_ROW_TYPES] },
        eventDate: { gte: startDateBound, lte: endDateBound },
      },
      _sum: { amount: true },
    }),
  ]);

  function sumNlv(snapshots: typeof startingSnapshots): number {
    return snapshots.reduce((acc, row) => {
      const nlv = row.brokerNetLiquidationValue ?? row.balance;
      return acc + Number(nlv);
    }, 0);
  }

  const startingNlv = sumNlv(startingSnapshots);
  const endingNlv = sumNlv(endingSnapshots);
  const netFlows = Number(cashAggregate._sum.amount ?? 0);

  const profit = endingNlv - startingNlv - netFlows;
  const denominator = startingNlv + netFlows;
  const returnPercentage = denominator > 0 ? profit / denominator : null;

  const payload: PeriodReturnResponse = {
    profit,
    returnPercentage,
    startingNlv,
    endingNlv,
    netFlows,
  };

  return detailResponse(payload);
}
