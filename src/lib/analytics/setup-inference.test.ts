import { describe, expect, it } from "vitest";
import { inferSetupGroups, type SetupInferenceLot } from "./setup-inference";

function day(value: string): Date {
  return new Date(value);
}

function lot(overrides: Partial<SetupInferenceLot>): SetupInferenceLot {
  const base: SetupInferenceLot = {
    id: "lot-1",
    accountId: "account-1",
    symbol: "SPY",
    underlyingSymbol: "SPY",
    openTradeDate: day("2026-01-01T00:00:00.000Z"),
    closeTradeDate: day("2026-01-03T00:00:00.000Z"),
    realizedPnl: 100,
    holdingDays: 2,
    openAssetClass: "OPTION",
    openSide: "BUY",
    optionType: "CALL",
    strike: 500,
    expirationDate: day("2026-03-20T00:00:00.000Z"),
  };

  return { ...base, ...overrides };
}

describe("inferSetupGroups", () => {
  it("infers long_call for a single bought call lot", () => {
    const result = inferSetupGroups([lot({ id: "long-call" })]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.tag).toBe("long_call");
  });

  it("infers bull_vertical for same-expiry call spread", () => {
    const first = lot({
      id: "vertical-1",
      strike: 500,
      optionType: "CALL",
      openSide: "BUY",
      expirationDate: day("2026-04-17T00:00:00.000Z"),
    });
    const second = lot({
      id: "vertical-2",
      strike: 510,
      optionType: "CALL",
      openSide: "SELL",
      expirationDate: day("2026-04-17T00:00:00.000Z"),
      realizedPnl: -20,
    });

    const result = inferSetupGroups([first, second]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.tag).toBe("bull_vertical");
  });

  it("infers calendar for same strike and different expirations", () => {
    const first = lot({
      id: "calendar-1",
      strike: 500,
      optionType: "CALL",
      openSide: "BUY",
      expirationDate: day("2026-03-20T00:00:00.000Z"),
    });
    const second = lot({
      id: "calendar-2",
      strike: 500,
      optionType: "CALL",
      openSide: "SELL",
      expirationDate: day("2026-04-17T00:00:00.000Z"),
    });

    const result = inferSetupGroups([first, second]);
    expect(result.groups[0]?.tag).toBe("calendar");
  });

  it("infers roll when a closed lot reopens within 5 days", () => {
    const first = lot({
      id: "roll-1",
      symbol: "QQQ",
      underlyingSymbol: "QQQ",
      openTradeDate: day("2026-01-01T00:00:00.000Z"),
      closeTradeDate: day("2026-01-10T00:00:00.000Z"),
      optionType: null,
      strike: null,
      expirationDate: null,
      openAssetClass: "OTHER",
      openSide: "BUY",
    });
    const second = lot({
      id: "roll-2",
      symbol: "QQQ",
      underlyingSymbol: "QQQ",
      openTradeDate: day("2026-01-12T00:00:00.000Z"),
      closeTradeDate: day("2026-01-15T00:00:00.000Z"),
      optionType: null,
      strike: null,
      expirationDate: null,
      openAssetClass: "OTHER",
      openSide: "BUY",
    });

    const result = inferSetupGroups([first, second]);
    expect(result.groups[0]?.tag).toBe("roll");
  });

  it("tracks uncategorized setup group count", () => {
    const uncategorizedStock = lot({
      id: "stock-1",
      symbol: "AAPL",
      underlyingSymbol: "AAPL",
      openAssetClass: "EQUITY",
      optionType: null,
      strike: null,
      expirationDate: null,
    });
    const secondCluster = lot({
      id: "stock-2",
      symbol: "AAPL",
      underlyingSymbol: "AAPL",
      openTradeDate: day("2026-01-20T00:00:00.000Z"),
      closeTradeDate: day("2026-01-21T00:00:00.000Z"),
      openAssetClass: "EQUITY",
      optionType: null,
      strike: null,
      expirationDate: null,
    });

    const result = inferSetupGroups([uncategorizedStock, secondCluster]);
    expect(result.groups).toHaveLength(2);
    expect(result.uncategorizedCount).toBe(2);
  });
});
