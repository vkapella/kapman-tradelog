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

/** A `get_quotes` option payload, shaped like Schwab's response. */
function optionQuotePayload(overrides: Record<string, unknown> = {}) {
  return {
    quote: {
      mark: 176.26,
      bidPrice: 174.35,
      askPrice: 178.17,
      delta: 0.7998,
      theta: -0.0469,
      volatility: 20.44,
      moneyIntrinsicValue: 125.475,
      underlyingPrice: 775.475,
      ...overrides,
    },
  };
}

function chainPayload(expKey: string, strikeKey: string, contract: Record<string, unknown>) {
  return {
    callExpDateMap: {
      [expKey]: {
        [strikeKey]: [contract],
      },
    },
  };
}

describe("market-data MCP adapter", () => {
  beforeEach(() => {
    // resetAllMocks, not clearAllMocks: the latter leaves queued
    // mockResolvedValueOnce values behind, leaking them into the next test.
    vi.resetAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
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

    expect(await getEquityQuotes(["SPY"])).toEqual({
      SPY: { mark: 501.1, bid: 501.0, ask: 501.2, last: 501.05, netChange: -2.2, netPctChange: -0.44 },
    });
  });

  it("returns null when MCP is unavailable", async () => {
    marketDataMocks.callMcpTool.mockRejectedValueOnce(new marketDataMocks.MockMcpUnavailableError("down"));

    const { getEquityQuotes } = await import("./market-data");

    expect(await getEquityQuotes(["SPY"])).toBeNull();
  });

  it("quotes a deep-ITM strike by OCC symbol that a spot-centered chain window would miss", async () => {
    marketDataMocks.callMcpTool.mockResolvedValueOnce({
      "SPY   271217C00650000": optionQuotePayload(),
    });

    const { getOptionQuotesBatch } = await import("./market-data");
    const result = await getOptionQuotesBatch([
      { underlyingSymbol: "SPY", strike: 650, expirationDate: "2027-12-17", optionType: "CALL" },
    ]);

    expect(result.get("SPY|CALL|650|2027-12-17")).toBe(176.26);
    expect(marketDataMocks.callMcpTool).toHaveBeenCalledTimes(1);
    expect(marketDataMocks.callMcpTool).toHaveBeenCalledWith("get_quotes", {
      symbols: ["SPY   271217C00650000"],
    });
  });

  it("resolves every leg across underlyings in a single quote call", async () => {
    marketDataMocks.callMcpTool.mockResolvedValueOnce({
      "SPY   271217C00650000": optionQuotePayload(),
      "MSFT  261120C00510000": optionQuotePayload({ mark: 21.48 }),
      "PLTR  261120C00170000": optionQuotePayload({ mark: 22.1 }),
    });

    const { getOptionQuotesBatch } = await import("./market-data");
    const result = await getOptionQuotesBatch([
      { underlyingSymbol: "SPY", strike: 650, expirationDate: "2027-12-17", optionType: "CALL" },
      { underlyingSymbol: "MSFT", strike: 510, expirationDate: "2026-11-20", optionType: "CALL" },
      { underlyingSymbol: "PLTR", strike: 170, expirationDate: "2026-11-20", optionType: "CALL" },
    ]);

    expect(Object.fromEntries(result)).toEqual({
      "SPY|CALL|650|2027-12-17": 176.26,
      "MSFT|CALL|510|2026-11-20": 21.48,
      "PLTR|CALL|170|2026-11-20": 22.1,
    });
    // One call for all three, versus one chain fetch per underlying before.
    expect(marketDataMocks.callMcpTool).toHaveBeenCalledTimes(1);
  });

  it("keeps a mark when the provider omits greeks", async () => {
    marketDataMocks.callMcpTool.mockResolvedValueOnce({
      "SPY   271217C00650000": optionQuotePayload({ delta: null, theta: null, volatility: null }),
    });

    const { getOptionQuote } = await import("./market-data");
    const result = await getOptionQuote("SPY", 650, "2027-12-17", "CALL");

    expect(result).toEqual(expect.objectContaining({ mark: 176.26, delta: null, theta: null, iv: null }));
  });

  it("never treats markChange as a mark", async () => {
    marketDataMocks.callMcpTool
      .mockResolvedValueOnce({
        "SPY   271217C00650000": optionQuotePayload({ mark: null, lastPrice: null, closePrice: null, markChange: -3.35 }),
      })
      .mockResolvedValueOnce({});

    const { getOptionQuotesBatch } = await import("./market-data");
    const result = await getOptionQuotesBatch([
      { underlyingSymbol: "SPY", strike: 650, expirationDate: "2027-12-17", optionType: "CALL" },
    ]);

    expect(result.get("SPY|CALL|650|2027-12-17")).toBeNull();
  });

  it("computes DTE from the requested expiration", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T12:00:00.000Z"));
    marketDataMocks.callMcpTool.mockResolvedValueOnce({
      "SPY   260918C00500000": optionQuotePayload({ mark: 3.1 }),
    });

    const { getOptionQuote } = await import("./market-data");
    const result = await getOptionQuote("SPY", 500, "2026-09-18", "CALL");

    expect(result?.dte).toBe(32);
    vi.useRealTimers();
  });

  it("falls back to the chain for roots that differ from the underlying, such as VIX weeklies", async () => {
    marketDataMocks.callMcpTool
      // The constructed VIX root does not exist for a weekly, which trades as VIXW.
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(chainPayload("2026-08-26:9", "14.5", {
        symbol: "VIXW  260826C00014500",
        optionRoot: "VIXW",
        mark: 2.39,
        bid: 2.19,
        ask: 2.59,
        delta: 1.022,
        theta: -0.15,
        volatility: 61.46,
        daysToExpiration: 9,
        inTheMoney: true,
      }));

    const { getOptionQuote } = await import("./market-data");
    const result = await getOptionQuote("VIX", 14.5, "2026-08-26", "CALL");

    expect(result).toEqual(expect.objectContaining({ mark: 2.39, dte: 9, inTheMoney: true }));
    expect(marketDataMocks.callMcpTool).toHaveBeenNthCalledWith(1, "get_quotes", expect.anything());
    expect(marketDataMocks.callMcpTool).toHaveBeenNthCalledWith(2, "get_option_chain", expect.objectContaining({ symbol: "VIX" }));
  });

  it("continues to the $VIX chain candidate when the VIX chain is unavailable", async () => {
    marketDataMocks.callMcpTool
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new marketDataMocks.MockMcpUnavailableError("VIX unavailable"))
      .mockResolvedValueOnce(chainPayload("2026-09-16:30", "14.5", {
        mark: 3.5,
        bid: 3.45,
        ask: 3.55,
        daysToExpiration: 30,
        inTheMoney: true,
      }));

    const { getOptionQuote } = await import("./market-data");
    const result = await getOptionQuote("VIX", 14.5, "2026-09-16", "CALL");

    expect(result).toEqual(expect.objectContaining({ mark: 3.5 }));
    expect(marketDataMocks.callMcpTool).toHaveBeenNthCalledWith(3, "get_option_chain", expect.objectContaining({ symbol: "$VIX" }));
  });

  it("returns a null mark without failing sibling legs when a contract resolves nowhere", async () => {
    marketDataMocks.callMcpTool
      .mockResolvedValueOnce({ "QQQ   261218P00450000": optionQuotePayload({ mark: 1.9 }) })
      .mockResolvedValueOnce({ putExpDateMap: {} });

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

  it("logs a missing contract distinctly from a provider outage", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    marketDataMocks.callMcpTool
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ callExpDateMap: {} });

    const { getOptionQuotesBatch } = await import("./market-data");
    await getOptionQuotesBatch([
      { underlyingSymbol: "SPY", strike: 650, expirationDate: "2027-12-17", optionType: "CALL" },
    ]);

    const logged = warn.mock.calls.map(([line]) => String(line)).join("\n");
    expect(logged).toContain("contract_not_found");
    expect(logged).not.toContain("provider_unavailable");
  });

  it("reports a provider outage as unavailable rather than a missing contract", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    marketDataMocks.callMcpTool.mockRejectedValueOnce(new marketDataMocks.MockMcpUnavailableError("down"));

    const { getOptionQuotesBatch } = await import("./market-data");
    const result = await getOptionQuotesBatch([
      { underlyingSymbol: "SPY", strike: 650, expirationDate: "2027-12-17", optionType: "CALL" },
    ]);

    expect(result.get("SPY|CALL|650|2027-12-17")).toBeNull();
    const logged = warn.mock.calls.map(([line]) => String(line)).join("\n");
    expect(logged).toContain("provider_unavailable");
    expect(logged).not.toContain("contract_not_found");
  });

  it("returns null from the single-quote path when the provider is unavailable", async () => {
    marketDataMocks.callMcpTool.mockRejectedValueOnce(new marketDataMocks.MockMcpUnavailableError("down"));

    const { getOptionQuote } = await import("./market-data");

    expect(await getOptionQuote("SPY", 650, "2027-12-17", "CALL")).toBeNull();
  });
});
