import { Prisma } from "@prisma/client";
import { applyExecutionQtyOverrideToLedgerExecutions } from "@/lib/adjustments/execution-qty-overrides";
import { applySplitAdjustmentsToLedgerExecutions } from "@/lib/adjustments/split-ledger-executions";
import { parsePayloadByType } from "@/lib/adjustments/types";
import { detailResponse, errorResponse } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import { deriveInstrumentKeyFromPersistedExecution } from "@/lib/ledger/instrument-key";
import { runFifoMatcher, type LedgerExecution } from "@/lib/ledger/fifo-matcher";
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

function toNumber(value: Prisma.Decimal | null): number | null {
  if (value === null) {
    return null;
  }
  return Number(value);
}

function toLedgerExecution(row: {
  id: string;
  importId: string;
  accountId: string;
  broker: "SCHWAB_THINKORSWIM" | "FIDELITY";
  eventTimestamp: Date;
  tradeDate: Date;
  eventType: "TRADE" | "EXPIRATION_INFERRED" | "ASSIGNMENT" | "EXERCISE";
  assetClass: "EQUITY" | "OPTION" | "CASH" | "OTHER";
  symbol: string;
  instrumentKey: string | null;
  underlyingSymbol: string | null;
  side: "BUY" | "SELL" | null;
  quantity: Prisma.Decimal;
  price: Prisma.Decimal | null;
  openingClosingEffect: "TO_OPEN" | "TO_CLOSE" | "UNKNOWN" | null;
  expirationDate: Date | null;
  optionType: string | null;
  strike: Prisma.Decimal | null;
}): LedgerExecution | null {
  if (row.eventType === "EXPIRATION_INFERRED" || !row.side) {
    return null;
  }

  const quantity = Number(row.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  return {
    id: row.id,
    importId: row.importId,
    accountId: row.accountId,
    broker: row.broker,
    eventTimestamp: row.eventTimestamp,
    tradeDate: row.tradeDate,
    eventType: row.eventType,
    assetClass: row.assetClass,
    symbol: row.symbol,
    underlyingSymbol: row.underlyingSymbol,
    instrumentKey: deriveInstrumentKeyFromPersistedExecution(row),
    side: row.side,
    quantity,
    price: toNumber(row.price),
    openingClosingEffect: row.openingClosingEffect ?? "UNKNOWN",
    expirationDate: row.expirationDate,
    optionType: row.optionType,
    strike: toNumber(row.strike),
  };
}

function sumRealizedPnl(matchedLots: Array<{ realizedPnl: number }>): number {
  return matchedLots.reduce((sum, lot) => sum + lot.realizedPnl, 0);
}

const EPSILON = 1e-9;

function numbersDiffer(left: number, right: number): boolean {
  return Math.abs(left - right) > EPSILON;
}

function nullableNumbersDiffer(left: number | null, right: number | null): boolean {
  if (left === null || right === null) {
    return left !== right;
  }
  return numbersDiffer(left, right);
}

function splitChangedLedgerExecution(before: LedgerExecution, after: LedgerExecution): boolean {
  return (
    numbersDiffer(before.quantity, after.quantity) ||
    nullableNumbersDiffer(before.price, after.price) ||
    nullableNumbersDiffer(before.strike, after.strike) ||
    before.instrumentKey !== after.instrumentKey
  );
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

  const adjustmentType = ["SPLIT", "QTY_OVERRIDE", "PRICE_OVERRIDE", "ADD_POSITION", "REMOVE_POSITION", "EXECUTION_QTY_OVERRIDE"].includes(
    adjustmentTypeRaw,
  )
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

  const existingAdjustments: ManualAdjustmentRecord[] = adjustmentRows.flatMap((row) => {
    try {
      return [
        {
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
        } satisfies ManualAdjustmentRecord,
      ];
    } catch {
      return [];
    }
  });

  const warnings: string[] = [];
  let resolvedSymbol = symbol.toUpperCase();
  let resolvedEffectiveDate = new Date(effectiveDate).toISOString();
  let executionQtyOverridePreview: AdjustmentPreviewResponse["executionQtyOverridePreview"] | undefined;

  if (adjustmentType === "EXECUTION_QTY_OVERRIDE") {
    const executionPayload = parsePayloadByType("EXECUTION_QTY_OVERRIDE", payload);
    const targetExecution = executionsRows.find((row) => row.id === executionPayload.executionId && row.accountId === accountId);
    if (!targetExecution) {
      return errorResponse("EXECUTION_NOT_FOUND", "Execution not found.", [
        `Execution ${executionPayload.executionId} does not exist for this account.`,
      ]);
    }

    resolvedSymbol = targetExecution.symbol.toUpperCase();
    resolvedEffectiveDate = targetExecution.tradeDate.toISOString();

    const rawQty = Number(targetExecution.quantity);
    if (Number.isFinite(rawQty) && rawQty === executionPayload.overrideQty) {
      warnings.push("Override qty equals the raw execution qty; this is a no-op.");
    }
  }

  const previewAdjustment: ManualAdjustmentRecord = {
    id: "preview-adjustment",
    createdAt: new Date().toISOString(),
    createdBy: "preview",
    accountId,
    accountExternalId: accountId,
    symbol: resolvedSymbol,
    effectiveDate: resolvedEffectiveDate,
    adjustmentType,
    payload,
    reason: "Preview",
    evidenceRef: null,
    status: "ACTIVE",
    reversedByAdjustmentId: null,
  };

  const before = computeOpenPositions(executions, matchedLots, existingAdjustments);
  const after = computeOpenPositions(executions, matchedLots, [...existingAdjustments, previewAdjustment]);

  const beforeSummary = summarizeForAdjustment(adjustmentType, resolvedSymbol, payload, before);
  const afterSummary = summarizeForAdjustment(adjustmentType, resolvedSymbol, payload, after);

  let affectedExecutionCount =
    adjustmentType === "SPLIT"
      ? executionsRows
          .flatMap((row) => {
            const candidate = toLedgerExecution(row);
            return candidate ? [candidate] : [];
          })
          .filter((execution) => {
            const beforeAdjusted = applySplitAdjustmentsToLedgerExecutions([execution], existingAdjustments)[0];
            const afterAdjusted = applySplitAdjustmentsToLedgerExecutions([execution], [...existingAdjustments, previewAdjustment])[0];
            if (!beforeAdjusted || !afterAdjusted) {
              return false;
            }

            return splitChangedLedgerExecution(beforeAdjusted, afterAdjusted);
          }).length
      : 0;

  if (adjustmentType === "EXECUTION_QTY_OVERRIDE") {
    const executionPayload = parsePayloadByType("EXECUTION_QTY_OVERRIDE", payload);
    const targetExecution = executionsRows.find((row) => row.id === executionPayload.executionId && row.accountId === accountId);
    if (!targetExecution) {
      return errorResponse("EXECUTION_NOT_FOUND", "Execution not found.", [
        `Execution ${executionPayload.executionId} does not exist for this account.`,
      ]);
    }

    const matcherInput = executionsRows.flatMap((row) => {
      const mapped = toLedgerExecution(row);
      return mapped ? [mapped] : [];
    });
    const beforeSplitAdjusted = applySplitAdjustmentsToLedgerExecutions(matcherInput, existingAdjustments);
    const afterSplitAdjusted = applySplitAdjustmentsToLedgerExecutions(matcherInput, [...existingAdjustments, previewAdjustment]);
    const beforeOverrideResult = applyExecutionQtyOverrideToLedgerExecutions(beforeSplitAdjusted, existingAdjustments);
    const afterOverrideResult = applyExecutionQtyOverrideToLedgerExecutions(afterSplitAdjusted, [...existingAdjustments, previewAdjustment]);
    const beforeFifo = runFifoMatcher(beforeOverrideResult.executions, new Date());
    const afterFifo = runFifoMatcher(afterOverrideResult.executions, new Date());
    const rawQty = Number(targetExecution.quantity);
    const fallbackQty = Number.isFinite(rawQty) ? rawQty : 0;

    const beforeEffectiveQty = beforeOverrideResult.overrideMap.get(executionPayload.executionId)?.overrideQty ?? fallbackQty;
    const afterEffectiveQty = afterOverrideResult.overrideMap.get(executionPayload.executionId)?.overrideQty ?? fallbackQty;
    const beforeAffectedMatchedLots = beforeFifo.matchedLots.filter(
      (lot) => lot.openExecutionId === executionPayload.executionId || lot.closeExecutionId === executionPayload.executionId,
    ).length;
    const afterAffectedMatchedLots = afterFifo.matchedLots.filter(
      (lot) => lot.openExecutionId === executionPayload.executionId || lot.closeExecutionId === executionPayload.executionId,
    ).length;
    const beforeRealizedPnl = sumRealizedPnl(beforeFifo.matchedLots);
    const afterRealizedPnl = sumRealizedPnl(afterFifo.matchedLots);

    executionQtyOverridePreview = {
      executionId: executionPayload.executionId,
      rawQty: fallbackQty,
      beforeEffectiveQty,
      afterEffectiveQty,
      beforeAffectedMatchedLots,
      afterAffectedMatchedLots,
      beforeRealizedPnl,
      afterRealizedPnl,
      beforeUnexplainedDeltaImpact: beforeRealizedPnl * -1,
      afterUnexplainedDeltaImpact: afterRealizedPnl * -1,
    };
    affectedExecutionCount = 1;
  }

  const result: AdjustmentPreviewResponse = {
    symbol: resolvedSymbol,
    adjustmentType,
    warnings,
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
    effectiveDate: resolvedEffectiveDate,
    executionQtyOverridePreview,
  };

  return detailResponse(result);
}
