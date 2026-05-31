import { Prisma } from "@prisma/client";
import { buildAccountIdWhere, parseAccountIds, parseDateRangeParams, toEndOfDayUtcIso } from "@/lib/api/account-scope";
import { detailResponse } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import type { AccountValueSeriesResponse } from "@/types/api";

interface AggregatedPoint {
  date: string;
  cash: number;
  stockEtf: number;
  options: number;
  total: number;
  brokerNlvTotal: number;
  accountsWithSnapshot: Set<string>;
  accountsWithBrokerNlv: Set<string>;
  unpricedPositionCount: number;
}

function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatMoney(value: number): string {
  return value.toFixed(2);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const accountIds = parseAccountIds(url.searchParams.get("accountIds"));
  const { startDate, endDate } = parseDateRangeParams(url.searchParams);
  const startDateBound = startDate ? new Date(startDate) : null;
  const endDateBound = endDate ? toEndOfDayUtcIso(endDate) : null;

  const scopedAccounts = await prisma.account.findMany({
    where: buildAccountIdWhere(accountIds) as Prisma.AccountWhereInput | undefined,
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const internalAccountIds = scopedAccounts.map((account) => account.id);

  if (internalAccountIds.length === 0) {
    const payload: AccountValueSeriesResponse = {
      points: [],
      meta: {
        accountCount: 0,
        startDate,
        endDate,
        daysWithUnpriced: 0,
        firstTotal: null,
        lastTotal: null,
      },
    };

    return detailResponse(payload);
  }

  const snapshots = await prisma.accountValueSnapshot.findMany({
    where: {
      accountId: { in: internalAccountIds },
      ...(startDateBound || endDateBound
        ? {
            snapshotDate: {
              ...(startDateBound ? { gte: startDateBound } : {}),
              ...(endDateBound ? { lte: endDateBound } : {}),
            },
          }
        : {}),
    },
    select: {
      accountId: true,
      snapshotDate: true,
      cashValue: true,
      equityValue: true,
      optionValue: true,
      totalValue: true,
      brokerNlv: true,
      unpricedPositionCount: true,
    },
    orderBy: [{ snapshotDate: "asc" }, { accountId: "asc" }, { id: "asc" }],
  });

  const byDate = new Map<string, AggregatedPoint>();

  for (const snapshot of snapshots) {
    const date = toDateKey(snapshot.snapshotDate);
    let point = byDate.get(date);

    if (!point) {
      point = {
        date,
        cash: 0,
        stockEtf: 0,
        options: 0,
        total: 0,
        brokerNlvTotal: 0,
        accountsWithSnapshot: new Set<string>(),
        accountsWithBrokerNlv: new Set<string>(),
        unpricedPositionCount: 0,
      };
      byDate.set(date, point);
    }

    point.cash += Number(snapshot.cashValue);
    point.stockEtf += Number(snapshot.equityValue);
    point.options += Number(snapshot.optionValue);
    point.total += Number(snapshot.totalValue);
    point.unpricedPositionCount += snapshot.unpricedPositionCount;
    point.accountsWithSnapshot.add(snapshot.accountId);

    if (snapshot.brokerNlv !== null) {
      point.brokerNlvTotal += Number(snapshot.brokerNlv);
      point.accountsWithBrokerNlv.add(snapshot.accountId);
    }
  }

  const points = Array.from(byDate.values()).map((point) => {
    const brokerNlvComplete =
      point.accountsWithSnapshot.size === internalAccountIds.length
      && point.accountsWithBrokerNlv.size === internalAccountIds.length;

    const brokerNlv = brokerNlvComplete ? formatMoney(point.brokerNlvTotal) : null;
    const reconcileDelta = brokerNlvComplete ? formatMoney(point.brokerNlvTotal - point.total) : null;

    return {
      date: point.date,
      cash: formatMoney(point.cash),
      stockEtf: formatMoney(point.stockEtf),
      options: formatMoney(point.options),
      total: formatMoney(point.total),
      brokerNlv,
      reconcileDelta,
      unpricedPositionCount: point.unpricedPositionCount,
    };
  });

  const payload: AccountValueSeriesResponse = {
    points,
    meta: {
      accountCount: internalAccountIds.length,
      startDate,
      endDate,
      daysWithUnpriced: points.filter((point) => point.unpricedPositionCount > 0).length,
      firstTotal: points[0]?.total ?? null,
      lastTotal: points.length > 0 ? points[points.length - 1]?.total ?? null : null,
    },
  };

  return detailResponse(payload);
}
