import type { ExecutionRecord } from "@/types/api";
import { listResponse, parsePagination } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const symbol = url.searchParams.get("symbol") ?? undefined;
  const account = url.searchParams.get("account") ?? undefined;
  const importId = url.searchParams.get("import") ?? undefined;
  const executionId = url.searchParams.get("execution") ?? undefined;
  const dateFrom = url.searchParams.get("date_from");
  const dateTo = url.searchParams.get("date_to");

  const where: Record<string, unknown> = {};
  if (symbol) {
    where.symbol = { equals: symbol, mode: "insensitive" as const };
  }
  if (importId) {
    where.importId = importId;
  }
  if (executionId) {
    where.id = executionId;
  }
  if (account) {
    where.account = { accountId: { equals: account, mode: "insensitive" as const } };
  }
  if (dateFrom || dateTo) {
    where.tradeDate = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    };
  }

  const [total, rows] = await Promise.all([
    prisma.execution.count({ where }),
    prisma.execution.findMany({
      where,
      orderBy: [{ eventTimestamp: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const data: ExecutionRecord[] = rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    broker: row.broker,
    symbol: row.symbol,
    tradeDate: row.tradeDate.toISOString(),
    eventTimestamp: row.eventTimestamp.toISOString(),
    eventType: row.eventType,
    assetClass: row.assetClass,
    side: row.side,
    quantity: row.quantity.toString(),
    price: row.price?.toString() ?? null,
    openingClosingEffect: row.openingClosingEffect ?? null,
    instrumentKey: row.instrumentKey,
    underlyingSymbol: row.underlyingSymbol,
    optionType: row.optionType,
    strike: row.strike?.toString() ?? null,
    expirationDate: row.expirationDate?.toISOString() ?? null,
    spreadGroupId: row.spreadGroupId,
    importId: row.importId,
  }));

  return listResponse(data, { total, page, pageSize });
}
