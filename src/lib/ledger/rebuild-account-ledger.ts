import type { Prisma } from "@prisma/client";
import { applyExecutionQtyOverrideToLedgerExecutions } from "@/lib/adjustments/execution-qty-overrides";
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

function toNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

export async function rebuildAccountLedger(
  tx: Prisma.TransactionClient,
  accountId: string,
  asOfDate: Date,
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

  const executionQtyOverrideRows = await tx.manualAdjustment.findMany({
    where: {
      accountId,
      status: "ACTIVE",
      adjustmentType: "EXECUTION_QTY_OVERRIDE",
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
  const executionQtyOverrides: ManualAdjustmentRecord[] = executionQtyOverrideRows.flatMap((row) => {
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
      instrumentKey: deriveInstrumentKeyFromPersistedExecution(execution),
      side: execution.side,
      quantity,
      price: toNumber(execution.price),
      openingClosingEffect: execution.openingClosingEffect ?? "UNKNOWN",
      expirationDate: execution.expirationDate,
      optionType: execution.optionType,
      strike: toNumber(execution.strike),
    });
  }

  const overrideResult = applyExecutionQtyOverrideToLedgerExecutions(matcherInput, executionQtyOverrides);
  const matchResult = runFifoMatcher(overrideResult.executions, asOfDate);
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
