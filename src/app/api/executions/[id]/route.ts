import { parseAccountIds } from "@/lib/api/account-scope";
import { detailResponse, errorResponse } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import type { ExecutionDetailRecord } from "@/types/api";

export async function GET(request: Request, context: { params: { id: string } }) {
  const url = new URL(request.url);
  const accountIds = parseAccountIds(url.searchParams.get("accountIds"));
  const execution = await prisma.execution.findUnique({
    where: { id: context.params.id },
    include: { account: { select: { accountId: true } } },
  });

  if (!execution) {
    return errorResponse("NOT_FOUND", "Execution not found.", [`Execution ${context.params.id} does not exist.`], 404);
  }
  if (accountIds.length > 0 && !accountIds.includes(execution.accountId) && !accountIds.includes(execution.account.accountId)) {
    return errorResponse("NOT_FOUND", "Execution not found.", [`Execution ${context.params.id} does not exist.`], 404);
  }

  const payload: ExecutionDetailRecord = {
    id: execution.id,
    accountId: execution.accountId,
    broker: execution.broker,
    symbol: execution.symbol,
    tradeDate: execution.tradeDate.toISOString(),
    eventTimestamp: execution.eventTimestamp.toISOString(),
    eventType: execution.eventType,
    assetClass: execution.assetClass,
    side: execution.side,
    quantity: execution.quantity.toString(),
    price: execution.price?.toString() ?? null,
    openingClosingEffect: execution.openingClosingEffect ?? null,
    instrumentKey: execution.instrumentKey,
    underlyingSymbol: execution.underlyingSymbol,
    optionType: execution.optionType,
    strike: execution.strike?.toString() ?? null,
    expirationDate: execution.expirationDate?.toISOString() ?? null,
    spreadGroupId: execution.spreadGroupId,
    importId: execution.importId,
    rawRowJson: execution.rawRowJson,
  };

  return detailResponse(payload);
}
