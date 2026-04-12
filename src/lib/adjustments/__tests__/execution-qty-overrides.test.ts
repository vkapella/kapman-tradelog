import { describe, expect, it } from "vitest";
import {
  applyExecutionQtyOverrideToLedgerExecutions,
  buildExecutionQtyOverrideMap,
  findSupersededExecutionQtyOverrideIds,
} from "@/lib/adjustments/execution-qty-overrides";
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
    adjustmentType: overrides.adjustmentType ?? "EXECUTION_QTY_OVERRIDE",
    payload: overrides.payload ?? { executionId: "close-1", overrideQty: 2 },
    reason: overrides.reason ?? "qty fix",
    evidenceRef: overrides.evidenceRef ?? null,
    status: overrides.status ?? "ACTIVE",
    reversedByAdjustmentId: overrides.reversedByAdjustmentId ?? null,
  };
}

function ledgerExecution(overrides: Partial<LedgerExecution> = {}): LedgerExecution {
  return {
    id: overrides.id ?? "close-1",
    importId: overrides.importId ?? "import-1",
    accountId: overrides.accountId ?? "account-1",
    broker: overrides.broker ?? "SCHWAB_THINKORSWIM",
    eventTimestamp: overrides.eventTimestamp ?? new Date("2026-04-01T14:00:00.000Z"),
    tradeDate: overrides.tradeDate ?? new Date("2026-04-01T00:00:00.000Z"),
    eventType: overrides.eventType ?? "TRADE",
    assetClass: overrides.assetClass ?? "OPTION",
    symbol: overrides.symbol ?? "SPY",
    underlyingSymbol: overrides.underlyingSymbol ?? "SPY",
    instrumentKey: overrides.instrumentKey ?? "SPY|CALL|650|2027-12-17",
    side: overrides.side ?? "BUY",
    quantity: overrides.quantity ?? 21,
    price: overrides.price ?? 1.2,
    openingClosingEffect: overrides.openingClosingEffect ?? "TO_CLOSE",
    expirationDate: overrides.expirationDate ?? new Date("2027-12-17T00:00:00.000Z"),
    optionType: overrides.optionType ?? "CALL",
    strike: overrides.strike ?? 650,
  };
}

describe("buildExecutionQtyOverrideMap", () => {
  it("keeps the latest active override per execution id", () => {
    const map = buildExecutionQtyOverrideMap([
      adjustment({ id: "old", payload: { executionId: "close-1", overrideQty: 5 } }),
      adjustment({ id: "new", createdAt: "2026-04-02T00:00:00.000Z", payload: { executionId: "close-1", overrideQty: 2 } }),
    ]);

    expect(map.get("close-1")?.adjustmentId).toBe("new");
    expect(map.get("close-1")?.overrideQty).toBe(2);
  });

  it("ignores reversed overrides", () => {
    const map = buildExecutionQtyOverrideMap([
      adjustment({ id: "reversed", status: "REVERSED", payload: { executionId: "close-1", overrideQty: 2 } }),
    ]);

    expect(map.size).toBe(0);
  });
});

describe("applyExecutionQtyOverrideToLedgerExecutions", () => {
  it("applies execution quantity override to matcher input only", () => {
    const source = [ledgerExecution()];
    const result = applyExecutionQtyOverrideToLedgerExecutions(source, [
      adjustment({ payload: { executionId: "close-1", overrideQty: 2 } }),
    ]);

    expect(source[0]?.quantity).toBe(21);
    expect(result.executions[0]?.quantity).toBe(2);
    expect(result.unmatchedExecutionIds).toHaveLength(0);
  });

  it("reports unmatched override targets", () => {
    const result = applyExecutionQtyOverrideToLedgerExecutions([ledgerExecution({ id: "close-1" })], [
      adjustment({ payload: { executionId: "close-missing", overrideQty: 2 } }),
    ]);

    expect(result.unmatchedExecutionIds).toEqual(["close-missing"]);
  });
});

describe("findSupersededExecutionQtyOverrideIds", () => {
  it("marks older active overrides as superseded", () => {
    const superseded = findSupersededExecutionQtyOverrideIds([
      adjustment({ id: "old", payload: { executionId: "close-1", overrideQty: 5 } }),
      adjustment({ id: "new", createdAt: "2026-04-02T00:00:00.000Z", payload: { executionId: "close-1", overrideQty: 2 } }),
      adjustment({ id: "other", payload: { executionId: "close-2", overrideQty: 3 } }),
    ]);

    expect(superseded.has("old")).toBe(true);
    expect(superseded.has("new")).toBe(false);
    expect(superseded.has("other")).toBe(false);
  });
});
