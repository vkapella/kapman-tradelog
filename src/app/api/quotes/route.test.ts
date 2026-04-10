import { beforeEach, describe, expect, it, vi } from "vitest";

const quotesRouteMocks = vi.hoisted(() => {
  return {
    getEquityQuotes: vi.fn(),
  };
});

vi.mock("@/lib/mcp/market-data", () => {
  return {
    getEquityQuotes: quotesRouteMocks.getEquityQuotes,
  };
});

describe("GET /api/quotes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns {error: unavailable} when MCP is unavailable", async () => {
    quotesRouteMocks.getEquityQuotes.mockResolvedValueOnce(null);
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/quotes?symbols=SPY"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ error: "unavailable" });
  });

  it("uses cache within TTL and bypasses cache when refresh=1 is set", async () => {
    quotesRouteMocks.getEquityQuotes.mockResolvedValue({
      SPY: {
        mark: 100,
        bid: 99.9,
        ask: 100.1,
        last: 100,
        netChange: 1,
        netPctChange: 1,
      },
    });
    const { GET } = await import("./route");

    const first = await GET(new Request("http://localhost/api/quotes?symbols=SPY"));
    const second = await GET(new Request("http://localhost/api/quotes?symbols=SPY"));
    const refreshed = await GET(new Request("http://localhost/api/quotes?symbols=SPY&refresh=1"));

    await expect(first.json()).resolves.toEqual({
      SPY: {
        mark: 100,
        bid: 99.9,
        ask: 100.1,
        last: 100,
        netChange: 1,
        netPctChange: 1,
      },
    });
    await expect(second.json()).resolves.toEqual({
      SPY: {
        mark: 100,
        bid: 99.9,
        ask: 100.1,
        last: 100,
        netChange: 1,
        netPctChange: 1,
      },
    });
    await expect(refreshed.json()).resolves.toEqual({
      SPY: {
        mark: 100,
        bid: 99.9,
        ask: 100.1,
        last: 100,
        netChange: 1,
        netPctChange: 1,
      },
    });

    expect(quotesRouteMocks.getEquityQuotes).toHaveBeenCalledTimes(2);
  });

  it("falls back to cached quotes when refresh lookup is unavailable", async () => {
    quotesRouteMocks.getEquityQuotes
      .mockResolvedValueOnce({
        SPY: {
          mark: 100,
          bid: 99.9,
          ask: 100.1,
          last: 100,
          netChange: 1,
          netPctChange: 1,
        },
      })
      .mockResolvedValueOnce(null);
    const { GET } = await import("./route");

    await GET(new Request("http://localhost/api/quotes?symbols=SPY"));
    const refreshed = await GET(new Request("http://localhost/api/quotes?symbols=SPY&refresh=1"));

    await expect(refreshed.json()).resolves.toEqual({
      SPY: {
        mark: 100,
        bid: 99.9,
        ask: 100.1,
        last: 100,
        netChange: 1,
        netPctChange: 1,
      },
    });
    expect(quotesRouteMocks.getEquityQuotes).toHaveBeenCalledTimes(2);
  });
});
