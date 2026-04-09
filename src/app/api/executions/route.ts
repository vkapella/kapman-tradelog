import type { ExecutionRecord } from "@/types/api";
import { listResponse, parsePagination } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const symbol = url.searchParams.get("symbol") ?? undefined;

  const where = symbol ? { symbol: { equals: symbol, mode: "insensitive" as const } } : {};

  const [total, rows] = await Promise.all([
    prisma.execution.count({ where }),
    prisma.execution.findMany({
      where,
      orderBy: { eventTimestamp: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const data: ExecutionRecord[] = rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    symbol: row.symbol,
    eventTimestamp: row.eventTimestamp.toISOString(),
    eventType: row.eventType,
    assetClass: row.assetClass,
    side: row.side,
    quantity: row.quantity.toString(),
    price: row.price?.toString() ?? null,
    importId: row.importId,
  }));

  return listResponse(data, { total, page, pageSize });
}
