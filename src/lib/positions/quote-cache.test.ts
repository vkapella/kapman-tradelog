import { describe, expect, it } from "vitest";
import { buildMarkMapFromQuoteCache, parsePositionsQuoteCache } from "@/lib/positions/quote-cache";
import type { OpenPosition } from "@/types/api";

const positions: OpenPosition[] = [
  {
    accountId: "acct-1",
    assetClass: "EQUITY",
    costBasis: 100,
    expirationDate: null,
    instrumentKey: "AAPL-key",
    netQty: 1,
    optionType: null,
    strike: null,
    symbol: "AAPL",
    underlyingSymbol: "AAPL",
  },
  {
    accountId: "acct-2",
    assetClass: "OPTION",
    costBasis: 250,
    expirationDate: "2026-04-17T00:00:00.000Z",
    instrumentKey: "SPY-420C",
    netQty: 2,
    optionType: "CALL",
    strike: "420",
    symbol: "SPY 420C",
    underlyingSymbol: "SPY",
  },
];

describe("positions quote cache helpers", () => {
  it("parses valid cache payloads and normalizes invalid fields to null", () => {
    const parsed = parsePositionsQuoteCache(JSON.stringify({
      timestamp: "2026-04-12T14:30:00Z",
      quotes: {
        "AAPL-key": { mark: 132.05, bid: 131.9, ask: 132.1 },
        "SPY-420C": { mark: "bad", bid: 5.1, ask: null },
      },
    }));

    expect(parsed).toEqual({
      timestamp: "2026-04-12T14:30:00Z",
      quotes: {
        "AAPL-key": { mark: 132.05, bid: 131.9, ask: 132.1 },
        "SPY-420C": { mark: null, bid: 5.1, ask: null },
      },
    });
  });

  it("builds a mark map only for current positions and ignores stale cache entries", () => {
    const markMap = buildMarkMapFromQuoteCache(positions, {
      "AAPL-key": { mark: 132.05, bid: 131.9, ask: 132.1 },
      "SPY-420C": { mark: null, bid: null, ask: null },
      stale: { mark: 1, bid: 1, ask: 1 },
    });

    expect(markMap).toEqual({
      "acct-1::AAPL-key": 132.05,
      "acct-2::SPY-420C": null,
    });
  });
});
