import { beforeEach, describe, expect, it, vi } from "vitest";

const marketDataMocks = vi.hoisted(() => {
  class MockMcpUnavailableError extends Error {
    public readonly code = "MCP_UNAVAILABLE";
  }

  return {
    callMcpTool: vi.fn(),
    MockMcpUnavailableError,
  };
});

vi.mock("@/lib/mcp/client", () => {
  return {
    callMcpTool: marketDataMocks.callMcpTool,
    McpUnavailableError: marketDataMocks.MockMcpUnavailableError,
  };
});

describe("market-data MCP adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps equity quote payload to EquityQuoteRecord", async () => {
    marketDataMocks.callMcpTool.mockResolvedValueOnce({
      SPY: {
        quote: {
          mark: 501.1,
          bidPrice: 501.0,
          askPrice: 501.2,
          lastPrice: 501.05,
          netChange: -2.2,
          netPercentChangeInDouble: -0.44,
        },
      },
    });

    const { getEquityQuotes } = await import("./market-data");
    const result = await getEquityQuotes(["SPY"]);

    expect(result).toEqual({
      SPY: {
        mark: 501.1,
        bid: 501.0,
        ask: 501.2,
        last: 501.05,
        netChange: -2.2,
        netPctChange: -0.44,
      },
    });
  });

  it("maps option contract from option chain to OptionQuoteRecord", async () => {
    marketDataMocks.callMcpTool.mockResolvedValueOnce({
      callExpDateMap: {
        "2026-12-18:252": {
          "500.0": [
            {
              mark: 3.1,
              bid: 3.0,
              ask: 3.2,
              delta: 0.45,
              theta: -0.04,
              volatility: 22.5,
              daysToExpiration: 252,
              inTheMoney: false,
            },
          ],
        },
      },
    });

    const { getOptionQuote } = await import("./market-data");
    const result = await getOptionQuote("SPY", 500, "2026-12-18", "CALL");

    expect(result).toEqual({
      mark: 3.1,
      bid: 3.0,
      ask: 3.2,
      delta: 0.45,
      theta: -0.04,
      iv: 22.5,
      dte: 252,
      inTheMoney: false,
    });
  });

  it("returns null when MCP is unavailable", async () => {
    marketDataMocks.callMcpTool.mockRejectedValueOnce(new marketDataMocks.MockMcpUnavailableError("down"));

    const { getEquityQuotes } = await import("./market-data");
    const result = await getEquityQuotes(["SPY"]);

    expect(result).toBeNull();
  });
});
