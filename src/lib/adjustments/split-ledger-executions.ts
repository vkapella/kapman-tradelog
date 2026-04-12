import type { LedgerExecution } from "@/lib/ledger/fifo-matcher";
import { parsePayloadByType } from "@/lib/adjustments/types";
import type { ManualAdjustmentRecord } from "@/types/api";
import { sortAdjustments } from "./apply-adjustments";

const SCALE_PRECISION = 10;
const EPSILON = 1e-9;

function normalizeScaledValue(value: number): number {
  const normalized = Number(value.toFixed(SCALE_PRECISION));
  return Object.is(normalized, -0) ? 0 : normalized;
}

function normalizeToken(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function dateToken(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "NA";
}

function numberToken(value: number | null): string {
  return value === null ? "NA" : String(normalizeScaledValue(value));
}

function optionKeyParts(instrumentKey: string): [string, string, string, string] {
  const [underlying = "", optionType = "", strike = "", expiration = ""] = instrumentKey.split("|");
  return [underlying, optionType, strike, expiration];
}

function optionUnderlyingFromInstrumentKey(instrumentKey: string): string {
  const [underlying] = optionKeyParts(instrumentKey);
  return normalizeToken(underlying);
}

function symbolMatches(adjustmentSymbol: string, execution: LedgerExecution): boolean {
  const normalizedAdjustment = normalizeToken(adjustmentSymbol).toUpperCase();
  if (!normalizedAdjustment) {
    return false;
  }

  const executionSymbol = normalizeToken(execution.symbol).toUpperCase();
  const optionUnderlying = optionUnderlyingFromInstrumentKey(execution.instrumentKey).toUpperCase();
  return normalizedAdjustment === executionSymbol || normalizedAdjustment === optionUnderlying;
}

function buildAdjustedOptionInstrumentKey(execution: LedgerExecution, adjustedStrike: number | null): string {
  const [keyUnderlying, keyOptionType, keyStrike, keyExpiration] = optionKeyParts(execution.instrumentKey);
  const underlying = normalizeToken(keyUnderlying) || normalizeToken(execution.symbol) || "NA";
  const optionType = normalizeToken(execution.optionType) || normalizeToken(keyOptionType) || "NA";
  const strike = adjustedStrike === null ? normalizeToken(keyStrike) || "NA" : numberToken(adjustedStrike);
  const expiration = dateToken(execution.expirationDate) !== "NA" ? dateToken(execution.expirationDate) : normalizeToken(keyExpiration) || "NA";
  return `${underlying}|${optionType}|${strike}|${expiration}`;
}

function numbersDiffer(left: number, right: number): boolean {
  return Math.abs(left - right) > EPSILON;
}

function nullableNumbersDiffer(left: number | null, right: number | null): boolean {
  if (left === null || right === null) {
    return left !== right;
  }
  return numbersDiffer(left, right);
}

function calculateSplitScales(
  execution: LedgerExecution,
  splitAdjustments: ManualAdjustmentRecord[],
): { quantityScale: number; priceScale: number } {
  const tradeDateTime = execution.tradeDate.getTime();
  if (!Number.isFinite(tradeDateTime)) {
    return { quantityScale: 1, priceScale: 1 };
  }

  let quantityScale = 1;
  let priceScale = 1;

  for (const adjustment of splitAdjustments) {
    if (!symbolMatches(adjustment.symbol, execution)) {
      continue;
    }

    const effectiveDateTime = new Date(adjustment.effectiveDate).getTime();
    if (!Number.isFinite(effectiveDateTime) || tradeDateTime >= effectiveDateTime) {
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
    quantityScale: normalizeScaledValue(quantityScale),
    priceScale: normalizeScaledValue(priceScale),
  };
}

export function applySplitAdjustmentToLedgerExecution(
  execution: LedgerExecution,
  adjustments: ManualAdjustmentRecord[],
): { execution: LedgerExecution; affected: boolean } {
  if (execution.assetClass !== "EQUITY" && execution.assetClass !== "OPTION") {
    return { execution, affected: false };
  }

  const splitAdjustments = sortAdjustments(
    adjustments.filter((adjustment) => adjustment.status === "ACTIVE" && adjustment.adjustmentType === "SPLIT"),
  );
  if (splitAdjustments.length === 0) {
    return { execution, affected: false };
  }

  const scales = calculateSplitScales(execution, splitAdjustments);
  if (!numbersDiffer(scales.quantityScale, 1) && !numbersDiffer(scales.priceScale, 1)) {
    return { execution, affected: false };
  }

  const adjustedQuantity = normalizeScaledValue(execution.quantity * scales.quantityScale);
  const adjustedPrice = execution.price === null ? null : normalizeScaledValue(execution.price * scales.priceScale);
  const adjustedStrike =
    execution.assetClass === "OPTION" && execution.strike !== null
      ? normalizeScaledValue(execution.strike * scales.priceScale)
      : execution.strike;
  const adjustedInstrumentKey =
    execution.assetClass === "OPTION"
      ? buildAdjustedOptionInstrumentKey(execution, adjustedStrike)
      : execution.instrumentKey;

  const affected =
    numbersDiffer(execution.quantity, adjustedQuantity) ||
    nullableNumbersDiffer(execution.price, adjustedPrice) ||
    nullableNumbersDiffer(execution.strike, adjustedStrike) ||
    execution.instrumentKey !== adjustedInstrumentKey;

  if (!affected) {
    return { execution, affected: false };
  }

  return {
    execution: {
      ...execution,
      quantity: adjustedQuantity,
      price: adjustedPrice,
      strike: adjustedStrike,
      instrumentKey: adjustedInstrumentKey,
    },
    affected: true,
  };
}

export function applySplitAdjustmentsToLedgerExecutions(
  executions: LedgerExecution[],
  adjustments: ManualAdjustmentRecord[],
): LedgerExecution[] {
  return executions.map((execution) => applySplitAdjustmentToLedgerExecution(execution, adjustments).execution);
}
