import { Prisma } from "@prisma/client";
import type { SetupSummaryRecord } from "@/types/api";
import { listResponse, parsePagination } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const tag = url.searchParams.get("tag") ?? undefined;
  const account = url.searchParams.get("account") ?? undefined;

  const where: Prisma.SetupGroupWhereInput = {};
  if (tag) {
    where.tag = { equals: tag, mode: "insensitive" };
  }
  if (account) {
    where.account = { accountId: { equals: account, mode: "insensitive" } };
  }

  const [total, rows] = await Promise.all([
    prisma.setupGroup.count({ where }),
    prisma.setupGroup.findMany({
      where,
      orderBy: [{ realizedPnl: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const data: SetupSummaryRecord[] = rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    tag: row.tag,
    overrideTag: row.overrideTag,
    underlyingSymbol: row.underlyingSymbol,
    realizedPnl: row.realizedPnl?.toString() ?? null,
    winRate: row.winRate?.toString() ?? null,
    expectancy: row.expectancy?.toString() ?? null,
    averageHoldDays: row.averageHoldDays?.toString() ?? null,
  }));

  return listResponse(data, { total, page, pageSize });
}
