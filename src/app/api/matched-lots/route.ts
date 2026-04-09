import type { MatchedLotRecord } from "@/types/api";
import { listResponse, parsePagination } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const outcome = url.searchParams.get("outcome") ?? undefined;

  const where = outcome ? { outcome: { equals: outcome, mode: "insensitive" as const } } : {};

  const [total, rows] = await Promise.all([
    prisma.matchedLot.count({ where }),
    prisma.matchedLot.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const data: MatchedLotRecord[] = rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    quantity: row.quantity.toString(),
    realizedPnl: row.realizedPnl.toString(),
    holdingDays: row.holdingDays,
    outcome: row.outcome,
    openExecutionId: row.openExecutionId,
    closeExecutionId: row.closeExecutionId,
  }));

  return listResponse(data, { total, page, pageSize });
}
