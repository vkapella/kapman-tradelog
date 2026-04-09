import type { SetupSummaryRecord } from "@/types/api";
import { listResponse, parsePagination } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const tag = url.searchParams.get("tag") ?? undefined;

  const where = tag ? { tag: { equals: tag, mode: "insensitive" as const } } : {};

  const [total, rows] = await Promise.all([
    prisma.setupGroup.count({ where }),
    prisma.setupGroup.findMany({
      where,
      orderBy: { createdAt: "desc" },
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
