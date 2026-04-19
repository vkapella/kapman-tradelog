import type { Prisma } from "@prisma/client";
import { applyExecutionQtyOverrideToLedgerExecutions } from "@/lib/adjustments/execution-qty-overrides";
import { applyExecutionPriceOverrideToLedgerExecutions } from "@/lib/adjustments/execution-price-overrides";
import { applySplitAdjustmentsToLedgerExecutions } from "@/lib/adjustments/split-ledger-executions";
import { parsePayloadByType } from "@/lib/adjustments/types";
import type { ManualAdjustmentRecord } from "@/types/api";
import { computeBrokerTxId } from "./ingest";
import { deriveInstrumentKeyFromPersistedExecution } from "./instrument-key";
import { runFifoMatcher, type LedgerExecution, type LedgerWarning } from "./fifo-matcher";

export interface RebuildAccountLedgerResult {
  matchedLotsPersisted: number;
  syntheticExecutionsPersisted: number;
  warningsCleared: number;
  warnings: LedgerWarning[];
}

export interface RebuildAccountLedgerOptions {
  executionQtyOverrides?: Array<{
    executionId: string;
    overrideQty: number;
  }>;
}

const FIDELITY_COMPACT_OPTION_SYMBOL_REGEX = /^-([A-Z]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d+(?:\.\d+)?)$/;
const LEDGER_WARNING_CODES = new Set([
  "UNMATCHED_CLOSE_QUANTITY",
  "EXECUTION_QTY_OVERRIDE_TARGET_MISSING",
  "EXECUTION_PRICE_OVERRIDE_TARGET_MISSING",
  "SYNTHETIC_EXPIRATION_INFERRED",
]);

function isWarningObject(value: unknown): value is LedgerWarning {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as { code?: unknown; message?: unknown; rowRef?: unknown };
  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    (candidate.rowRef === undefined || typeof candidate.rowRef === "string")
  );
}

function warningKey(warning: Pick<LedgerWarning, "code" | "message" | "rowRef">): string {
  return `${warning.code}::${warning.rowRef ?? ""}::${warning.message}`;
}

async function rewriteLedgerWarningsOnImports(
  tx: Prisma.TransactionClient,
  accountId: string,
  sourceExecutions: Array<{ id: string; importId: string }>,
  warnings: LedgerWarning[],
): Promise<number> {
  const importRows = await tx.import.findMany({
    where: { accountId },
    select: { id: true, warnings: true },
  });

  const importIdByExecutionId = new Map(sourceExecutions.map((execution) => [execution.id, execution.importId]));
  const newWarningsByImportId = new Map<string, LedgerWarning[]>();
  for (const warning of warnings) {
    if (!warning.rowRef) {
      continue;
    }

    const importId = importIdByExecutionId.get(warning.rowRef);
    if (!importId) {
      continue;
    }

    const existing = newWarningsByImportId.get(importId) ?? [];
    existing.push(warning);
    newWarningsByImportId.set(importId, existing);
  }

  let warningsCleared = 0;
  for (const importRow of importRows) {
    const existingWarnings: unknown[] = Array.isArray(importRow.warnings) ? importRow.warnings : [];
    const existingLedgerWarnings = existingWarnings.filter(
      (warning): warning is LedgerWarning => isWarningObject(warning) && LEDGER_WARNING_CODES.has(warning.code),
    );
    const freshWarnings = newWarningsByImportId.get(importRow.id) ?? [];

    if (existingLedgerWarnings.length === 0 && freshWarnings.length === 0) {
      continue;
    }

    const freshWarningCounts = new Map<string, number>();
    for (const warning of freshWarnings) {
      const key = warningKey(warning);
      freshWarningCounts.set(key, (freshWarningCounts.get(key) ?? 0) + 1);
    }

    for (const warning of existingLedgerWarnings) {
      const key = warningKey(warning);
      const remaining = freshWarningCounts.get(key) ?? 0;
      if (remaining > 0) {
        freshWarningCounts.set(key, remaining - 1);
        continue;
      }

      warningsCleared += 1;
    }

    const preservedWarnings = existingWarnings.filter((warning) => !isWarningObject(warning) || !LEDGER_WARNING_CODES.has(warning.code));
    await tx.import.update({
      where: { id: importRow.id },
      data: {
        warnings: [...preservedWarnings, ...freshWarnings] as Prisma.InputJsonValue,
      },
    });
  }

  return warningsCleared;
}

function toNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

function toDateOnlyIso(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function parseCompactOptionSymbol(symbol: string): {
  underlyingSymbol: string;
  optionType: "CALL" | "PUT";
  strike: number;
  expirationDate: Date;
  expirationDateIso: string;
} | null {
  const match = symbol.match(FIDELITY_COMPACT_OPTION_SYMBOL_REGEX);
  if (!match) {
    return null;
  }

  const year = 2000 + Number(match[2]);
  const month = Number(match[3]);
  const day = Number(match[4]);
  const optionType = match[5] === "C" ? "CALL" : "PUT";
  const strike = Number.parseFloat(match[6]);

  const expirationDate = new Date(Date.UTC(year, month - 1, day));
  const expirationDateIso = toDateOnlyIso(expirationDate);
  if (!expirationDateIso || !Number.isFinite(strike)) {
    return null;
  }

  return {
    underlyingSymbol: match[1],
    optionType,
    strike,
    expirationDate,
    expirationDateIso,
  };
}

function buildOptionInstrumentKey(underlyingSymbol: string, optionType: string, strike: number, expirationDateIso: string): string {
  return `${underlyingSymbol}|${optionType}|${strike}|${expirationDateIso}`;
}

function toExecutionQtyOverrideAdjustments(overrides: RebuildAccountLedgerOptions["executionQtyOverrides"], accountId: string): ManualAdjustmentRecord[] {
  if (!overrides || overrides.length === 0) {
    return [];
  }

  return overrides.flatMap((override, index) => {
    try {
      const payload = parsePayloadByType("EXECUTION_QTY_OVERRIDE", {
        executionId: override.executionId,
        overrideQty: override.overrideQty,
      });
      const createdAt = new Date(index).toISOString();

      return [
        {
          id: `rebuild-override-${index}-${payload.executionId}`,
          createdAt,
          createdBy: "system:rebuild-pnl",
          accountId,
          accountExternalId: accountId,
          symbol: "OVERRIDE",
          effectiveDate: createdAt,
          adjustmentType: "EXECUTION_QTY_OVERRIDE",
          payload,
          reason: "Applied during ledger rebuild",
          evidenceRef: null,
          status: "ACTIVE",
          reversedByAdjustmentId: null,
        } satisfies ManualAdjustmentRecord,
      ];
    } catch {
      return [];
    }
  });
}

export async function rebuildAccountLedger(
  tx: Prisma.TransactionClient,
  accountId: string,
  asOfDate: Date,
  options?: RebuildAccountLedgerOptions,
): Promise<RebuildAccountLedgerResult> {
  await tx.matchedLot.deleteMany({ where: { accountId } });
  await tx.execution.deleteMany({
    where: {
      accountId,
      eventType: "EXPIRATION_INFERRED",
    },
  });

  const sourceExecutions = await tx.execution.findMany({
    where: {
      accountId,
      eventType: {
        in: ["TRADE", "ASSIGNMENT", "EXERCISE"],
      },
    },
    orderBy: [{ eventTimestamp: "asc" }, { id: "asc" }],
  });

  const adjustmentRows = await tx.manualAdjustment.findMany({
    where: {
      accountId,
      status: "ACTIVE",
      adjustmentType: {
        in: ["SPLIT", "EXECUTION_QTY_OVERRIDE", "EXECUTION_PRICE_OVERRIDE"],
      },
    },
    include: {
      account: {
        select: {
          accountId: true,
        },
      },
    },
    orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  const activeAdjustments: ManualAdjustmentRecord[] = adjustmentRows.flatMap((row) => {
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

  const splitAdjustments = activeAdjustments.filter((adjustment) => adjustment.adjustmentType === "SPLIT");
  const dbExecutionQtyOverrides = activeAdjustments.filter((adjustment) => adjustment.adjustmentType === "EXECUTION_QTY_OVERRIDE");
  const executionPriceOverrides = activeAdjustments.filter((adjustment) => adjustment.adjustmentType === "EXECUTION_PRICE_OVERRIDE");
  const executionQtyOverrides =
    options?.executionQtyOverrides === undefined
      ? dbExecutionQtyOverrides
      : toExecutionQtyOverrideAdjustments(options.executionQtyOverrides, accountId);

  const updates: Array<{
    id: string;
    underlyingSymbol: string;
    optionType: "CALL" | "PUT";
    strike: number;
    expirationDate: Date;
    instrumentKey: string;
  }> = [];

  const matcherInput: LedgerExecution[] = [];
  for (const execution of sourceExecutions) {
    if (execution.eventType === "EXPIRATION_INFERRED") {
      continue;
    }

    if (!execution.side) {
      continue;
    }

    const quantity = Number(execution.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }

    let normalizedUnderlyingSymbol = execution.underlyingSymbol;
    let normalizedOptionType = execution.optionType;
    let normalizedStrike = toNumber(execution.strike);
    let normalizedExpirationDate = execution.expirationDate;
    let normalizedInstrumentKey = deriveInstrumentKeyFromPersistedExecution(execution);

    if (execution.assetClass === "OPTION") {
      const parsed = parseCompactOptionSymbol(execution.symbol);
      const hasMissingOptionMetadata =
        !normalizedUnderlyingSymbol ||
        !normalizedOptionType ||
        normalizedStrike === null ||
        !normalizedExpirationDate ||
        normalizedInstrumentKey.includes("|NA|");

      if (parsed && hasMissingOptionMetadata) {
        normalizedUnderlyingSymbol = parsed.underlyingSymbol;
        normalizedOptionType = parsed.optionType;
        normalizedStrike = parsed.strike;
        normalizedExpirationDate = parsed.expirationDate;
        normalizedInstrumentKey = buildOptionInstrumentKey(
          parsed.underlyingSymbol,
          parsed.optionType,
          parsed.strike,
          parsed.expirationDateIso,
        );

        const currentStrike = toNumber(execution.strike);
        const currentExpiration = toDateOnlyIso(execution.expirationDate);
        const changed =
          execution.underlyingSymbol !== parsed.underlyingSymbol ||
          execution.optionType !== parsed.optionType ||
          currentStrike !== parsed.strike ||
          currentExpiration !== parsed.expirationDateIso ||
          execution.instrumentKey !== normalizedInstrumentKey;

        if (changed) {
          updates.push({
            id: execution.id,
            underlyingSymbol: parsed.underlyingSymbol,
            optionType: parsed.optionType,
            strike: parsed.strike,
            expirationDate: parsed.expirationDate,
            instrumentKey: normalizedInstrumentKey,
          });
        }
      }
    }

    matcherInput.push({
      id: execution.id,
      importId: execution.importId,
      accountId: execution.accountId,
      broker: execution.broker,
      eventTimestamp: execution.eventTimestamp,
      tradeDate: execution.tradeDate,
      eventType: execution.eventType,
      assetClass: execution.assetClass,
      symbol: execution.symbol,
      underlyingSymbol: normalizedUnderlyingSymbol,
      instrumentKey: normalizedInstrumentKey,
      side: execution.side,
      quantity,
      price: toNumber(execution.price),
      openingClosingEffect: execution.openingClosingEffect ?? "UNKNOWN",
      expirationDate: normalizedExpirationDate,
      optionType: normalizedOptionType,
      strike: normalizedStrike,
    });
  }

  for (const update of updates) {
    await tx.execution.update({
      where: { id: update.id },
      data: {
        underlyingSymbol: update.underlyingSymbol,
        optionType: update.optionType,
        strike: update.strike,
        expirationDate: update.expirationDate,
        instrumentKey: update.instrumentKey,
      },
    });
  }

  const splitAdjustedMatcherInput = applySplitAdjustmentsToLedgerExecutions(matcherInput, splitAdjustments);
  const priceOverrideResult = applyExecutionPriceOverrideToLedgerExecutions(splitAdjustedMatcherInput, executionPriceOverrides);
  const qtyOverrideResult = applyExecutionQtyOverrideToLedgerExecutions(priceOverrideResult.executions, executionQtyOverrides);
  const effectiveExecutions = qtyOverrideResult.executions.filter((execution) => execution.quantity > 0);
  const matchResult = runFifoMatcher(effectiveExecutions, asOfDate);
  if (priceOverrideResult.unmatchedExecutionIds.length > 0) {
    for (const executionId of priceOverrideResult.unmatchedExecutionIds) {
      matchResult.warnings.push({
        code: "EXECUTION_PRICE_OVERRIDE_TARGET_MISSING",
        message: `Execution price override references missing execution ${executionId}.`,
        rowRef: executionId,
      });
    }
  }

  if (qtyOverrideResult.unmatchedExecutionIds.length > 0) {
    for (const executionId of qtyOverrideResult.unmatchedExecutionIds) {
      matchResult.warnings.push({
        code: "EXECUTION_QTY_OVERRIDE_TARGET_MISSING",
        message: `Execution qty override references missing execution ${executionId}.`,
        rowRef: executionId,
      });
    }
  }

  if (matchResult.syntheticExecutions.length > 0) {
    await tx.execution.createMany({
      data: matchResult.syntheticExecutions.map((execution) => {
        const brokerTxId = computeBrokerTxId({
          accountId: execution.accountId,
          eventTimestamp: execution.eventTimestamp,
          eventType: execution.eventType,
          assetClass: execution.assetClass,
          instrumentKey: execution.instrumentKey,
          dedupeDiscriminator: execution.sourceRowRef,
          symbol: execution.symbol,
          side: execution.side,
          quantity: execution.quantity,
          rawPrice: execution.price.toString(),
          openingClosingEffect: execution.openingClosingEffect,
          optionType: execution.optionType,
          strike: execution.strike,
          expirationDate: execution.expirationDate,
        });

        return {
          id: execution.id,
          importId: execution.importId,
          accountId: execution.accountId,
          broker: execution.broker,
          eventTimestamp: execution.eventTimestamp,
          tradeDate: execution.tradeDate,
          eventType: execution.eventType,
          assetClass: execution.assetClass,
          symbol: execution.symbol,
          underlyingSymbol: execution.underlyingSymbol,
          brokerTxId,
          instrumentKey: execution.instrumentKey,
          side: execution.side,
          quantity: execution.quantity,
          price: execution.price,
          openingClosingEffect: execution.openingClosingEffect,
          optionType: execution.optionType,
          strike: execution.strike,
          expirationDate: execution.expirationDate,
          sourceRowRef: execution.sourceRowRef,
          rawRowJson: { synthetic: true, source: "ledger" },
        };
      }),
    });
  }

  if (matchResult.matchedLots.length > 0) {
    await tx.matchedLot.createMany({
      data: matchResult.matchedLots.map((lot) => ({
        accountId: lot.accountId,
        openExecutionId: lot.openExecutionId,
        closeExecutionId: lot.closeExecutionId,
        quantity: lot.quantity,
        realizedPnl: lot.realizedPnl,
        holdingDays: lot.holdingDays,
        outcome: lot.outcome,
      })),
    });
  }

  const warningsCleared = await rewriteLedgerWarningsOnImports(tx, accountId, sourceExecutions, matchResult.warnings);

  return {
    matchedLotsPersisted: matchResult.matchedLots.length,
    syntheticExecutionsPersisted: matchResult.syntheticExecutions.length,
    warningsCleared,
    warnings: matchResult.warnings,
  };
}
