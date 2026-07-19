import { describe, expect, it } from "vitest";
import { normalizeHistoricalMarksForSplits, resolveMatchedLotPriceBasis } from "./matched-lot-price-basis";

describe("resolveMatchedLotPriceBasis", () => {
  it("recovers the split-adjusted entry basis from matched-lot P&L", () => {
    const result = resolveMatchedLotPriceBasis({
      direction: "LONG",
      assetClass: "EQUITY",
      quantity: 100,
      realizedPnl: 111,
      persistedEntryPrice: 91.78,
      persistedClosePrice: 47,
      closeEventType: "TRADE",
      closeStrike: null,
      isClosed: true,
    });

    expect(result).toEqual({ entryPrice: 45.89, closePrice: 47 });
  });

  it("mirrors FIFO's zero-price fallback for a null option close", () => {
    const result = resolveMatchedLotPriceBasis({
      direction: "SHORT",
      assetClass: "OPTION",
      quantity: 1,
      realizedPnl: 969,
      persistedEntryPrice: 9.69,
      persistedClosePrice: null,
      closeEventType: "TRADE",
      closeStrike: 65,
      isClosed: true,
    });

    expect(result).toEqual({ entryPrice: 9.69, closePrice: 0 });
  });

  it("uses the strike for assignment and exercise events", () => {
    const result = resolveMatchedLotPriceBasis({
      direction: "LONG",
      assetClass: "OPTION",
      quantity: 1,
      realizedPnl: 500,
      persistedEntryPrice: 5,
      persistedClosePrice: null,
      closeEventType: "EXERCISE",
      closeStrike: 10,
      isClosed: true,
    });

    expect(result).toEqual({ entryPrice: 5, closePrice: 10 });
  });

  it("preserves the persisted entry basis for an open lot", () => {
    expect(resolveMatchedLotPriceBasis({
      direction: "LONG",
      assetClass: "EQUITY",
      quantity: 10,
      realizedPnl: 0,
      persistedEntryPrice: 25,
      persistedClosePrice: null,
      closeEventType: null,
      closeStrike: null,
      isClosed: false,
    })).toEqual({ entryPrice: 25, closePrice: null });
  });
});

describe("normalizeHistoricalMarksForSplits", () => {
  it("places pre-split and post-split stock bars on one comparable price basis", () => {
    const result = normalizeHistoricalMarksForSplits(
      new Map([
        ["2025-10-28", { high: 92.16, low: 91.2 }],
        ["2026-01-07", { high: 42.1, low: 41.74 }],
      ]),
      "account-1",
      "XLU",
      [{
        accountId: "account-1",
        symbol: "XLU",
        effectiveDate: new Date("2025-12-05T00:00:00.000Z"),
        from: 1,
        to: 2,
      }],
    );

    expect(result.get("2025-10-28")).toEqual({ high: 46.08, low: 45.6 });
    expect(result.get("2026-01-07")).toEqual({ high: 42.1, low: 41.74 });
  });

  it("applies only matching account and symbol adjustments", () => {
    const marks = new Map([["2025-10-28", { high: 100, low: 90 }]]);
    const result = normalizeHistoricalMarksForSplits(marks, "account-1", "XLU", [{
      accountId: "other-account",
      symbol: "XLU",
      effectiveDate: new Date("2025-12-05T00:00:00.000Z"),
      from: 1,
      to: 2,
    }]);

    expect(result).toBe(marks);
  });
});
