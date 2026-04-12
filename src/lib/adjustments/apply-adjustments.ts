import type { ExecutionRecord, ManualAdjustmentRecord, OpenPosition } from "@/types/api";
import { parsePayloadByType } from "@/lib/adjustments/types";

export interface PositionAdjustmentWarning {
  code: "ADJUSTMENT_NO_TARGET";
  adjustmentId: string;
  accountId: string;
  adjustmentType: "QTY_OVERRIDE" | "PRICE_OVERRIDE";
  instrumentKey: string;
  message: string;
}

export interface ApplyPositionAdjustmentsResult {
  positions: OpenPosition[];
  warnings: PositionAdjustmentWarning[];
}

export function sortAdjustments(adjustments: ManualAdjustmentRecord[]): ManualAdjustmentRecord[] {
  return [...adjustments].sort((left, right) => {
    const leftEffective = new Date(left.effectiveDate).getTime();
    const rightEffective = new Date(right.effectiveDate).getTime();

    if (leftEffective !== rightEffective) {
      return leftEffective - rightEffective;
    }

    const leftCreated = new Date(left.createdAt).getTime();
    const rightCreated = new Date(right.createdAt).getTime();
    return leftCreated - rightCreated;
  });
}

export function applyExecutionSplitAdjustment(
  execution: ExecutionRecord,
  adjustments: ManualAdjustmentRecord[],
): { quantityScale: number; priceScale: number } {
  if (execution.assetClass !== "EQUITY") {
    return { quantityScale: 1, priceScale: 1 };
  }

  const executionTradeDate = new Date(execution.tradeDate).getTime();
  if (!Number.isFinite(executionTradeDate)) {
    return { quantityScale: 1, priceScale: 1 };
  }

  let quantityScale = 1;
  let priceScale = 1;

  for (const adjustment of sortAdjustments(adjustments)) {
    if (adjustment.status !== "ACTIVE" || adjustment.adjustmentType !== "SPLIT") {
      continue;
    }

    if (adjustment.symbol.toUpperCase() !== execution.symbol.toUpperCase()) {
      continue;
    }

    const effectiveDate = new Date(adjustment.effectiveDate).getTime();
    if (!Number.isFinite(effectiveDate) || executionTradeDate >= effectiveDate) {
      continue;
    }

    try {
      const payload = parsePayloadByType("SPLIT", adjustment.payload);
      quantityScale *= payload.to / payload.from;
      priceScale *= payload.from / payload.to;
    } catch {
      continue;
    }
  }

  return {
    quantityScale,
    priceScale,
  };
}

function parseInstrumentSymbol(instrumentKey: string): string {
  return instrumentKey.split("|")[0] ?? instrumentKey;
}

export function applyPositionAdjustments(positions: OpenPosition[], adjustments: ManualAdjustmentRecord[]): OpenPosition[] {
  return applyPositionAdjustmentsWithWarnings(positions, adjustments).positions;
}

export function applyPositionAdjustmentsWithWarnings(
  positions: OpenPosition[],
  adjustments: ManualAdjustmentRecord[],
): ApplyPositionAdjustmentsResult {
  const activeAdjustments = sortAdjustments(adjustments.filter((adjustment) => adjustment.status === "ACTIVE"));
  const grouped = new Map(positions.map((position) => [position.accountId + "::" + position.instrumentKey, { ...position }]));
  const warnings: PositionAdjustmentWarning[] = [];

  for (const adjustment of activeAdjustments) {
    const accountPrefix = adjustment.accountId + "::";

    try {
      if (adjustment.adjustmentType === "QTY_OVERRIDE") {
        const payload = parsePayloadByType("QTY_OVERRIDE", adjustment.payload);
        const target = grouped.get(accountPrefix + payload.instrumentKey);
        if (target) {
          const multiplier = target.assetClass === "OPTION" ? 100 : 1;
          const costBasisPerShare = target.netQty !== 0 ? target.costBasis / (target.netQty * multiplier) : 0;
          target.netQty = payload.overrideQty;
          target.costBasis = payload.overrideQty * multiplier * costBasisPerShare;
        } else {
          warnings.push({
            code: "ADJUSTMENT_NO_TARGET",
            adjustmentId: adjustment.id,
            accountId: adjustment.accountId,
            adjustmentType: "QTY_OVERRIDE",
            instrumentKey: payload.instrumentKey,
            message: `QTY_OVERRIDE adjustment ${adjustment.id} has no target position for instrument ${payload.instrumentKey}.`,
          });
        }
        continue;
      }

      if (adjustment.adjustmentType === "PRICE_OVERRIDE") {
        const payload = parsePayloadByType("PRICE_OVERRIDE", adjustment.payload);
        const target = grouped.get(accountPrefix + payload.instrumentKey);
        if (target) {
          const multiplier = target.assetClass === "OPTION" ? 100 : 1;
          target.costBasis = target.netQty * multiplier * payload.overridePrice;
        } else {
          warnings.push({
            code: "ADJUSTMENT_NO_TARGET",
            adjustmentId: adjustment.id,
            accountId: adjustment.accountId,
            adjustmentType: "PRICE_OVERRIDE",
            instrumentKey: payload.instrumentKey,
            message: `PRICE_OVERRIDE adjustment ${adjustment.id} has no target position for instrument ${payload.instrumentKey}.`,
          });
        }
        continue;
      }

      if (adjustment.adjustmentType === "REMOVE_POSITION") {
        const payload = parsePayloadByType("REMOVE_POSITION", adjustment.payload);
        grouped.delete(accountPrefix + payload.instrumentKey);
        continue;
      }

      if (adjustment.adjustmentType === "ADD_POSITION") {
        const payload = parsePayloadByType("ADD_POSITION", adjustment.payload);
        const key = accountPrefix + payload.instrumentKey;
        const existing = grouped.get(key);
        if (existing) {
          existing.netQty += payload.netQty;
          existing.costBasis += payload.costBasis;
        } else {
          grouped.set(key, {
            symbol: parseInstrumentSymbol(payload.instrumentKey),
            underlyingSymbol: parseInstrumentSymbol(payload.instrumentKey),
            assetClass: payload.assetClass,
            optionType: payload.optionType ?? null,
            strike: payload.strike ?? null,
            expirationDate: payload.expirationDate ?? null,
            instrumentKey: payload.instrumentKey,
            netQty: payload.netQty,
            costBasis: payload.costBasis,
            accountId: adjustment.accountId,
          });
        }
      }
    } catch {
      continue;
    }
  }

  const resolvedPositions = Array.from(grouped.values())
    .filter((position) => position.netQty !== 0)
    .sort((left, right) => {
      const symbolOrder = left.underlyingSymbol.localeCompare(right.underlyingSymbol);
      if (symbolOrder !== 0) {
        return symbolOrder;
      }

      return left.instrumentKey.localeCompare(right.instrumentKey);
    });

  return {
    positions: resolvedPositions,
    warnings,
  };
}
