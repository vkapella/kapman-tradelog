import { describe, expect, it } from "vitest";
import type { ExecutionRecord, ManualAdjustmentRecord, MatchedLotRecord } from "@/types/api";
import { computeOpenPositions } from "./compute-open-positions";
import { computeHoldingsAsOf } from "./compute-holdings-asof";

function execution(overrides: Partial<ExecutionRecord> & Pick<ExecutionRecord, "id" | "symbol" | "accountId">): ExecutionRecord {
  return {
    id: overrides.id,
    accountId: overrides.accountId,
    broker: overrides.broker ?? "SCHWAB_THINKORSWIM",
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
    symbol: overrides.symbol ?? "SPY",
    underlyingSymbol: overrides.underlyingSymbol ?? overrides.symbol ?? "SPY",
    openTradeDate: overrides.openTradeDate ?? "2026-01-01T00:00:00.000Z",
    closeTradeDate: "closeTradeDate" in overrides ? (overrides.closeTradeDate ?? null) : "2026-01-02T00:00:00.000Z",
    openImportId: overrides.openImportId ?? "import-1",
    closeImportId: "closeImportId" in overrides ? (overrides.closeImportId ?? null) : "import-2",
    quantity: overrides.quantity ?? "1",
    realizedPnl: overrides.realizedPnl ?? "0",
    holdingDays: overrides.holdingDays ?? 1,
    outcome: overrides.outcome ?? "WIN",
    openExecutionId: overrides.openExecutionId,
    closeExecutionId: "closeExecutionId" in overrides ? (overrides.closeExecutionId ?? null) : "close-1",
  };
}

function adjustment(overrides: Partial<ManualAdjustmentRecord> = {}): ManualAdjustmentRecord {
  return {
    id: overrides.id ?? "adj-1",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    createdBy: overrides.createdBy ?? "tester",
    accountId: overrides.accountId ?? "account-1",
    accountExternalId: overrides.accountExternalId ?? "D-1",
    symbol: overrides.symbol ?? "SPY",
    effectiveDate: overrides.effectiveDate ?? "2026-01-01T00:00:00.000Z",
    adjustmentType: overrides.adjustmentType ?? "SPLIT",
    payload: overrides.payload ?? { from: 2, to: 1 },
    reason: overrides.reason ?? "adjustment",
    evidenceRef: overrides.evidenceRef ?? null,
    status: overrides.status ?? "ACTIVE",
    reversedByAdjustmentId: overrides.reversedByAdjustmentId ?? null,
  };
}

describe("computeHoldingsAsOf", () => {
  it("holds a single equity buy at end of trade date and after, but not before", () => {
    const executions: ExecutionRecord[] = [
      execution({
        id: "open-spy",
        accountId: "account-1",
        symbol: "SPY",
        quantity: "100",
        price: "501.25",
        tradeDate: "2026-01-02T18:30:00.000Z",
        eventTimestamp: "2026-01-02T18:30:00.000Z",
      }),
    ];

    expect(computeHoldingsAsOf(executions, [], [], new Date("2026-01-01T00:00:00.000Z"))).toEqual([]);

    const atTradeDate = computeHoldingsAsOf(executions, [], [], new Date("2026-01-02T00:00:00.000Z"));
    expect(atTradeDate).toHaveLength(1);
    expect(atTradeDate[0]?.netQty).toBe(100);
    expect(atTradeDate[0]?.costBasis).toBeCloseTo(50125, 6);

    const afterTradeDate = computeHoldingsAsOf(executions, [], [], new Date("2026-01-03T00:00:00.000Z"));
    expect(afterTradeDate).toEqual(atTradeDate);
  });

  it("keeps a lot open until its close trade date and is flat from the close date", () => {
    const executions: ExecutionRecord[] = [
      execution({
        id: "open-spy",
        accountId: "account-1",
        symbol: "SPY",
        quantity: "100",
        price: "500",
        tradeDate: "2026-01-01T14:00:00.000Z",
      }),
    ];
    const lots: MatchedLotRecord[] = [
      matchedLot({
        id: "lot-spy",
        openExecutionId: "open-spy",
        quantity: "100",
        closeTradeDate: "2026-01-05T15:00:00.000Z",
      }),
    ];

    expect(computeHoldingsAsOf(executions, lots, [], new Date("2026-01-04T00:00:00.000Z"))).toHaveLength(1);
    expect(computeHoldingsAsOf(executions, lots, [], new Date("2026-01-05T00:00:00.000Z"))).toEqual([]);
  });

  it("subtracts only partial close lots whose close trade date is on or before as-of date", () => {
    const executions: ExecutionRecord[] = [
      execution({
        id: "open-spy",
        accountId: "account-1",
        symbol: "SPY",
        quantity: "100",
        price: "10",
        tradeDate: "2026-01-01T14:00:00.000Z",
      }),
    ];
    const lots: MatchedLotRecord[] = [
      matchedLot({
        id: "lot-before",
        openExecutionId: "open-spy",
        quantity: "40",
        closeTradeDate: "2026-01-03T16:00:00.000Z",
      }),
      matchedLot({
        id: "lot-after",
        openExecutionId: "open-spy",
        quantity: "30",
        closeTradeDate: "2026-01-07T16:00:00.000Z",
      }),
      matchedLot({
        id: "lot-open",
        openExecutionId: "open-spy",
        quantity: "30",
        closeTradeDate: null,
        closeImportId: null,
        closeExecutionId: null,
      }),
    ];

    const beforePartialClose = computeHoldingsAsOf(executions, lots, [], new Date("2026-01-02T00:00:00.000Z"));
    expect(beforePartialClose[0]?.netQty).toBe(100);
    expect(beforePartialClose[0]?.costBasis).toBeCloseTo(1000, 6);

    const afterPartialClose = computeHoldingsAsOf(executions, lots, [], new Date("2026-01-03T00:00:00.000Z"));
    expect(afterPartialClose[0]?.netQty).toBe(60);
    expect(afterPartialClose[0]?.costBasis).toBeCloseTo(600, 6);
  });

  it("applies the option multiplier to as-of option cost basis", () => {
    const executions: ExecutionRecord[] = [
      execution({
        id: "open-spy-call",
        accountId: "account-1",
        symbol: "SPY",
        underlyingSymbol: "SPY",
        assetClass: "OPTION",
        optionType: "CALL",
        strike: "500",
        expirationDate: "2026-01-16T00:00:00.000Z",
        side: "BUY",
        quantity: "2",
        price: "3.5",
        instrumentKey: "SPY|CALL|500|2026-01-16",
      }),
    ];

    const result = computeHoldingsAsOf(executions, [], [], new Date("2026-01-01T00:00:00.000Z"));

    expect(result).toHaveLength(1);
    expect(result[0]?.assetClass).toBe("OPTION");
    expect(result[0]?.netQty).toBe(2);
    expect(result[0]?.costBasis).toBeCloseTo(700, 6);
  });

  it("matches computeOpenPositions when as-of date is beyond all trades and closes", () => {
    const executions: ExecutionRecord[] = [
      execution({
        id: "open-spy-a",
        accountId: "account-1",
        symbol: "SPY",
        quantity: "100",
        price: "10",
        tradeDate: "2026-01-01T14:00:00.000Z",
      }),
      execution({
        id: "open-spy-b",
        accountId: "account-1",
        symbol: "SPY",
        quantity: "25",
        price: "12",
        tradeDate: "2026-01-02T14:00:00.000Z",
      }),
      execution({
        id: "open-qqq-put",
        accountId: "account-1",
        symbol: "QQQ",
        underlyingSymbol: "QQQ",
        assetClass: "OPTION",
        optionType: "PUT",
        strike: "450",
        expirationDate: "2026-02-20T00:00:00.000Z",
        side: "SELL",
        quantity: "2",
        price: "2.1",
        instrumentKey: "QQQ|PUT|450|2026-02-20",
        tradeDate: "2026-01-02T14:00:00.000Z",
      }),
    ];
    const lots: MatchedLotRecord[] = [
      matchedLot({
        id: "lot-spy",
        symbol: "SPY",
        openExecutionId: "open-spy-a",
        quantity: "80",
        closeTradeDate: "2026-01-05T16:00:00.000Z",
      }),
      matchedLot({
        id: "lot-qqq",
        symbol: "QQQ",
        openExecutionId: "open-qqq-put",
        quantity: "1",
        closeTradeDate: "2026-01-06T16:00:00.000Z",
      }),
    ];
    const adjustments: ManualAdjustmentRecord[] = [
      adjustment({
        id: "price-override-spy-b",
        adjustmentType: "EXECUTION_PRICE_OVERRIDE",
        effectiveDate: "2026-01-03T00:00:00.000Z",
        payload: { executionId: "open-spy-b", overridePrice: 11 },
      }),
    ];

    expect(computeHoldingsAsOf(executions, lots, adjustments, new Date("2027-01-01T00:00:00.000Z"))).toEqual(
      computeOpenPositions(executions, lots, adjustments),
    );
  });

  it("does not apply split adjustments whose effective date is after the as-of date", () => {
    const executions: ExecutionRecord[] = [
      execution({
        id: "open-spy",
        accountId: "account-1",
        symbol: "SPY",
        quantity: "100",
        price: "20",
        tradeDate: "2026-01-01T14:00:00.000Z",
      }),
    ];
    const adjustments: ManualAdjustmentRecord[] = [
      adjustment({
        id: "split-spy",
        symbol: "SPY",
        effectiveDate: "2026-01-10T00:00:00.000Z",
        payload: { from: 2, to: 1 },
      }),
    ];

    const beforeSplit = computeHoldingsAsOf(executions, [], adjustments, new Date("2026-01-05T00:00:00.000Z"));
    expect(beforeSplit).toHaveLength(1);
    expect(beforeSplit[0]?.netQty).toBe(100);
    expect(beforeSplit[0]?.costBasis).toBeCloseTo(2000, 6);

    const afterSplit = computeHoldingsAsOf(executions, [], adjustments, new Date("2026-01-10T00:00:00.000Z"));
    expect(afterSplit[0]?.netQty).toBe(50);
    expect(afterSplit[0]?.costBasis).toBeCloseTo(2000, 6);
  });

  it("preserves the current plain equity buy predicate for UNKNOWN Fidelity rows", () => {
    const executions: ExecutionRecord[] = [
      execution({
        id: "plain-equity-buy",
        accountId: "account-1",
        broker: "FIDELITY",
        symbol: "SPHQ",
        quantity: "200",
        price: "76.13",
        openingClosingEffect: "UNKNOWN",
        assetClass: "EQUITY",
        side: "BUY",
        spreadGroupId: null,
      }),
      execution({
        id: "assignment-linked-buy",
        accountId: "account-1",
        broker: "FIDELITY",
        symbol: "DAL",
        quantity: "100",
        price: "65",
        openingClosingEffect: "UNKNOWN",
        assetClass: "EQUITY",
        side: "BUY",
        spreadGroupId: "assignment-link-1",
      }),
    ];

    const result = computeHoldingsAsOf(executions, [], [], new Date("2026-01-01T00:00:00.000Z"));

    expect(result).toHaveLength(1);
    expect(result[0]?.symbol).toBe("SPHQ");
    expect(result[0]?.netQty).toBe(200);
    expect(result[0]?.costBasis).toBeCloseTo(15226, 6);
  });
});
