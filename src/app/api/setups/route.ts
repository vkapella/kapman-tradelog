import { Prisma } from "@prisma/client";
import { buildAccountScopeWhere, parseAccountIds, parseDateRangeParams } from "@/lib/api/account-scope";
import { buildSetupOpenDateWhere } from "@/lib/api/strategy-date-range";
import type { SetupSummaryRecord } from "@/types/api";
import { listResponse, parsePagination } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const accountIds = parseAccountIds(url.searchParams.get("accountIds"));
  const tag = url.searchParams.get("tag") ?? undefined;
  const account = url.searchParams.get("account") ?? undefined;
  const { startDate, endDate } = parseDateRangeParams(url.searchParams);
  const accountScope = buildAccountScopeWhere(accountIds);

  const andClauses: Prisma.SetupGroupWhereInput[] = [];
  if (accountScope) {
    andClauses.push(accountScope as Prisma.SetupGroupWhereInput);
  }
  if (tag) {
    andClauses.push({ tag: { equals: tag, mode: "insensitive" } });
  }
  if (account) {
    andClauses.push({ account: { accountId: { equals: account, mode: "insensitive" } } });
  }
  const strategyDateWhere = buildSetupOpenDateWhere({ startDate, endDate });
  if (strategyDateWhere) {
    andClauses.push(strategyDateWhere);
  }
  const where: Prisma.SetupGroupWhereInput = andClauses.length > 0 ? { AND: andClauses } : {};

  const [total, rows] = await Promise.all([
    prisma.setupGroup.count({ where }),
    prisma.setupGroup.findMany({
      where,
      include: {
        _count: {
          select: {
            lots: true,
          },
        },
        lots: {
          select: {
            matchedLot: {
              select: {
                openExecution: { select: { tradeDate: true } },
                closeExecution: { select: { tradeDate: true } },
              },
            },
          },
        },
      },
      orderBy: [{ realizedPnl: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const data: SetupSummaryRecord[] = rows.map((row) => {
    const openDates = row.lots.map((l) => l.matchedLot.openExecution.tradeDate.getTime());
    const closeDates = row.lots
      .map((l) => l.matchedLot.closeExecution?.tradeDate?.getTime())
      .filter((d): d is number => d !== undefined);
    const setupOpenDate = openDates.length > 0 ? new Date(Math.min(...openDates)).toISOString().split("T")[0] : null;
    const setupCloseDate =
      closeDates.length === row.lots.length && closeDates.length > 0
        ? new Date(Math.max(...closeDates)).toISOString().split("T")[0]
        : null;

    return {
      id: row.id,
      accountId: row.accountId,
      tag: row.tag,
      overrideTag: row.overrideTag,
      underlyingSymbol: row.underlyingSymbol,
      realizedPnl: row.realizedPnl?.toString() ?? null,
      winRate: row.winRate?.toString() ?? null,
      expectancy: row.expectancy?.toString() ?? null,
      averageHoldDays: row.averageHoldDays?.toString() ?? null,
      setupLotCount: row._count.lots,
      setupOpenDate,
      setupCloseDate,
    };
  });

  return listResponse(data, { total, page, pageSize });
}
