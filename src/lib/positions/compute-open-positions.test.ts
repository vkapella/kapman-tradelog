import { describe, expect, it } from "vitest";
import type { ExecutionRecord, MatchedLotRecord } from "@/types/api";
import { computeOpenPositions } from "./compute-open-positions";

function execution(overrides: Partial<ExecutionRecord> & Pick<ExecutionRecord, "id" | "symbol" | "accountId">): ExecutionRecord {
  return {
    id: overrides.id,
    accountId: overrides.accountId,
    broker: "SCHWAB_THINKORSWIM",
    symbol: overrides.symbol,
    tradeDate: overrides.tradeDate ?? "2026-01-01T00:00:00.000Z",
    eventTimestamp: overrides.eventTimestamp ?? "2026-01-01T13:00:00.000Z",
    eventType: overrides.eventType ?? "TRADE",
    assetClass: overrides.assetClass ?? "EQUITY",
    side: overrides.side ?? "BUY",
    quantity: overrides.quantity ?? "1",
    price: overrides.price ?? "1",
    openingClosingEffect: overrides.openingClosingEffect ?? "TO_OPEN",
    instrumentKey: overrides.instrumentKey ?? overrides.symbol,
    underlyingSymbol: overrides.underlyingSymbol ?? overrides.symbol,
    optionType: overrides.optionType ?? null,
    strike: overrides.strike ?? null,
    expirationDate: overrides.expirationDate ?? null,
    spreadGroupId: overrides.spreadGroupId ?? null,
    importId: overrides.importId ?? "import-1",
  };
}

function matchedLot(overrides: Partial<MatchedLotRecord> & Pick<MatchedLotRecord, "id" | "openExecutionId">): MatchedLotRecord {
  return {
    id: overrides.id,
    accountId: overrides.accountId ?? "account-1",
    symbol: overrides.symbol ?? "SDS",
    openTradeDate: overrides.openTradeDate ?? "2026-01-01T00:00:00.000Z",
    closeTradeDate: overrides.closeTradeDate ?? "2026-01-02T00:00:00.000Z",
    openImportId: overrides.openImportId ?? "import-1",
    closeImportId: overrides.closeImportId ?? "import-2",
    quantity: overrides.quantity ?? "1",
    realizedPnl: overrides.realizedPnl ?? "0",
    holdingDays: overrides.holdingDays ?? 1,
    outcome: overrides.outcome ?? "WIN",
    openExecutionId: overrides.openExecutionId,
    closeExecutionId: overrides.closeExecutionId ?? "close-1",
  };
}

describe("computeOpenPositions", () => {
  it("subtracts partial matches from open quantity per execution instead of dropping full opens", () => {
    const executions: ExecutionRecord[] = [
      execution({ id: "open-a", accountId: "account-1", symbol: "SDS", quantity: "200", price: "14.87", instrumentKey: "SDS" }),
      execution({ id: "open-b", accountId: "account-1", symbol: "SDS", quantity: "100", price: "14.67", instrumentKey: "SDS" }),
    ];

    const lots: MatchedLotRecord[] = [
      matchedLot({ id: "lot-a", openExecutionId: "open-a", quantity: "30", symbol: "SDS", accountId: "account-1" }),
    ];

    const result = computeOpenPositions(executions, lots);

    expect(result).toHaveLength(1);
    expect(result[0]?.symbol).toBe("SDS");
    expect(result[0]?.netQty).toBe(270);
    expect(result[0]?.costBasis).toBeCloseTo(3994.9, 6);
  });

  it("uses option multiplier when computing remaining cost basis", () => {
    const executions: ExecutionRecord[] = [
      execution({
        id: "open-opt",
        accountId: "account-1",
        symbol: "AVGO",
        assetClass: "OPTION",
        optionType: "PUT",
        strike: "320",
        expirationDate: "2026-05-15T00:00:00.000Z",
        side: "SELL",
        quantity: "2",
        price: "1.98",
        instrumentKey: "AVGO|PUT|320|2026-05-15",
      }),
    ];

    const lots: MatchedLotRecord[] = [
      matchedLot({ id: "lot-opt", openExecutionId: "open-opt", quantity: "1", symbol: "AVGO", accountId: "account-1" }),
    ];

    const result = computeOpenPositions(executions, lots);

    expect(result).toHaveLength(1);
    expect(result[0]?.netQty).toBe(-1);
    expect(result[0]?.costBasis).toBeCloseTo(-198, 6);
  });
});
