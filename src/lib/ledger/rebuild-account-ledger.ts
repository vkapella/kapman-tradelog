import type { Prisma } from "@prisma/client";
import { applyExecutionQtyOverrideToLedgerExecutions } from "@/lib/adjustments/execution-qty-overrides";
import { applySplitAdjustmentsToLedgerExecutions } from "@/lib/adjustments/split-ledger-executions";
import { parsePayloadByType } from "@/lib/adjustments/types";
import type { ManualAdjustmentRecord } from "@/types/api";
import { computeBrokerTxId } from "./ingest";
import { deriveInstrumentKeyFromPersistedExecution } from "./instrument-key";
import { runFifoMatcher, type LedgerExecution, type LedgerWarning } from "./fifo-matcher";

export interface RebuildAccountLedgerResult {
  matchedLotsPersisted: number;
  syntheticExecutionsPersisted: number;
  warnings: LedgerWarning[];
}

export interface RebuildAccountLedgerOptions {
  executionQtyOverrides?: Array<{
    payload: unknown;
  }>;
}

const FIDELITY_COMPACT_OPTION_SYMBOL_REGEX = /^-([A-Z]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d+(?:\.\d+)?)$/;

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

function toExecutionQtyOverrideAdjustments(
  overrides: Array<{ payload: unknown }>,
  accountId: string,
): ManualAdjustmentRecord[] {
  return overrides.flatMap((override, index) => {
    try {
      const payload = parsePayloadByType("EXECUTION_QTY_OVERRIDE", override.payload);
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
        in: ["SPLIT", "EXECUTION_QTY_OVERRIDE"],
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
  const overrideResult = applyExecutionQtyOverrideToLedgerExecutions(splitAdjustedMatcherInput, executionQtyOverrides);
  const effectiveExecutions = overrideResult.executions.filter((execution) => execution.quantity > 0);
  const matchResult = runFifoMatcher(effectiveExecutions, asOfDate);
  if (overrideResult.unmatchedExecutionIds.length > 0) {
    for (const executionId of overrideResult.unmatchedExecutionIds) {
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

  return {
    matchedLotsPersisted: matchResult.matchedLots.length,
    syntheticExecutionsPersisted: matchResult.syntheticExecutions.length,
    warnings: matchResult.warnings,
  };
}
