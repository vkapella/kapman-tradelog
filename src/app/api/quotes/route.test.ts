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
});
