import { detailResponse } from "@/lib/api/responses";
import { parseAccountIds } from "@/lib/api/account-scope";
import { parsePayloadByType } from "@/lib/adjustments/types";
import { prisma } from "@/lib/db/prisma";
import { getEquityQuotes, getOptionQuotesBatch } from "@/lib/mcp/market-data";
import { computeOpenPositions } from "@/lib/positions/compute-open-positions";
import { normalizePositionSnapshotAccountIds, resolvePositionSnapshotAccountIds } from "@/lib/positions/position-snapshot";
import { buildPortfolioSnapshot, type PricedOpenPosition } from "@/lib/export/build-portfolio-snapshot";
import type {
  EquityQuoteRecord,
  ExecutionRecord,
  ManualAdjustmentRecord,
  MatchedLotRecord,
} from "@/types/api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedAccountIds = normalizePositionSnapshotAccountIds(parseAccountIds(url.searchParams.get("accountIds")));
  const accountIds = await resolvePositionSnapshotAccountIds(requestedAccountIds);
  const accountScope = accountIds.length > 0 ? ({ accountId: { in: accountIds } } as const) : undefined;
  const now = new Date().toISOString();

  const [accountRows, executionRows, matchedLotRows, adjustmentRows] = await Promise.all([
    prisma.account.findMany({
      where: accountIds.length > 0 ? { id: { in: accountIds } } : undefined,
      select: { id: true, accountId: true },
    }),
    prisma.execution.findMany({
      where: accountScope,
      select: {
        id: true,
        accountId: true,
        broker: true,
        symbol: true,
        tradeDate: true,
        eventTimestamp: true,
        eventType: true,
        assetClass: true,
        side: true,
        quantity: true,
        price: true,
        openingClosingEffect: true,
        instrumentKey: true,
        underlyingSymbol: true,
        optionType: true,
        strike: true,
        expirationDate: true,
        spreadGroupId: true,
        importId: true,
      },
    }),
    // Loaded only so computeOpenPositions can net closed quantity out of the open legs; not serialized.
    prisma.matchedLot.findMany({
      where: accountScope,
      include: {
        openExecution: { select: { symbol: true, tradeDate: true, importId: true } },
      },
    }),
    prisma.manualAdjustment.findMany({
      where: { AND: [{ status: "ACTIVE" }, ...(accountScope ? [accountScope] : [])] },
      include: { account: { select: { accountId: true } } },
    }),
  ]);

  const executions: ExecutionRecord[] = executionRows.map((row) => ({
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

  // computeOpenPositions only reads quantity + openExecutionId from matched lots.
  const matchedLotsForCompute: MatchedLotRecord[] = matchedLotRows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    symbol: row.openExecution.symbol,
    openTradeDate: row.openExecution.tradeDate.toISOString(),
    closeTradeDate: null,
    openImportId: row.openExecution.importId,
    closeImportId: null,
    quantity: row.quantity.toString(),
    realizedPnl: row.realizedPnl.toString(),
    holdingDays: row.holdingDays,
    outcome: row.outcome,
    openExecutionId: row.openExecutionId,
    closeExecutionId: row.closeExecutionId,
  }));

  const manualAdjustments: ManualAdjustmentRecord[] = [];
  for (const row of adjustmentRows) {
    try {
      manualAdjustments.push({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        createdBy: row.createdBy,
        accountId: row.accountId,
        accountExternalId: row.account.accountId,
        symbol: row.symbol,
        effectiveDate: row.effectiveDate.toISOString(),
        adjustmentType: row.adjustmentType,
        payload: parsePayloadByType(row.adjustmentType, row.payloadJson),
        reason: row.reason,
        evidenceRef: row.evidenceRef,
        status: row.status,
        reversedByAdjustmentId: row.reversedByAdjustmentId,
      });
    } catch {
      // Ignore malformed adjustment payloads in the export.
    }
  }

  const openPositions = computeOpenPositions(executions, matchedLotsForCompute, manualAdjustments);

  const equityPositions = openPositions.filter((position) => position.assetClass === "EQUITY");
  const optionPositions = openPositions.filter(
    (position) => position.assetClass === "OPTION" && position.optionType && position.expirationDate && position.strike,
  );

  const equityQuotePromise: Promise<Record<string, EquityQuoteRecord> | null> =
    equityPositions.length > 0
      ? getEquityQuotes(Array.from(new Set(equityPositions.map((position) => position.symbol))))
      : Promise.resolve(null);

  const [equityQuotes, optionQuotes] = await Promise.all([
    equityQuotePromise,
    optionPositions.length > 0
      ? getOptionQuotesBatch(
          optionPositions.map((position) => ({
            underlyingSymbol: position.underlyingSymbol,
            strike: Number(position.strike),
            expirationDate: position.expirationDate?.slice(0, 10) ?? "",
            optionType: position.optionType ?? "",
          })),
        )
      : Promise.resolve(new Map<string, number | null>()),
  ]);

  const pricedOpenPositions: PricedOpenPosition[] = openPositions.map((position) => {
    let mark: number | null = null;
    if (position.assetClass === "EQUITY") {
      mark = equityQuotes?.[position.symbol]?.mark ?? null;
    } else if (position.assetClass === "OPTION") {
      mark = optionQuotes.get(position.instrumentKey) ?? null;
    }
    return { ...position, mark };
  });

  const accountExternalIdByInternal = new Map(accountRows.map((row) => [row.id, row.accountId]));
  // Empty array signals "all accounts" (no ?accountIds= filter); otherwise the resolved scope.
  const accountExternalIds =
    requestedAccountIds.length > 0 ? accountRows.map((row) => row.accountId) : [];

  const snapshot = buildPortfolioSnapshot({
    exportedAt: now,
    asOf: now,
    accountExternalIds,
    accountExternalIdByInternal,
    pricedOpenPositions,
    executions,
  });

  return detailResponse(snapshot);
}
