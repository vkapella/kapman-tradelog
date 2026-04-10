import { describe, expect, it } from "vitest";
import { applyExecutionSplitAdjustment, applyPositionAdjustments } from "@/lib/adjustments/apply-adjustments";
import type { ExecutionRecord, ManualAdjustmentRecord, OpenPosition } from "@/types/api";

function splitAdjustment(overrides: Partial<ManualAdjustmentRecord> = {}): ManualAdjustmentRecord {
  return {
    id: overrides.id ?? "adj-1",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    createdBy: overrides.createdBy ?? "tester",
    accountId: overrides.accountId ?? "account-1",
    accountExternalId: overrides.accountExternalId ?? "D-1",
    symbol: overrides.symbol ?? "SDS",
    effectiveDate: overrides.effectiveDate ?? "2025-11-20T00:00:00.000Z",
    adjustmentType: overrides.adjustmentType ?? "SPLIT",
    payload: overrides.payload ?? { from: 5, to: 1 },
    reason: overrides.reason ?? "test split",
    evidenceRef: overrides.evidenceRef ?? null,
    status: overrides.status ?? "ACTIVE",
    reversedByAdjustmentId: overrides.reversedByAdjustmentId ?? null,
  };
}

function execution(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    id: overrides.id ?? "exec-1",
    accountId: overrides.accountId ?? "account-1",
    broker: overrides.broker ?? "SCHWAB_THINKORSWIM",
    symbol: overrides.symbol ?? "SDS",
    tradeDate: overrides.tradeDate ?? "2025-11-01T00:00:00.000Z",
    eventTimestamp: overrides.eventTimestamp ?? "2025-11-01T12:00:00.000Z",
    eventType: overrides.eventType ?? "TRADE",
    assetClass: overrides.assetClass ?? "EQUITY",
    side: overrides.side ?? "BUY",
    quantity: overrides.quantity ?? "200",
    price: overrides.price ?? "14.87",
    openingClosingEffect: overrides.openingClosingEffect ?? "TO_OPEN",
    instrumentKey: overrides.instrumentKey ?? "SDS",
    underlyingSymbol: overrides.underlyingSymbol ?? "SDS",
    optionType: overrides.optionType ?? null,
    strike: overrides.strike ?? null,
    expirationDate: overrides.expirationDate ?? null,
    spreadGroupId: overrides.spreadGroupId ?? null,
    importId: overrides.importId ?? "import-1",
  };
}

describe("applyExecutionSplitAdjustment", () => {
  it("applies reverse split ratio to pre-effective-date executions", () => {
    const scales = applyExecutionSplitAdjustment(execution(), [splitAdjustment()]);
    expect(scales.quantityScale).toBeCloseTo(0.2, 6);
    expect(scales.priceScale).toBeCloseTo(5, 6);
  });

  it("applies forward split ratio", () => {
    const scales = applyExecutionSplitAdjustment(
      execution({ symbol: "XLU", tradeDate: "2025-11-01T00:00:00.000Z" }),
      [
        splitAdjustment({
          symbol: "XLU",
          effectiveDate: "2025-12-05T00:00:00.000Z",
          payload: { from: 1, to: 2 },
        }),
      ],
    );
    expect(scales.quantityScale).toBeCloseTo(2, 6);
    expect(scales.priceScale).toBeCloseTo(0.5, 6);
  });

  it("ignores reversed split adjustments", () => {
    const scales = applyExecutionSplitAdjustment(execution(), [splitAdjustment({ status: "REVERSED" })]);
    expect(scales.quantityScale).toBe(1);
    expect(scales.priceScale).toBe(1);
  });
});

describe("applyPositionAdjustments", () => {
  it("overrides qty and preserves per-share basis", () => {
    const positions: OpenPosition[] = [
      {
        symbol: "SDS",
        underlyingSymbol: "SDS",
        assetClass: "EQUITY",
        optionType: null,
        strike: null,
        expirationDate: null,
        instrumentKey: "SDS",
        netQty: 200,
        costBasis: 2974,
        accountId: "account-1",
      },
    ];

    const result = applyPositionAdjustments(positions, [
      splitAdjustment({
        adjustmentType: "QTY_OVERRIDE",
        payload: { instrumentKey: "SDS", overrideQty: 40 },
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.netQty).toBe(40);
    expect(result[0]?.costBasis).toBeCloseTo(594.8, 4);
  });

  it("adds synthetic and removes by instrument key", () => {
    const base: OpenPosition[] = [];
    const result = applyPositionAdjustments(base, [
      splitAdjustment({
        id: "add",
        adjustmentType: "ADD_POSITION",
        payload: { instrumentKey: "XLU", assetClass: "EQUITY", netQty: 200, costBasis: 4589 },
      }),
      splitAdjustment({
        id: "remove",
        adjustmentType: "REMOVE_POSITION",
        payload: { instrumentKey: "XLU" },
        createdAt: "2026-01-02T00:00:00.000Z",
      }),
    ]);

    expect(result).toHaveLength(0);
  });
});
