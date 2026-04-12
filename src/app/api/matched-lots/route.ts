import { Prisma } from "@prisma/client";
import { buildAccountScopeWhere, parseAccountIds } from "@/lib/api/account-scope";
import type { MatchedLotRecord } from "@/types/api";
import { listResponse, parsePagination } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const accountIds = parseAccountIds(url.searchParams.get("accountIds"));
  const symbol = url.searchParams.get("symbol") ?? undefined;
  const outcome = url.searchParams.get("outcome") ?? undefined;
  const account = url.searchParams.get("account") ?? undefined;
  const importId = url.searchParams.get("import") ?? undefined;
  const dateFrom = url.searchParams.get("date_from");
  const dateTo = url.searchParams.get("date_to");
  const accountScope = buildAccountScopeWhere(accountIds);

  const andClauses: Prisma.MatchedLotWhereInput[] = [];
  if (accountScope) {
    andClauses.push(accountScope as Prisma.MatchedLotWhereInput);
  }

  if (symbol) {
    andClauses.push({
      OR: [
        { openExecution: { symbol: { equals: symbol, mode: "insensitive" } } },
        { openExecution: { underlyingSymbol: { equals: symbol, mode: "insensitive" } } },
      ],
    });
  }

  if (outcome) {
    andClauses.push({ outcome: { equals: outcome, mode: "insensitive" } });
  }

  if (account) {
    andClauses.push({
      account: {
        accountId: { equals: account, mode: "insensitive" },
      },
    });
  }

  if (importId) {
    andClauses.push({
      OR: [
        { openExecution: { importId } },
        { openExecution: { importLinks: { some: { importId } } } },
        { closeExecution: { is: { importId } } },
        { closeExecution: { is: { importLinks: { some: { importId } } } } },
      ],
    });
  }

  if (dateFrom || dateTo) {
    andClauses.push({
      closeExecution: {
        is: {
          tradeDate: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo) } : {}),
          },
        },
      },
    });
  }

  const where: Prisma.MatchedLotWhereInput = andClauses.length > 0 ? { AND: andClauses } : {};

  const [total, rows] = await Promise.all([
    prisma.matchedLot.count({ where }),
    prisma.matchedLot.findMany({
      where,
      include: {
        openExecution: true,
        closeExecution: true,
      },
      orderBy: [{ closeExecution: { tradeDate: "desc" } }, { createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const data: MatchedLotRecord[] = rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    symbol: row.openExecution.symbol,
    underlyingSymbol: row.openExecution.underlyingSymbol,
    openTradeDate: row.openExecution.tradeDate.toISOString(),
    closeTradeDate: row.closeExecution?.tradeDate.toISOString() ?? null,
    openImportId: row.openExecution.importId,
    closeImportId: row.closeExecution?.importId ?? null,
    quantity: row.quantity.toString(),
    realizedPnl: row.realizedPnl.toString(),
    holdingDays: row.holdingDays,
    outcome: row.outcome,
    openExecutionId: row.openExecutionId,
    closeExecutionId: row.closeExecutionId,
  }));

  return listResponse(data, { total, page, pageSize });
}
