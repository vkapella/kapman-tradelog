import { beforeEach, describe, expect, it, vi } from "vitest";

const optionQuotesRouteMocks = vi.hoisted(() => {
  return {
    getOptionQuote: vi.fn(),
  };
});

vi.mock("@/lib/mcp/market-data", () => {
  return {
    getOptionQuote: optionQuotesRouteMocks.getOptionQuote,
  };
});

describe("POST /api/option-quotes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns a typed quote map keyed by instrumentKey", async () => {
    optionQuotesRouteMocks.getOptionQuote
      .mockResolvedValueOnce({
        mark: 3.1,
        bid: 3.0,
        ask: 3.2,
        delta: 0.45,
        theta: -0.04,
        iv: 22.5,
        dte: 252,
        inTheMoney: false,
      })
      .mockResolvedValueOnce(null);
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/option-quotes", {
        method: "POST",
        body: JSON.stringify({
          contracts: [
            {
              instrumentKey: "SPY|500C|2026-12-18",
              symbol: "SPY",
              strike: "500",
              expDate: "2026-12-18",
              contractType: "CALL",
            },
            {
              instrumentKey: "QQQ|450P|2026-12-18",
              symbol: "QQQ",
              strike: "450",
              expDate: "2026-12-18",
              contractType: "PUT",
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        "SPY|500C|2026-12-18": {
          mark: 3.1,
          bid: 3.0,
          ask: 3.2,
          delta: 0.45,
          theta: -0.04,
          iv: 22.5,
          dte: 252,
          inTheMoney: false,
        },
        "QQQ|450P|2026-12-18": {
          error: "unavailable",
        },
      },
    });
  });

  it("reuses cached quotes for duplicate contracts within the batch", async () => {
    optionQuotesRouteMocks.getOptionQuote.mockResolvedValue({
      mark: 3.1,
      bid: 3.0,
      ask: 3.2,
      delta: 0.45,
      theta: -0.04,
      iv: 22.5,
      dte: 252,
      inTheMoney: false,
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/option-quotes", {
        method: "POST",
        body: JSON.stringify({
          contracts: [
            {
              instrumentKey: "dup-1",
              symbol: "SPY",
              strike: "500",
              expDate: "2026-12-18",
              contractType: "CALL",
            },
            {
              instrumentKey: "dup-2",
              symbol: "SPY",
              strike: "500",
              expDate: "2026-12-18",
              contractType: "CALL",
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(optionQuotesRouteMocks.getOptionQuote).toHaveBeenCalledTimes(1);
  });

  it("returns a 400 error response for malformed bodies", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/option-quotes", {
        method: "POST",
        body: JSON.stringify({ contracts: [{ symbol: "SPY" }] }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_BODY",
        message: "Unable to parse option quote batch request.",
        details: ["Expected body shape: { contracts: [{ instrumentKey, symbol, strike, expDate, contractType }] }."],
      },
    });
  });
});
