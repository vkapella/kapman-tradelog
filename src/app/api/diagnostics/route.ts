import { detailResponse } from "@/lib/api/responses";
import { inferSetupGroups, type SetupInferenceLot } from "@/lib/analytics/setup-inference";
import { prisma } from "@/lib/db/prisma";
import type { DiagnosticsResponse } from "@/types/api";

export async function GET() {
  const closeCandidateWhere = {
    OR: [
      { openingClosingEffect: "TO_CLOSE" as const },
      { eventType: "ASSIGNMENT" as const },
      { eventType: "EXERCISE" as const },
      { eventType: "EXPIRATION_INFERRED" as const },
    ],
  };

  const [imports, syntheticExpirationCount, matchedLots, closeCandidates] = await Promise.all([
    prisma.import.findMany({ select: { warnings: true, parsedRows: true, skippedRows: true } }),
    prisma.execution.count({ where: { eventType: "EXPIRATION_INFERRED" } }),
    prisma.matchedLot.findMany({
      include: {
        openExecution: true,
        closeExecution: true,
      },
      orderBy: [{ openExecution: { tradeDate: "asc" } }, { id: "asc" }],
    }),
    prisma.execution.findMany({
      where: closeCandidateWhere,
      select: {
        id: true,
        symbol: true,
        tradeDate: true,
        quantity: true,
        side: true,
      },
      orderBy: [{ tradeDate: "desc" }, { id: "desc" }],
    }),
  ]);

  const parsedRows = imports.reduce((sum, row) => sum + row.parsedRows, 0);
  const skippedRows = imports.reduce((sum, row) => sum + row.skippedRows, 0);
  const warningSamples: string[] = [];
  const warningsCount = imports.reduce((sum, row) => {
    if (Array.isArray(row.warnings)) {
      for (const warning of row.warnings) {
        if (typeof warning === "object" && warning !== null && "message" in warning) {
          const message = String(warning.message);
          if (warningSamples.length < 10) {
            warningSamples.push(message);
          }
        }
      }
      return sum + row.warnings.length;
    }
    return sum;
  }, 0);

  const totalRows = parsedRows + skippedRows;
  const inferenceLots: SetupInferenceLot[] = matchedLots.map((lot) => ({
    id: lot.id,
    accountId: lot.accountId,
    symbol: lot.openExecution.symbol,
    underlyingSymbol: lot.openExecution.underlyingSymbol ?? lot.openExecution.symbol,
    openTradeDate: lot.openExecution.tradeDate,
    closeTradeDate: lot.closeExecution?.tradeDate ?? null,
    realizedPnl: Number(lot.realizedPnl),
    holdingDays: lot.holdingDays,
    openAssetClass: lot.openExecution.assetClass,
    openSide: lot.openExecution.side,
    optionType: lot.openExecution.optionType,
    strike: lot.openExecution.strike ? Number(lot.openExecution.strike) : null,
    expirationDate: lot.openExecution.expirationDate,
    openSpreadGroupId: lot.openExecution.spreadGroupId,
  }));
  const setupInference = inferSetupGroups(inferenceLots).diagnostics;
  const matchedCount = matchedLots.length;
  const closeCandidateCount = closeCandidates.length;
  const matchedCloseExecutionIds = new Set(
    matchedLots
      .map((lot) => lot.closeExecutionId)
      .filter((closeExecutionId): closeExecutionId is string => closeExecutionId !== null),
  );

  const unmatchedCloseExecutions = closeCandidates
    .filter((execution) => !matchedCloseExecutionIds.has(execution.id))
    .slice(0, 25)
    .map((execution) => ({
      id: execution.id,
      symbol: execution.symbol,
      tradeDate: execution.tradeDate.toISOString(),
      qty: execution.quantity.toString(),
      side: execution.side,
    }));

  const partialMatchCount = matchedLots.reduce((count, lot) => {
    if (!lot.closeExecution) {
      return count;
    }

    const openQty = Number(lot.openExecution.quantity);
    const closeQty = Number(lot.closeExecution.quantity);
    return openQty !== closeQty ? count + 1 : count;
  }, 0);

  const payload: DiagnosticsResponse = {
    parseCoverage: totalRows === 0 ? 1 : parsedRows / totalRows,
    unsupportedRowCount: skippedRows,
    matchingCoverage: closeCandidateCount === 0 ? 1 : matchedCount / closeCandidateCount,
    unmatchedCloseCount: Math.max(0, closeCandidateCount - matchedCount),
    partialMatchCount,
    unmatchedCloseExecutions,
    uncategorizedCount: setupInference.setupInferenceUncategorizedTotal,
    warningsCount,
    syntheticExpirationCount,
    warningSamples,
    setupInference,
  };

  return detailResponse(payload);
}
