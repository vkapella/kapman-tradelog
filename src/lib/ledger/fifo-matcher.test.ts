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
    underlyingSymbol: "SPY",
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

describe("runFifoMatcher", () => {
  it("handles partial closes and preserves open remainder", () => {
    const open = makeExecution({
      id: "open-1",
      quantity: 10,
      price: 1,
      side: "BUY",
      openingClosingEffect: "TO_OPEN",
      assetClass: "EQUITY",
      instrumentKey: "AAPL",
      symbol: "AAPL",
      expirationDate: null,
      optionType: null,
      strike: null,
    });
    const close = makeExecution({
      id: "close-1",
      eventTimestamp: date("2026-01-02T14:30:00.000Z"),
      tradeDate: date("2026-01-02T00:00:00.000Z"),
      side: "SELL",
      quantity: 4,
      price: 2,
      openingClosingEffect: "TO_CLOSE",
      assetClass: "EQUITY",
      instrumentKey: "AAPL",
      symbol: "AAPL",
      expirationDate: null,
      optionType: null,
      strike: null,
    });
    const secondClose = makeExecution({
      id: "close-2",
      eventTimestamp: date("2026-01-03T14:30:00.000Z"),
      tradeDate: date("2026-01-03T00:00:00.000Z"),
      side: "SELL",
      quantity: 6,
      price: 3,
      openingClosingEffect: "TO_CLOSE",
      assetClass: "EQUITY",
      instrumentKey: "AAPL",
      symbol: "AAPL",
      expirationDate: null,
      optionType: null,
      strike: null,
    });

    const result = runFifoMatcher([open, close, secondClose], date("2026-02-01T00:00:00.000Z"));

    expect(result.matchedLots).toHaveLength(2);
    expect(result.matchedLots[0]?.quantity).toBe(4);
    expect(result.matchedLots[0]?.realizedPnl).toBe(4);
    expect(result.matchedLots[1]?.quantity).toBe(6);
    expect(result.matchedLots[1]?.realizedPnl).toBe(12);
    expect(result.warnings).toHaveLength(0);
  });

  it("handles roll behavior as close then fresh open on the same day", () => {
    const firstOpen = makeExecution({
      id: "open-roll-1",
      eventTimestamp: date("2026-01-10T13:00:00.000Z"),
      tradeDate: date("2026-01-10T00:00:00.000Z"),
      side: "BUY",
      quantity: 1,
      price: 2,
      openingClosingEffect: "TO_OPEN",
    });
    const close = makeExecution({
      id: "close-roll-1",
      eventTimestamp: date("2026-01-15T15:00:00.000Z"),
      tradeDate: date("2026-01-15T00:00:00.000Z"),
      side: "SELL",
      quantity: 1,
      price: 3,
      openingClosingEffect: "TO_CLOSE",
    });
    const reopen = makeExecution({
      id: "open-roll-2",
      eventTimestamp: date("2026-01-15T15:01:00.000Z"),
      tradeDate: date("2026-01-15T00:00:00.000Z"),
      side: "BUY",
      quantity: 1,
      price: 2.5,
      openingClosingEffect: "TO_OPEN",
    });
    const secondClose = makeExecution({
      id: "close-roll-2",
      eventTimestamp: date("2026-01-20T15:00:00.000Z"),
      tradeDate: date("2026-01-20T00:00:00.000Z"),
      side: "SELL",
      quantity: 1,
      price: 2.8,
      openingClosingEffect: "TO_CLOSE",
    });

    const result = runFifoMatcher([firstOpen, close, reopen, secondClose], date("2026-02-01T00:00:00.000Z"));

    expect(result.matchedLots).toHaveLength(2);
    expect(result.matchedLots[0]?.openExecutionId).toBe("open-roll-1");
    expect(result.matchedLots[0]?.closeExecutionId).toBe("close-roll-1");
    expect(result.matchedLots[1]?.openExecutionId).toBe("open-roll-2");
    expect(result.matchedLots[1]?.closeExecutionId).toBe("close-roll-2");
  });

  it("handles short option close via buy-to-close", () => {
    const openShort = makeExecution({
      id: "open-short",
      side: "SELL",
      quantity: 2,
      price: 3,
      openingClosingEffect: "TO_OPEN",
    });
    const closeShort = makeExecution({
      id: "close-short",
      eventTimestamp: date("2026-01-12T14:30:00.000Z"),
      tradeDate: date("2026-01-12T00:00:00.000Z"),
      side: "BUY",
      quantity: 2,
      price: 1,
      openingClosingEffect: "TO_CLOSE",
    });

    const result = runFifoMatcher([openShort, closeShort], date("2026-02-01T00:00:00.000Z"));

    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0]?.realizedPnl).toBe(400);
    expect(result.matchedLots[0]?.outcome).toBe("WIN");
  });

  it("creates synthetic expiration closes at zero for expired open options", () => {
    const openOption = makeExecution({
      id: "open-exp",
      side: "BUY",
      quantity: 1,
      price: 2,
      openingClosingEffect: "TO_OPEN",
      expirationDate: date("2026-01-17T00:00:00.000Z"),
      instrumentKey: "SPY|CALL|500|2026-01-17",
    });

    const result = runFifoMatcher([openOption], date("2026-01-25T00:00:00.000Z"));

    expect(result.syntheticExecutions).toHaveLength(1);
    expect(result.syntheticExecutions[0]?.eventType).toBe("EXPIRATION_INFERRED");
    expect(result.syntheticExecutions[0]?.price).toBe(0);
    expect(result.syntheticExecutions[0]?.underlyingSymbol).toBe("SPY");
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0]?.realizedPnl).toBe(-200);
    expect(result.warnings.some((warning) => warning.code === "SYNTHETIC_EXPIRATION_INFERRED")).toBe(true);
  });

  it("does not create synthetic expiration for 0DTE lot fully closed on expiry date", () => {
    const sharedTimestamp = date("2024-12-05T00:00:00.000Z");
    const open = makeExecution({
      id: "z-open-0dte",
      eventTimestamp: sharedTimestamp,
      tradeDate: sharedTimestamp,
      side: "BUY",
      quantity: 1,
      price: 2,
      openingClosingEffect: "TO_OPEN",
      symbol: "-SPXW241205C6095",
      underlyingSymbol: "SPXW",
      instrumentKey: "SPXW|CALL|6095|2024-12-05",
      expirationDate: date("2024-12-05T00:00:00.000Z"),
      optionType: "CALL",
      strike: 6095,
    });
    const close = makeExecution({
      id: "a-close-0dte",
      eventTimestamp: sharedTimestamp,
      tradeDate: sharedTimestamp,
      side: "SELL",
      quantity: 1,
      price: 1.5,
      openingClosingEffect: "TO_CLOSE",
      symbol: "-SPXW241205C6095",
      underlyingSymbol: "SPXW",
      instrumentKey: "SPXW|CALL|6095|2024-12-05",
      expirationDate: date("2024-12-05T00:00:00.000Z"),
      optionType: "CALL",
      strike: 6095,
    });

    const result = runFifoMatcher([open, close], date("2024-12-10T00:00:00.000Z"));

    expect(result.syntheticExecutions).toHaveLength(0);
    expect(result.matchedLots).toHaveLength(1);
    expect(result.warnings.some((warning) => warning.code === "UNMATCHED_CLOSE_QUANTITY")).toBe(false);
    expect(result.warnings.some((warning) => warning.code === "SYNTHETIC_EXPIRATION_INFERRED")).toBe(false);
  });

  it("creates synthetic expiration only for remaining quantity after partial 0DTE close", () => {
    const sharedTimestamp = date("2024-08-09T00:00:00.000Z");
    const open = makeExecution({
      id: "z-open-0dte-partial",
      eventTimestamp: sharedTimestamp,
      tradeDate: sharedTimestamp,
      side: "BUY",
      quantity: 2,
      price: 2.2,
      openingClosingEffect: "TO_OPEN",
      symbol: "-INTC240809P31",
      underlyingSymbol: "INTC",
      instrumentKey: "INTC|PUT|31|2024-08-09",
      expirationDate: date("2024-08-09T00:00:00.000Z"),
      optionType: "PUT",
      strike: 31,
    });
    const close = makeExecution({
      id: "a-close-0dte-partial",
      eventTimestamp: sharedTimestamp,
      tradeDate: sharedTimestamp,
      side: "SELL",
      quantity: 1,
      price: 2.4,
      openingClosingEffect: "TO_CLOSE",
      symbol: "-INTC240809P31",
      underlyingSymbol: "INTC",
      instrumentKey: "INTC|PUT|31|2024-08-09",
      expirationDate: date("2024-08-09T00:00:00.000Z"),
      optionType: "PUT",
      strike: 31,
    });

    const result = runFifoMatcher([open, close], date("2024-08-15T00:00:00.000Z"));

    expect(result.syntheticExecutions).toHaveLength(1);
    expect(result.syntheticExecutions[0]?.quantity).toBe(1);
    expect(result.syntheticExecutions[0]?.instrumentKey).toBe("INTC|PUT|31|2024-08-09");
    expect(result.matchedLots).toHaveLength(2);
    expect(result.warnings.some((warning) => warning.code === "UNMATCHED_CLOSE_QUANTITY")).toBe(false);
    expect(result.warnings.some((warning) => warning.code === "SYNTHETIC_EXPIRATION_INFERRED")).toBe(true);
  });

  it("creates synthetic expiration for fully open 0DTE lot at expiry", () => {
    const open = makeExecution({
      id: "open-0dte-unclosed",
      eventTimestamp: date("2024-07-05T00:00:00.000Z"),
      tradeDate: date("2024-07-05T00:00:00.000Z"),
      side: "BUY",
      quantity: 1,
      price: 1.9,
      openingClosingEffect: "TO_OPEN",
      symbol: "-INTC240705C32",
      underlyingSymbol: "INTC",
      instrumentKey: "INTC|CALL|32|2024-07-05",
      expirationDate: date("2024-07-05T00:00:00.000Z"),
      optionType: "CALL",
      strike: 32,
    });

    const result = runFifoMatcher([open], date("2024-07-10T00:00:00.000Z"));

    expect(result.syntheticExecutions).toHaveLength(1);
    expect(result.syntheticExecutions[0]?.instrumentKey).toBe("INTC|CALL|32|2024-07-05");
    expect(result.matchedLots).toHaveLength(1);
    expect(result.warnings.some((warning) => warning.code === "SYNTHETIC_EXPIRATION_INFERRED")).toBe(true);
  });

  it("derives synthetic expiration underlying symbol from instrument key when missing on source execution", () => {
    const openOption = makeExecution({
      id: "open-exp-key-underlying",
      symbol: "-HOOD250620P50",
      underlyingSymbol: null,
      side: "SELL",
      optionType: "PUT",
      strike: 50,
      quantity: 2,
      price: 1.25,
      openingClosingEffect: "TO_OPEN",
      expirationDate: date("2025-06-20T00:00:00.000Z"),
      instrumentKey: "HOOD|PUT|50|2025-06-20",
    });

    const result = runFifoMatcher([openOption], date("2025-06-25T00:00:00.000Z"));
    expect(result.syntheticExecutions).toHaveLength(1);
    expect(result.syntheticExecutions[0]?.underlyingSymbol).toBe("HOOD");
  });

  it("derives synthetic expiration underlying symbol from compact option symbol when instrument key is incomplete", () => {
    const openOption = makeExecution({
      id: "open-exp-symbol-underlying",
      symbol: "-INTC250620C25",
      underlyingSymbol: null,
      side: "BUY",
      optionType: "CALL",
      strike: 25,
      quantity: 1,
      price: 1.5,
      openingClosingEffect: "TO_OPEN",
      expirationDate: date("2025-06-20T00:00:00.000Z"),
      instrumentKey: "NA|CALL|25|2025-06-20",
    });

    const result = runFifoMatcher([openOption], date("2025-06-25T00:00:00.000Z"));
    expect(result.syntheticExecutions).toHaveLength(1);
    expect(result.syntheticExecutions[0]?.underlyingSymbol).toBe("INTC");
  });

  it("treats assignment/exercise as forced close when strike exists", () => {
    const openShort = makeExecution({
      id: "open-assignment",
      side: "SELL",
      quantity: 1,
      price: 2,
      openingClosingEffect: "TO_OPEN",
      strike: 100,
      instrumentKey: "XYZ|CALL|100|2026-03-20",
    });
    const assignmentClose = makeExecution({
      id: "assignment-close",
      eventTimestamp: date("2026-01-14T16:00:00.000Z"),
      tradeDate: date("2026-01-14T00:00:00.000Z"),
      eventType: "ASSIGNMENT",
      side: "BUY",
      quantity: 1,
      price: null,
      strike: 100,
      openingClosingEffect: "TO_CLOSE",
      instrumentKey: "XYZ|CALL|100|2026-03-20",
      symbol: "XYZ",
    });

    const result = runFifoMatcher([openShort, assignmentClose], date("2026-02-01T00:00:00.000Z"));

    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0]?.realizedPnl).toBe(-9800);
  });

  it("matches multiple opens to one close in FIFO order", () => {
    const firstOpen = makeExecution({
      id: "fifo-open-1",
      side: "BUY",
      quantity: 1,
      price: 1,
      openingClosingEffect: "TO_OPEN",
      assetClass: "EQUITY",
      instrumentKey: "MSFT",
      symbol: "MSFT",
      expirationDate: null,
      optionType: null,
      strike: null,
    });
    const secondOpen = makeExecution({
      id: "fifo-open-2",
      eventTimestamp: date("2026-01-03T14:30:00.000Z"),
      tradeDate: date("2026-01-03T00:00:00.000Z"),
      side: "BUY",
      quantity: 1,
      price: 2,
      openingClosingEffect: "TO_OPEN",
      assetClass: "EQUITY",
      instrumentKey: "MSFT",
      symbol: "MSFT",
      expirationDate: null,
      optionType: null,
      strike: null,
    });
    const close = makeExecution({
      id: "fifo-close",
      eventTimestamp: date("2026-01-04T14:30:00.000Z"),
      tradeDate: date("2026-01-04T00:00:00.000Z"),
      side: "SELL",
      quantity: 2,
      price: 3,
      openingClosingEffect: "TO_CLOSE",
      assetClass: "EQUITY",
      instrumentKey: "MSFT",
      symbol: "MSFT",
      expirationDate: null,
      optionType: null,
      strike: null,
    });

    const result = runFifoMatcher([firstOpen, secondOpen, close], date("2026-02-01T00:00:00.000Z"));

    expect(result.matchedLots).toHaveLength(2);
    expect(result.matchedLots[0]?.openExecutionId).toBe("fifo-open-1");
    expect(result.matchedLots[1]?.openExecutionId).toBe("fifo-open-2");
    expect(result.matchedLots[0]?.realizedPnl).toBe(2);
    expect(result.matchedLots[1]?.realizedPnl).toBe(1);
  });

  it("flags potential wash sales without adjusting realized pnl", () => {
    const firstOpen = makeExecution({
      id: "wash-open-1",
      side: "BUY",
      quantity: 1,
      price: 10,
      openingClosingEffect: "TO_OPEN",
      assetClass: "EQUITY",
      instrumentKey: "TSLA",
      symbol: "TSLA",
      expirationDate: null,
      optionType: null,
      strike: null,
    });
    const closeLoss = makeExecution({
      id: "wash-close-1",
      eventTimestamp: date("2026-01-05T14:30:00.000Z"),
      tradeDate: date("2026-01-05T00:00:00.000Z"),
      side: "SELL",
      quantity: 1,
      price: 8,
      openingClosingEffect: "TO_CLOSE",
      assetClass: "EQUITY",
      instrumentKey: "TSLA",
      symbol: "TSLA",
      expirationDate: null,
      optionType: null,
      strike: null,
    });
    const replacementOpen = makeExecution({
      id: "wash-open-2",
      eventTimestamp: date("2026-01-10T14:30:00.000Z"),
      tradeDate: date("2026-01-10T00:00:00.000Z"),
      side: "BUY",
      quantity: 1,
      price: 9,
      openingClosingEffect: "TO_OPEN",
      assetClass: "EQUITY",
      instrumentKey: "TSLA",
      symbol: "TSLA",
      expirationDate: null,
      optionType: null,
      strike: null,
    });

    const result = runFifoMatcher([firstOpen, closeLoss, replacementOpen], date("2026-02-01T00:00:00.000Z"));

    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0]?.realizedPnl).toBe(-2);
    expect(result.matchedLots[0]?.outcome).toBe("LOSS");
    expect(result.matchedLots[0]?.washSaleFlagged).toBe(true);
    expect(result.warnings.some((warning) => warning.code === "WASH_SALE_FLAGGED")).toBe(true);
  });
});
