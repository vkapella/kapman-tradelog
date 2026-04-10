import { beforeEach, describe, expect, it, vi } from "vitest";

const optionRouteMocks = vi.hoisted(() => {
  return {
    getOptionQuote: vi.fn(),
  };
});

vi.mock("@/lib/mcp/market-data", () => {
  return {
    getOptionQuote: optionRouteMocks.getOptionQuote,
  };
});

describe("GET /api/option-quote", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns {error: unavailable} when MCP is unavailable", async () => {
    optionRouteMocks.getOptionQuote.mockResolvedValueOnce(null);
    const { GET } = await import("./route");

    const request = new Request(
      "http://localhost/api/option-quote?symbol=SPY&strike=500&expDate=2026-12-18&contractType=CALL",
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ error: "unavailable" });
  });

  it("uses cache to avoid repeated MCP round-trips within TTL", async () => {
    optionRouteMocks.getOptionQuote.mockResolvedValue({
      mark: 3.1,
      bid: 3.0,
      ask: 3.2,
      delta: 0.45,
      theta: -0.04,
      iv: 22.5,
      dte: 252,
      inTheMoney: false,
    });
    const { GET } = await import("./route");

    const request = new Request(
      "http://localhost/api/option-quote?symbol=SPY&strike=500&expDate=2026-12-18&contractType=CALL",
    );

    const first = await GET(request);
    const second = await GET(request);

    await expect(first.json()).resolves.toEqual({
      mark: 3.1,
      bid: 3.0,
      ask: 3.2,
      delta: 0.45,
      theta: -0.04,
      iv: 22.5,
      dte: 252,
      inTheMoney: false,
    });
    await expect(second.json()).resolves.toEqual({
      mark: 3.1,
      bid: 3.0,
      ask: 3.2,
      delta: 0.45,
      theta: -0.04,
      iv: 22.5,
      dte: 252,
      inTheMoney: false,
    });
    expect(optionRouteMocks.getOptionQuote).toHaveBeenCalledTimes(1);
  });
});
