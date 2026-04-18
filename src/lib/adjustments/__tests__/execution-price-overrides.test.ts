import { describe, expect, it } from "vitest";
import {
  applyExecutionPriceOverrideToLedgerExecutions,
  buildExecutionPriceOverrideMap,
  findSupersededExecutionPriceOverrideIds,
} from "@/lib/adjustments/execution-price-overrides";
import type { LedgerExecution } from "@/lib/ledger/fifo-matcher";
import type { ManualAdjustmentRecord } from "@/types/api";

function adjustment(overrides: Partial<ManualAdjustmentRecord> = {}): ManualAdjustmentRecord {
  return {
    id: overrides.id ?? "adj-1",
    createdAt: overrides.createdAt ?? "2026-04-01T00:00:00.000Z",
    createdBy: overrides.createdBy ?? "tester",
    accountId: overrides.accountId ?? "account-1",
    accountExternalId: overrides.accountExternalId ?? "D-1",
    symbol: overrides.symbol ?? "SPY",
    effectiveDate: overrides.effectiveDate ?? "2026-04-01T00:00:00.000Z",
    adjustmentType: overrides.adjustmentType ?? "EXECUTION_PRICE_OVERRIDE",
    payload: overrides.payload ?? { executionId: "open-1", overridePrice: 42.5 },
    reason: overrides.reason ?? "basis fix",
    evidenceRef: overrides.evidenceRef ?? null,
    status: overrides.status ?? "ACTIVE",
    reversedByAdjustmentId: overrides.reversedByAdjustmentId ?? null,
  };
}

function ledgerExecution(overrides: Partial<LedgerExecution> = {}): LedgerExecution {
  return {
    id: overrides.id ?? "open-1",
    importId: overrides.importId ?? "import-1",
    accountId: overrides.accountId ?? "account-1",
    broker: overrides.broker ?? "FIDELITY",
    eventTimestamp: overrides.eventTimestamp ?? new Date("2026-04-01T14:00:00.000Z"),
    tradeDate: overrides.tradeDate ?? new Date("2026-04-01T00:00:00.000Z"),
    eventType: overrides.eventType ?? "TRADE",
    assetClass: overrides.assetClass ?? "EQUITY",
    symbol: overrides.symbol ?? "SPY",
    underlyingSymbol: overrides.underlyingSymbol ?? "SPY",
    instrumentKey: overrides.instrumentKey ?? "SPY",
    side: overrides.side ?? "BUY",
    quantity: overrides.quantity ?? 100,
    price: overrides.price ?? 51.25,
    openingClosingEffect: overrides.openingClosingEffect ?? "TO_OPEN",
    expirationDate: overrides.expirationDate ?? null,
    optionType: overrides.optionType ?? null,
    strike: overrides.strike ?? null,
  };
}

describe("buildExecutionPriceOverrideMap", () => {
  it("keeps the latest active override per execution id", () => {
    const map = buildExecutionPriceOverrideMap([
      adjustment({ id: "old", payload: { executionId: "open-1", overridePrice: 50 } }),
      adjustment({ id: "new", createdAt: "2026-04-02T00:00:00.000Z", payload: { executionId: "open-1", overridePrice: 42.5 } }),
    ]);

    expect(map.get("open-1")?.adjustmentId).toBe("new");
    expect(map.get("open-1")?.overridePrice).toBe(42.5);
  });

  it("ignores reversed overrides", () => {
    const map = buildExecutionPriceOverrideMap([
      adjustment({ id: "reversed", status: "REVERSED", payload: { executionId: "open-1", overridePrice: 42.5 } }),
    ]);

    expect(map.size).toBe(0);
  });
});

describe("applyExecutionPriceOverrideToLedgerExecutions", () => {
  it("applies execution price overrides to matcher input only", () => {
    const source = [ledgerExecution()];
    const result = applyExecutionPriceOverrideToLedgerExecutions(source, [
      adjustment({ payload: { executionId: "open-1", overridePrice: 42.5 } }),
    ]);

    expect(source[0]?.price).toBe(51.25);
    expect(result.executions[0]?.price).toBe(42.5);
    expect(result.unmatchedExecutionIds).toHaveLength(0);
  });

  it("reports unmatched override targets", () => {
    const result = applyExecutionPriceOverrideToLedgerExecutions([ledgerExecution({ id: "open-1" })], [
      adjustment({ payload: { executionId: "open-missing", overridePrice: 42.5 } }),
    ]);

    expect(result.unmatchedExecutionIds).toEqual(["open-missing"]);
  });
});

describe("findSupersededExecutionPriceOverrideIds", () => {
  it("marks older active overrides as superseded", () => {
    const superseded = findSupersededExecutionPriceOverrideIds([
      adjustment({ id: "old", payload: { executionId: "open-1", overridePrice: 50 } }),
      adjustment({ id: "new", createdAt: "2026-04-02T00:00:00.000Z", payload: { executionId: "open-1", overridePrice: 42.5 } }),
      adjustment({ id: "other", payload: { executionId: "open-2", overridePrice: 41 } }),
    ]);

    expect(superseded.has("old")).toBe(true);
    expect(superseded.has("new")).toBe(false);
    expect(superseded.has("other")).toBe(false);
  });
});
