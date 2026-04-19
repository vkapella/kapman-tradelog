import { Prisma } from "@prisma/client";
import { parsePayloadByType } from "@/lib/adjustments/types";
import { buildAccountScopeWhere, parseAccountIds } from "@/lib/api/account-scope";
import { detailResponse } from "@/lib/api/responses";
import { loadAccountBalanceContext } from "@/lib/accounts/account-balance-context";
import { buildInferenceLots } from "@/lib/analytics/inference-lot-builder";
import { inferSetupGroups } from "@/lib/analytics/setup-inference";
import { prisma } from "@/lib/db/prisma";
import {
  buildAccountInstrumentKey,
  groupSetupInferenceSamples,
  groupWarningRecords,
  type StoredDiagnosticWarning,
} from "@/lib/diagnostics/case-file";
import { computeOpenPositionsWithDiagnostics } from "@/lib/positions/compute-open-positions";
import type { DiagnosticsResponse, ExecutionRecord, ManualAdjustmentRecord, MatchedLotRecord } from "@/types/api";

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
  openExecution: { symbol: string; underlyingSymbol: string | null; tradeDate: Date; importId: string };
  closeExecution: { tradeDate: Date; importId: string } | null;
}): MatchedLotRecord {
  return {
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
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const accountIds = parseAccountIds(url.searchParams.get("accountIds"));
  const accountScope = buildAccountScopeWhere(accountIds);
  const executionAccountScope = accountScope as Prisma.ExecutionWhereInput | undefined;
  const importAccountScope = accountScope as Prisma.ImportWhereInput | undefined;
  const matchedLotAccountScope = accountScope as Prisma.MatchedLotWhereInput | undefined;
  const adjustmentAccountScope = accountScope as Prisma.ManualAdjustmentWhereInput | undefined;

  const closeCandidateWhere: Prisma.ExecutionWhereInput = {
    OR: [
      { openingClosingEffect: "TO_CLOSE" },
      { eventType: "ASSIGNMENT" },
      { eventType: "EXERCISE" },
      { eventType: "EXPIRATION_INFERRED" },
    ],
  };

  const [imports, syntheticExecutions, matchedLots, closeCandidates, executionRows, adjustmentRows, accountCash] =
    await Promise.all([
    prisma.import.findMany({
      where: importAccountScope,
      select: { accountId: true, warnings: true, parsedRows: true, skippedRows: true },
    }),
    prisma.execution.findMany({
      where: {
        AND: [{ eventType: "EXPIRATION_INFERRED" }, ...(executionAccountScope ? [executionAccountScope] : [])],
      },
      select: { id: true, accountId: true, instrumentKey: true },
      orderBy: [{ tradeDate: "desc" }, { id: "desc" }],
    }),
    prisma.matchedLot.findMany({
      where: matchedLotAccountScope,
      include: {
        openExecution: true,
        closeExecution: true,
      },
      orderBy: [{ openExecution: { tradeDate: "asc" } }, { id: "asc" }],
    }),
    prisma.execution.findMany({
      where: {
        AND: [closeCandidateWhere, ...(executionAccountScope ? [executionAccountScope] : [])],
      },
      select: {
        id: true,
        accountId: true,
        symbol: true,
        instrumentKey: true,
        eventType: true,
        tradeDate: true,
        quantity: true,
        side: true,
      },
      orderBy: [{ tradeDate: "desc" }, { id: "desc" }],
    }),
    prisma.execution.findMany({
      where: executionAccountScope,
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
      orderBy: [{ eventTimestamp: "asc" }, { id: "asc" }],
    }),
    prisma.manualAdjustment.findMany({
      where: {
        AND: [
          ...(adjustmentAccountScope ? [adjustmentAccountScope] : []),
          {
            status: "ACTIVE",
            adjustmentType: {
              in: ["SPLIT", "QTY_OVERRIDE", "PRICE_OVERRIDE", "ADD_POSITION", "REMOVE_POSITION", "EXECUTION_QTY_OVERRIDE", "EXECUTION_PRICE_OVERRIDE"],
            },
          },
        ],
      },
      include: {
        account: {
          select: {
            accountId: true,
          },
        },
      },
      orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
    loadAccountBalanceContext(accountIds),
  ]);

  const parsedRows = imports.reduce((sum, row) => sum + row.parsedRows, 0);
  const skippedRows = imports.reduce((sum, row) => sum + row.skippedRows, 0);
  const warningSamples: string[] = [];
  const storedWarnings: StoredDiagnosticWarning[] = [];
  let warningsCount = 0;
  for (const row of imports) {
    if (!Array.isArray(row.warnings)) {
      continue;
    }

    for (const warning of row.warnings) {
      if (typeof warning !== "object" || warning === null || !("message" in warning)) {
        continue;
      }

      const code = "code" in warning ? String(warning.code) : "WARNING";
      if (code === "CANCEL_REBOOK") {
        continue;
      }

      warningsCount += 1;
      const message = String(warning.message);
      if (warningSamples.length < 10) {
        warningSamples.push(message);
      }

      storedWarnings.push({
        code,
        message,
        accountId: row.accountId,
        rowRef: "rowRef" in warning && warning.rowRef !== undefined ? String(warning.rowRef) : undefined,
      });
    }
  }

  const manualAdjustments: ManualAdjustmentRecord[] = adjustmentRows.flatMap((row) => {
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

  const openPositionDiagnostics = computeOpenPositionsWithDiagnostics(
    executionRows.map(mapExecution),
    matchedLots.map(mapMatchedLot),
    manualAdjustments,
  );
  for (const warning of openPositionDiagnostics.warnings) {
    warningsCount += 1;
    if (warningSamples.length < 10) {
      warningSamples.push(warning.message);
    }

    storedWarnings.push({
      code: warning.code,
      message: warning.message,
      accountId: warning.accountId,
      rowRef: warning.adjustmentId,
    });
  }

  const totalRows = parsedRows + skippedRows;
  const lotsByAccount = new Map<string, typeof matchedLots>();
  for (const lot of matchedLots) {
    const accountLots = lotsByAccount.get(lot.accountId) ?? [];
    accountLots.push(lot);
    lotsByAccount.set(lot.accountId, accountLots);
  }

  const allInferenceLots = (
    await Promise.all(
      Array.from(lotsByAccount.entries()).map(([accountId, lots]) => buildInferenceLots(prisma, accountId, lots)),
    )
  ).flat();
  const setupInference = inferSetupGroups(allInferenceLots).diagnostics;
  const matchedCount = matchedLots.length;
  const executionQtyOverrideMap = new Map<string, number>();
  for (const adjustment of manualAdjustments) {
    if (adjustment.status !== "ACTIVE" || adjustment.adjustmentType !== "EXECUTION_QTY_OVERRIDE") {
      continue;
    }

    const payload = adjustment.payload as { executionId?: string; overrideQty?: number };
    const overrideQty = payload.overrideQty;
    if (!payload.executionId || typeof overrideQty !== "number" || !Number.isFinite(overrideQty)) {
      continue;
    }

    executionQtyOverrideMap.set(payload.executionId, overrideQty);
  }

  const effectiveCloseCandidates = closeCandidates
    .map((execution) => {
      const rawQty = Number(execution.quantity);
      const effectiveQty = executionQtyOverrideMap.get(execution.id) ?? rawQty;
      return {
        ...execution,
        effectiveQty,
      };
    })
    .filter((execution) => Number.isFinite(execution.effectiveQty) && execution.effectiveQty > 0);

  const closeCandidateCount = effectiveCloseCandidates.length;
  const matchedCloseExecutionIds = new Set(
    matchedLots
      .map((lot) => lot.closeExecutionId)
      .filter((closeExecutionId): closeExecutionId is string => closeExecutionId !== null),
  );

  const unmatchedCloseExecutions = effectiveCloseCandidates
    .filter((execution) => !matchedCloseExecutionIds.has(execution.id))
    .slice(0, 25)
    .map((execution) => ({
      id: execution.id,
      symbol: execution.symbol,
      tradeDate: execution.tradeDate.toISOString(),
      qty: String(execution.effectiveQty),
      side: execution.side,
    }));
  const unmatchedCloseExecutionIdByAccountInstrumentKey = new Map(
    effectiveCloseCandidates
      .filter((execution) => !matchedCloseExecutionIds.has(execution.id) && execution.instrumentKey)
      .map((execution) => [buildAccountInstrumentKey(execution.accountId, execution.instrumentKey as string), execution.id]),
  );
  const syntheticExecutionIdByAccountInstrumentKey = new Map(
    syntheticExecutions
      .filter((execution) => execution.instrumentKey)
      .map((execution) => [buildAccountInstrumentKey(execution.accountId, execution.instrumentKey as string), execution.id]),
  );
  const warningGroups = groupWarningRecords(storedWarnings, {
    unmatchedCloseExecutionIdByAccountInstrumentKey,
    syntheticExecutionIdByAccountInstrumentKey,
  });
  const setupInferenceGroups = groupSetupInferenceSamples(setupInference.setupInferenceSamples);

  const partialMatchCount = matchedLots.reduce((count, lot) => {
    if (!lot.closeExecution) {
      return count;
    }

    const openQty = Number(lot.openExecution.quantity);
    const closeQty = Number(lot.closeExecution.quantity);
    return openQty !== closeQty ? count + 1 : count;
  }, 0);

  const duplicateSnapshotDateCount = storedWarnings.filter(
    (warning) => warning.code === "CASH_BALANCE_DUPLICATE_SNAPSHOT_DATE",
  ).length;
  const skippedNonCashSections = {
    forex: storedWarnings.filter((warning) => warning.code === "CASH_BALANCE_SKIPPED_FOREX_SECTION").length,
    futures: storedWarnings.filter((warning) => warning.code === "CASH_BALANCE_SKIPPED_FUTURES_SECTION").length,
    crypto: storedWarnings.filter((warning) => warning.code === "CASH_BALANCE_SKIPPED_CRYPTO_SECTION").length,
  };

  const payload: DiagnosticsResponse = {
    parseCoverage: totalRows === 0 ? 1 : parsedRows / totalRows,
    unsupportedRowCount: skippedRows,
    matchingCoverage: closeCandidateCount === 0 ? 1 : matchedCloseExecutionIds.size / closeCandidateCount,
    unmatchedCloseCount: Math.max(0, closeCandidateCount - matchedCloseExecutionIds.size),
    partialMatchCount,
    unmatchedCloseExecutions,
    uncategorizedCount: setupInference.setupInferenceUncategorizedTotal,
    warningsCount,
    syntheticExpirationCount: syntheticExecutions.length,
    accountCash: accountCash.map((account) => ({
      accountId: account.accountExternalId,
      cashSource: account.cashSource,
      cashAsOf: account.cashAsOf,
    })),
    duplicateSnapshotDateCount,
    skippedNonCashSections,
    warningSamples,
    warningGroups,
    setupInferenceGroups,
    setupInference,
  };

  return detailResponse(payload);
}
