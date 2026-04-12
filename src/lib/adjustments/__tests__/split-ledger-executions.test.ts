import { describe, expect, it } from "vitest";
import { runFifoMatcher, type LedgerExecution } from "@/lib/ledger/fifo-matcher";
import { applySplitAdjustmentsToLedgerExecutions } from "@/lib/adjustments/split-ledger-executions";
import type { ManualAdjustmentRecord } from "@/types/api";

function date(value: string): Date {
  return new Date(value);
}

function splitAdjustment(overrides: Partial<ManualAdjustmentRecord> = {}): ManualAdjustmentRecord {
  return {
    id: overrides.id ?? "split-1",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    createdBy: overrides.createdBy ?? "tester",
    accountId: overrides.accountId ?? "account-1",
    accountExternalId: overrides.accountExternalId ?? "D-1",
    symbol: overrides.symbol ?? "XLE",
    effectiveDate: overrides.effectiveDate ?? "2025-12-05T00:00:00.000Z",
    adjustmentType: "SPLIT",
    payload: overrides.payload ?? { from: 1, to: 2 },
    reason: overrides.reason ?? "split",
    evidenceRef: overrides.evidenceRef ?? null,
    status: overrides.status ?? "ACTIVE",
    reversedByAdjustmentId: overrides.reversedByAdjustmentId ?? null,
  };
}

function optionExecution(overrides: Partial<LedgerExecution>): LedgerExecution {
  return {
    id: overrides.id ?? "exec-1",
    importId: overrides.importId ?? "import-1",
    accountId: overrides.accountId ?? "account-1",
    broker: overrides.broker ?? "SCHWAB_THINKORSWIM",
    eventTimestamp: overrides.eventTimestamp ?? date("2025-11-20T15:00:00.000Z"),
    tradeDate: overrides.tradeDate ?? date("2025-11-20T00:00:00.000Z"),
    eventType: overrides.eventType ?? "TRADE",
    assetClass: overrides.assetClass ?? "OPTION",
    symbol: overrides.symbol ?? "XLE",
    instrumentKey: overrides.instrumentKey ?? "XLE|CALL|90|2026-01-16",
    side: overrides.side ?? "BUY",
    quantity: overrides.quantity ?? 2,
    price: overrides.price ?? 4.3,
    openingClosingEffect: overrides.openingClosingEffect ?? "TO_OPEN",
    expirationDate: overrides.expirationDate ?? date("2026-01-16T00:00:00.000Z"),
    optionType: overrides.optionType ?? "CALL",
    strike: overrides.strike ?? 90,
  };
}

describe("applySplitAdjustmentsToLedgerExecutions", () => {
  it("remaps pre-split option opens to post-split instrument keys so closes match and synthetic expirations are suppressed", () => {
    const openBeforeSplit = optionExecution({
      id: "xle-open-90",
      tradeDate: date("2025-11-20T00:00:00.000Z"),
      eventTimestamp: date("2025-11-20T15:00:00.000Z"),
      quantity: 2,
      price: 4.3,
      strike: 90,
      instrumentKey: "XLE|CALL|90|2026-01-16",
      openingClosingEffect: "TO_OPEN",
      side: "BUY",
    });
    const closeAfterSplit = optionExecution({
      id: "xle-close-45",
      tradeDate: date("2025-12-10T00:00:00.000Z"),
      eventTimestamp: date("2025-12-10T15:00:00.000Z"),
      quantity: 4,
      price: 2.4,
      strike: 45,
      instrumentKey: "XLE|CALL|45|2026-01-16",
      openingClosingEffect: "TO_CLOSE",
      side: "SELL",
    });
    const adjustments = [splitAdjustment()];
    const asOfDate = date("2026-02-01T00:00:00.000Z");

    const before = runFifoMatcher([openBeforeSplit, closeAfterSplit], asOfDate);
    expect(before.syntheticExecutions).toHaveLength(1);
    expect(before.warnings.some((warning) => warning.code === "UNMATCHED_CLOSE_QUANTITY")).toBe(true);
    expect(before.warnings.some((warning) => warning.code === "SYNTHETIC_EXPIRATION_INFERRED")).toBe(true);

    const adjustedExecutions = applySplitAdjustmentsToLedgerExecutions([openBeforeSplit, closeAfterSplit], adjustments);
    const adjustedOpen = adjustedExecutions.find((execution) => execution.id === "xle-open-90");
    expect(adjustedOpen?.instrumentKey).toBe("XLE|CALL|45|2026-01-16");
    expect(adjustedOpen?.quantity).toBeCloseTo(4, 8);
    expect(adjustedOpen?.price).toBeCloseTo(2.15, 8);
    expect(adjustedOpen?.strike).toBeCloseTo(45, 8);

    const after = runFifoMatcher(adjustedExecutions, asOfDate);
    expect(after.syntheticExecutions).toHaveLength(0);
    expect(after.warnings.some((warning) => warning.code === "UNMATCHED_CLOSE_QUANTITY")).toBe(false);
    expect(after.warnings.some((warning) => warning.code === "SYNTHETIC_EXPIRATION_INFERRED")).toBe(false);
    expect(after.matchedLots).toHaveLength(1);
    expect(after.matchedLots[0]?.openExecutionId).toBe("xle-open-90");
    expect(after.matchedLots[0]?.closeExecutionId).toBe("xle-close-45");
  });

  it("preserves equity split scaling behavior and leaves instrument key unchanged", () => {
    const equityOpen: LedgerExecution = {
      id: "xle-equity-open",
      importId: "import-1",
      accountId: "account-1",
      broker: "SCHWAB_THINKORSWIM",
      eventTimestamp: date("2025-11-20T15:00:00.000Z"),
      tradeDate: date("2025-11-20T00:00:00.000Z"),
      eventType: "TRADE",
      assetClass: "EQUITY",
      symbol: "XLE",
      instrumentKey: "XLE",
      side: "BUY",
      quantity: 100,
      price: 50,
      openingClosingEffect: "TO_OPEN",
      expirationDate: null,
      optionType: null,
      strike: null,
    };

    const [adjusted] = applySplitAdjustmentsToLedgerExecutions([equityOpen], [splitAdjustment()]);
    expect(adjusted?.instrumentKey).toBe("XLE");
    expect(adjusted?.quantity).toBeCloseTo(200, 8);
    expect(adjusted?.price).toBeCloseTo(25, 8);
  });
});
