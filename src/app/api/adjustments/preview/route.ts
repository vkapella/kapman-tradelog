import { parsePayloadByType } from "@/lib/adjustments/types";
import { detailResponse, errorResponse } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import { computeOpenPositions } from "@/lib/positions/compute-open-positions";
import type { AdjustmentPreviewResponse, AdjustmentType, ExecutionRecord, ManualAdjustmentRecord, MatchedLotRecord } from "@/types/api";

function mapExecution(row: {
  id: string;
  accountId: string;
  broker: string;
  symbol: string;
  tradeDate: Date;
  eventTimestamp: Date;
  eventType: string;
  assetClass: string;
  side: string | null;
  quantity: { toString: () => string };
  price: { toString: () => string } | null;
  openingClosingEffect: string | null;
  instrumentKey: string | null;
  underlyingSymbol: string | null;
  optionType: string | null;
  strike: { toString: () => string } | null;
  expirationDate: Date | null;
  spreadGroupId: string | null;
  importId: string;
}): ExecutionRecord {
  return {
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
    openingClosingEffect: row.openingClosingEffect,
    instrumentKey: row.instrumentKey,
    underlyingSymbol: row.underlyingSymbol,
    optionType: row.optionType,
    strike: row.strike?.toString() ?? null,
    expirationDate: row.expirationDate?.toISOString() ?? null,
    spreadGroupId: row.spreadGroupId,
    importId: row.importId,
  };
}

function mapMatchedLot(row: {
  id: string;
  accountId: string;
  openExecutionId: string;
  closeExecutionId: string | null;
  quantity: { toString: () => string };
  realizedPnl: { toString: () => string };
  holdingDays: number;
  outcome: string;
  openExecution: { symbol: string; tradeDate: Date; importId: string };
  closeExecution: { tradeDate: Date; importId: string } | null;
}): MatchedLotRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    symbol: row.openExecution.symbol,
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
  };
}

function summarizeForAdjustment(
  adjustmentType: AdjustmentType,
  symbol: string,
  payload: unknown,
  positions: ReturnType<typeof computeOpenPositions>,
) {
  if (adjustmentType === "SPLIT") {
    const relevant = positions.filter((position) => position.assetClass === "EQUITY" && position.symbol.toUpperCase() === symbol.toUpperCase());
    const openQty = relevant.reduce((sum, row) => sum + row.netQty, 0);
    const grossCost = relevant.reduce((sum, row) => sum + row.costBasis, 0);
    const costBasisPerShare = openQty !== 0 ? grossCost / openQty : null;
    return { openQty, grossCost, costBasisPerShare };
  }

  if (adjustmentType === "QTY_OVERRIDE" || adjustmentType === "PRICE_OVERRIDE" || adjustmentType === "ADD_POSITION" || adjustmentType === "REMOVE_POSITION") {
    const parsed = parsePayloadByType(adjustmentType, payload);
    if (!("instrumentKey" in parsed)) {
      return { openQty: 0, grossCost: 0, costBasisPerShare: null };
    }
    const relevant = positions.filter((position) => position.instrumentKey === parsed.instrumentKey);
    const openQty = relevant.reduce((sum, row) => sum + row.netQty, 0);
    const grossCost = relevant.reduce((sum, row) => sum + row.costBasis, 0);
    const multiplier = relevant[0]?.assetClass === "OPTION" ? 100 : 1;
    const costBasisPerShare = openQty !== 0 ? grossCost / (openQty * multiplier) : null;
    return { openQty, grossCost, costBasisPerShare };
  }

  return { openQty: 0, grossCost: 0, costBasisPerShare: null };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId");
  const symbol = url.searchParams.get("symbol");
  const effectiveDate = url.searchParams.get("effectiveDate");
  const adjustmentTypeRaw = url.searchParams.get("adjustmentType");
  const payloadRaw = url.searchParams.get("payload");

  if (!accountId || !symbol || !effectiveDate || !adjustmentTypeRaw || !payloadRaw) {
    return errorResponse("MISSING_PARAMS", "Missing preview params.", [
      "accountId, symbol, effectiveDate, adjustmentType, and payload are required.",
    ]);
  }

  const adjustmentType = ["SPLIT", "QTY_OVERRIDE", "PRICE_OVERRIDE", "ADD_POSITION", "REMOVE_POSITION"].includes(adjustmentTypeRaw)
    ? (adjustmentTypeRaw as AdjustmentType)
    : null;
  if (!adjustmentType) {
    return errorResponse("INVALID_TYPE", "Invalid adjustmentType.", [`Unsupported adjustment type: ${adjustmentTypeRaw}`]);
  }

  let payloadInput: unknown;
  try {
    payloadInput = JSON.parse(payloadRaw);
  } catch {
    return errorResponse("INVALID_PAYLOAD_JSON", "payload must be valid JSON.", ["Unable to parse payload query param as JSON."]);
  }

  let payload;
  try {
    payload = parsePayloadByType(adjustmentType, payloadInput);
  } catch (error) {
    return errorResponse("INVALID_PAYLOAD", "Payload does not match adjustment type.", [
      error instanceof Error ? error.message : "Unknown payload validation error.",
    ]);
  }

  const [executionsRows, matchedLotRows, adjustmentRows] = await Promise.all([
    prisma.execution.findMany({
      where: { accountId },
      orderBy: [{ eventTimestamp: "asc" }, { id: "asc" }],
    }),
    prisma.matchedLot.findMany({
      where: { accountId },
      include: {
        openExecution: { select: { symbol: true, tradeDate: true, importId: true } },
        closeExecution: { select: { tradeDate: true, importId: true } },
      },
      orderBy: [{ id: "asc" }],
    }),
    prisma.manualAdjustment.findMany({
      where: {
        accountId,
        status: "ACTIVE",
      },
      include: { account: { select: { accountId: true } } },
      orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const executions = executionsRows.map(mapExecution);
  const matchedLots = matchedLotRows.map(mapMatchedLot);

  const existingAdjustments: ManualAdjustmentRecord[] = adjustmentRows.map((row) => ({
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
  }));

  const before = computeOpenPositions(executions, matchedLots, existingAdjustments);

  const previewAdjustment: ManualAdjustmentRecord = {
    id: "preview-adjustment",
    createdAt: new Date().toISOString(),
    createdBy: "preview",
    accountId,
    accountExternalId: accountId,
    symbol: symbol.toUpperCase(),
    effectiveDate: new Date(effectiveDate).toISOString(),
    adjustmentType,
    payload,
    reason: "Preview",
    evidenceRef: null,
    status: "ACTIVE",
    reversedByAdjustmentId: null,
  };

  const after = computeOpenPositions(executions, matchedLots, [...existingAdjustments, previewAdjustment]);

  const beforeSummary = summarizeForAdjustment(adjustmentType, symbol, payload, before);
  const afterSummary = summarizeForAdjustment(adjustmentType, symbol, payload, after);

  const effectiveTime = new Date(effectiveDate).getTime();
  const affectedExecutionCount =
    adjustmentType === "SPLIT"
      ? executions.filter(
          (row) =>
            row.accountId === accountId &&
            row.assetClass === "EQUITY" &&
            row.symbol.toUpperCase() === symbol.toUpperCase() &&
            new Date(row.tradeDate).getTime() < effectiveTime,
        ).length
      : 0;

  const result: AdjustmentPreviewResponse = {
    symbol: symbol.toUpperCase(),
    adjustmentType,
    before: {
      openQty: beforeSummary.openQty,
      costBasisPerShare: beforeSummary.costBasisPerShare,
      grossCost: beforeSummary.grossCost,
    },
    after: {
      openQty: afterSummary.openQty,
      costBasisPerShare: afterSummary.costBasisPerShare,
      grossCost: afterSummary.grossCost,
    },
    affectedExecutionCount,
    effectiveDate: new Date(effectiveDate).toISOString(),
  };

  return detailResponse(result);
}
