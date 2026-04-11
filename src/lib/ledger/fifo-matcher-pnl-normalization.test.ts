import { describe, expect, it } from "vitest";
import { runFifoMatcher, type LedgerExecution } from "./fifo-matcher";

function date(value: string): Date {
  return new Date(value);
}

function makeExecution(overrides: Partial<LedgerExecution>): LedgerExecution {
  const base: LedgerExecution = {
    id: "exec-base",
    importId: "import-1",
    accountId: "account-1",
    broker: "SCHWAB_THINKORSWIM",
    eventTimestamp: date("2026-01-01T14:30:00.000Z"),
    tradeDate: date("2026-01-01T00:00:00.000Z"),
    eventType: "TRADE",
    assetClass: "OPTION",
    symbol: "SPY",
    instrumentKey: "SPY|CALL|500|2026-03-20",
    side: "BUY",
    quantity: 1,
    price: 1,
    openingClosingEffect: "TO_OPEN",
    expirationDate: date("2026-03-20T00:00:00.000Z"),
    optionType: "CALL",
    strike: 500,
  };

  return { ...base, ...overrides };
}

describe("runFifoMatcher P&L normalization", () => {
  it("applies 100x multiplier for long option realized P&L", () => {
    const open = makeExecution({
      id: "opt-long-open",
      side: "BUY",
      quantity: 5,
      price: 1,
      openingClosingEffect: "TO_OPEN",
    });
    const close = makeExecution({
      id: "opt-long-close",
      eventTimestamp: date("2026-01-05T14:30:00.000Z"),
      tradeDate: date("2026-01-05T00:00:00.000Z"),
      side: "SELL",
      quantity: 5,
      price: 2.5,
      openingClosingEffect: "TO_CLOSE",
    });

    const result = runFifoMatcher([open, close], date("2026-02-01T00:00:00.000Z"));
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0]?.realizedPnl).toBe(750);
  });

  it("applies 100x multiplier for short option realized P&L", () => {
    const open = makeExecution({
      id: "opt-short-open",
      side: "SELL",
      quantity: 3,
      price: 3,
      openingClosingEffect: "TO_OPEN",
    });
    const close = makeExecution({
      id: "opt-short-close",
      eventTimestamp: date("2026-01-05T14:30:00.000Z"),
      tradeDate: date("2026-01-05T00:00:00.000Z"),
      side: "BUY",
      quantity: 3,
      price: 1.5,
      openingClosingEffect: "TO_CLOSE",
    });

    const result = runFifoMatcher([open, close], date("2026-02-01T00:00:00.000Z"));
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0]?.realizedPnl).toBe(450);
  });

  it("does not apply multiplier for equity realized P&L", () => {
    const open = makeExecution({
      id: "eq-open",
      assetClass: "EQUITY",
      symbol: "AAPL",
      instrumentKey: "AAPL",
      optionType: null,
      strike: null,
      expirationDate: null,
      side: "BUY",
      quantity: 100,
      price: 79,
      openingClosingEffect: "TO_OPEN",
    });
    const close = makeExecution({
      id: "eq-close",
      assetClass: "EQUITY",
      symbol: "AAPL",
      instrumentKey: "AAPL",
      optionType: null,
      strike: null,
      expirationDate: null,
      eventTimestamp: date("2026-01-05T14:30:00.000Z"),
      tradeDate: date("2026-01-05T00:00:00.000Z"),
      side: "SELL",
      quantity: 100,
      price: 82,
      openingClosingEffect: "TO_CLOSE",
    });

    const result = runFifoMatcher([open, close], date("2026-02-01T00:00:00.000Z"));
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0]?.realizedPnl).toBe(300);
  });

  it("applies multiplier to synthetic expiration closes for long options", () => {
    const open = makeExecution({
      id: "opt-exp-long-open",
      side: "BUY",
      quantity: 4,
      price: 1.5,
      openingClosingEffect: "TO_OPEN",
      expirationDate: date("2026-01-17T00:00:00.000Z"),
      instrumentKey: "SPY|CALL|500|2026-01-17",
    });

    const result = runFifoMatcher([open], date("2026-01-25T00:00:00.000Z"));
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0]?.realizedPnl).toBe(-600);
  });

  it("applies multiplier to synthetic expiration closes for short options", () => {
    const open = makeExecution({
      id: "opt-exp-short-open",
      side: "SELL",
      quantity: 2,
      price: 1.5,
      openingClosingEffect: "TO_OPEN",
      expirationDate: date("2026-01-17T00:00:00.000Z"),
      instrumentKey: "SPY|PUT|400|2026-01-17",
      optionType: "PUT",
      strike: 400,
    });

    const result = runFifoMatcher([open], date("2026-01-25T00:00:00.000Z"));
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0]?.realizedPnl).toBe(300);
  });

  it("applies multiplier when assignment uses strike as effective close price", () => {
    const open = makeExecution({
      id: "opt-assignment-open",
      side: "SELL",
      quantity: 1,
      price: 2,
      strike: 100,
      openingClosingEffect: "TO_OPEN",
      instrumentKey: "XYZ|CALL|100|2026-03-20",
      symbol: "XYZ",
    });
    const close = makeExecution({
      id: "opt-assignment-close",
      eventTimestamp: date("2026-01-05T16:00:00.000Z"),
      tradeDate: date("2026-01-05T00:00:00.000Z"),
      eventType: "ASSIGNMENT",
      side: "BUY",
      quantity: 1,
      price: null,
      strike: 100,
      openingClosingEffect: "TO_CLOSE",
      instrumentKey: "XYZ|CALL|100|2026-03-20",
      symbol: "XYZ",
    });

    const result = runFifoMatcher([open, close], date("2026-02-01T00:00:00.000Z"));
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0]?.realizedPnl).toBe(-9800);
  });
});
