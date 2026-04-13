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

  it("resolves multiple option legs from one underlying chain fetch", async () => {
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
          "505.0": [
            {
              mark: 2.4,
              bid: 2.3,
              ask: 2.5,
              delta: 0.39,
              theta: -0.05,
              volatility: 21.2,
              daysToExpiration: 252,
              inTheMoney: false,
            },
          ],
        },
        "2027-01-15:280": {
          "510.0": [
            {
              mark: 4.8,
              bid: 4.7,
              ask: 4.9,
              delta: 0.49,
              theta: -0.04,
              volatility: 23.1,
              daysToExpiration: 280,
              inTheMoney: false,
            },
          ],
        },
      },
    });

    const { getOptionQuotesBatch } = await import("./market-data");
    const result = await getOptionQuotesBatch([
      { underlyingSymbol: "SPY", strike: 500, expirationDate: "2026-12-18", optionType: "CALL" },
      { underlyingSymbol: "SPY", strike: 505, expirationDate: "2026-12-18", optionType: "CALL" },
      { underlyingSymbol: "SPY", strike: 510, expirationDate: "2027-01-15", optionType: "CALL" },
    ]);

    expect(Object.fromEntries(result)).toEqual({
      "SPY|CALL|500|2026-12-18": 3.1,
      "SPY|CALL|505|2026-12-18": 2.4,
      "SPY|CALL|510|2027-01-15": 4.8,
    });
    expect(marketDataMocks.callMcpTool).toHaveBeenCalledTimes(1);
    expect(marketDataMocks.callMcpTool).toHaveBeenCalledWith(
      "get_option_chain",
      expect.objectContaining({
        symbol: "SPY",
        contract_type: "CALL",
        from_date: "2026-12-18",
        to_date: "2027-01-15",
      }),
    );
  });

  it("returns null marks for missing option contracts without failing the batch", async () => {
    marketDataMocks.callMcpTool.mockResolvedValueOnce({
      putExpDateMap: {
        "2026-12-18:252": {
          "450.0": [
            {
              mark: 1.9,
              bid: 1.8,
              ask: 2.0,
              delta: -0.24,
              theta: -0.03,
              volatility: 19.1,
              daysToExpiration: 252,
              inTheMoney: false,
            },
          ],
        },
      },
    });

    const { getOptionQuotesBatch } = await import("./market-data");
    const result = await getOptionQuotesBatch([
      { underlyingSymbol: "QQQ", strike: 450, expirationDate: "2026-12-18", optionType: "PUT" },
      { underlyingSymbol: "QQQ", strike: 455, expirationDate: "2026-12-18", optionType: "PUT" },
    ]);

    expect(Object.fromEntries(result)).toEqual({
      "QQQ|PUT|450|2026-12-18": 1.9,
      "QQQ|PUT|455|2026-12-18": null,
    });
  });

  it("returns null when MCP is unavailable", async () => {
    marketDataMocks.callMcpTool.mockRejectedValueOnce(new marketDataMocks.MockMcpUnavailableError("down"));

    const { getEquityQuotes } = await import("./market-data");
    const result = await getEquityQuotes(["SPY"]);

    expect(result).toBeNull();
  });

  it("retries VIX option chain lookup using $VIX fallback symbol", async () => {
    marketDataMocks.callMcpTool
      .mockResolvedValueOnce({
        callExpDateMap: {
          "2026-06-17:68": {},
        },
      })
      .mockResolvedValueOnce({
        callExpDateMap: {
          "2026-06-17:68": {
            "25.0": [
              {
                mark: 2.15,
                bid: 0.1,
                ask: 4.2,
                delta: 0.648,
                theta: -0.059,
                volatility: 55.977,
                daysToExpiration: 68,
                inTheMoney: false,
              },
            ],
          },
        },
      });

    const { getOptionQuote } = await import("./market-data");
    const result = await getOptionQuote("VIX", 25, "2026-06-17", "CALL");

    expect(result).toEqual({
      mark: 2.15,
      bid: 0.1,
      ask: 4.2,
      delta: 0.648,
      theta: -0.059,
      iv: 55.977,
      dte: 68,
      inTheMoney: false,
    });
    expect(marketDataMocks.callMcpTool).toHaveBeenNthCalledWith(
      1,
      "get_option_chain",
      expect.objectContaining({ symbol: "VIX" }),
    );
    expect(marketDataMocks.callMcpTool).toHaveBeenNthCalledWith(
      2,
      "get_option_chain",
      expect.objectContaining({ symbol: "$VIX" }),
    );
  });

  it("continues to $VIX fallback when VIX call fails", async () => {
    marketDataMocks.callMcpTool
      .mockRejectedValueOnce(new marketDataMocks.MockMcpUnavailableError("VIX unavailable"))
      .mockResolvedValueOnce({
        callExpDateMap: {
          "2026-06-17:68": {
            "25.0": [
              {
                mark: 2.15,
                bid: 0.1,
                ask: 4.2,
                delta: 0.648,
                theta: -0.059,
                volatility: 55.977,
                daysToExpiration: 68,
                inTheMoney: false,
              },
            ],
          },
        },
      });

    const { getOptionQuote } = await import("./market-data");
    const result = await getOptionQuote("VIX", 25, "2026-06-17", "CALL");

    expect(result).toEqual({
      mark: 2.15,
      bid: 0.1,
      ask: 4.2,
      delta: 0.648,
      theta: -0.059,
      iv: 55.977,
      dte: 68,
      inTheMoney: false,
    });
    expect(marketDataMocks.callMcpTool).toHaveBeenCalledTimes(2);
  });
});
