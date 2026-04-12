import {
  applyExecutionSplitAdjustment,
  applyPositionAdjustmentsWithWarnings,
  type PositionAdjustmentWarning,
} from "@/lib/adjustments/apply-adjustments";
import type { ExecutionRecord, ManualAdjustmentRecord, MatchedLotRecord, OpenPosition } from "@/types/api";

function signedQuantity(side: string | null, quantity: number): number {
  return side === "SELL" ? quantity * -1 : quantity;
}

function fallbackInstrumentKey(execution: ExecutionRecord): string {
  const expiration = execution.expirationDate ? execution.expirationDate.slice(0, 10) : "";
  return [
    execution.accountId,
    execution.assetClass,
    execution.underlyingSymbol ?? execution.symbol,
    execution.optionType ?? "",
    execution.strike ?? "",
    expiration,
  ].join("|");
}

export function computeOpenPositions(
  executions: ExecutionRecord[],
  matchedLots: MatchedLotRecord[],
  adjustments: ManualAdjustmentRecord[] = [],
): OpenPosition[] {
  return computeOpenPositionsWithDiagnostics(executions, matchedLots, adjustments).positions;
}

export interface ComputeOpenPositionsResult {
  positions: OpenPosition[];
  warnings: PositionAdjustmentWarning[];
}

export function computeOpenPositionsWithDiagnostics(
  executions: ExecutionRecord[],
  matchedLots: MatchedLotRecord[],
  adjustments: ManualAdjustmentRecord[] = [],
): ComputeOpenPositionsResult {
  const matchedQtyByOpenExecutionId = new Map<string, number>();
  for (const lot of matchedLots) {
    const quantity = Number(lot.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }

    const current = matchedQtyByOpenExecutionId.get(lot.openExecutionId) ?? 0;
    matchedQtyByOpenExecutionId.set(lot.openExecutionId, current + quantity);
  }

  const grouped = new Map<string, OpenPosition>();

  for (const execution of executions) {
    if (execution.openingClosingEffect !== "TO_OPEN") {
      continue;
    }

    const openQuantity = Number(execution.quantity);
    if (!Number.isFinite(openQuantity) || openQuantity <= 0) {
      continue;
    }

    const matchedQuantity = matchedQtyByOpenExecutionId.get(execution.id) ?? 0;
    const remainingQuantity = Math.max(0, openQuantity - matchedQuantity);
    if (remainingQuantity === 0) {
      continue;
    }

    const key = execution.instrumentKey ?? fallbackInstrumentKey(execution);
    const groupKey = execution.accountId + "::" + key;

    const price = Number(execution.price ?? 0);
    const relevantAdjustments = adjustments.filter((adjustment) => adjustment.accountId === execution.accountId);
    const splitScales = applyExecutionSplitAdjustment(execution, relevantAdjustments);
    const adjustedQuantity = remainingQuantity * splitScales.quantityScale;
    const adjustedPrice = price * splitScales.priceScale;
    const qtySigned = signedQuantity(execution.side, adjustedQuantity);
    const multiplier = execution.assetClass === "OPTION" ? 100 : 1;

    const existing = grouped.get(groupKey);
    if (existing) {
      existing.netQty += qtySigned;
      existing.costBasis += qtySigned * adjustedPrice * multiplier;
      continue;
    }

    grouped.set(groupKey, {
      symbol: execution.symbol,
      underlyingSymbol: execution.underlyingSymbol ?? execution.symbol,
      assetClass: execution.assetClass === "OPTION" ? "OPTION" : "EQUITY",
      optionType: execution.optionType === "CALL" || execution.optionType === "PUT" ? execution.optionType : null,
      strike: execution.strike,
      expirationDate: execution.expirationDate,
      instrumentKey: key,
      netQty: qtySigned,
      costBasis: qtySigned * adjustedPrice * multiplier,
      accountId: execution.accountId,
    });
  }

  const basePositions = Array.from(grouped.values())
    .filter((position) => position.netQty !== 0)
    .sort((left, right) => {
      const symbolOrder = left.underlyingSymbol.localeCompare(right.underlyingSymbol);
      if (symbolOrder !== 0) {
        return symbolOrder;
      }

      return left.instrumentKey.localeCompare(right.instrumentKey);
    });

  const adjusted = applyPositionAdjustmentsWithWarnings(basePositions, adjustments);
  return {
    positions: adjusted.positions,
    warnings: adjusted.warnings,
  };
}
