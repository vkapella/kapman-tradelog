import { detailResponse } from "@/lib/api/responses";
import { inferSetupGroups, type SetupInferenceLot } from "@/lib/analytics/setup-inference";
import { prisma } from "@/lib/db/prisma";
import type { DiagnosticsResponse } from "@/types/api";

export async function GET() {
  const [imports, matchedCount, closeCandidateCount, syntheticExpirationCount, matchedLots] = await Promise.all([
    prisma.import.findMany({ select: { warnings: true, parsedRows: true, skippedRows: true } }),
    prisma.matchedLot.count(),
    prisma.execution.count({
      where: {
        OR: [
          { openingClosingEffect: "TO_CLOSE" },
          { eventType: "ASSIGNMENT" },
          { eventType: "EXERCISE" },
          { eventType: "EXPIRATION_INFERRED" },
        ],
      },
    }),
    prisma.execution.count({ where: { eventType: "EXPIRATION_INFERRED" } }),
    prisma.matchedLot.findMany({
      include: {
        openExecution: true,
        closeExecution: true,
      },
      orderBy: [{ openExecution: { tradeDate: "asc" } }, { id: "asc" }],
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

  const payload: DiagnosticsResponse = {
    parseCoverage: totalRows === 0 ? 1 : parsedRows / totalRows,
    unsupportedRowCount: skippedRows,
    matchingCoverage: closeCandidateCount === 0 ? 1 : Math.min(1, matchedCount / closeCandidateCount),
    uncategorizedCount: setupInference.setupInferenceUncategorizedTotal,
    warningsCount,
    syntheticExpirationCount,
    warningSamples,
    setupInference,
  };

  return detailResponse(payload);
}
