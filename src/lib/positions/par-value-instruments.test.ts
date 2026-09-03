import { describe, expect, it } from "vitest";
import type { ExecutionRecord } from "@/types/api";
import { collectParValueInstrumentKeys, isParValueExecution, PAR_VALUE_MARK } from "./par-value-instruments";

function execution(overrides: Partial<ExecutionRecord>): ExecutionRecord {
  return {
    id: "exec-1",
    accountId: "acct-1",
    broker: "SCHWAB_THINKORSWIM",
    symbol: "SNSXX",
    tradeDate: "2026-08-26T00:00:00.000Z",
    eventTimestamp: "2026-08-26T20:22:37.000Z",
    eventType: "TRADE",
    assetClass: "EQUITY",
    side: "BUY",
    quantity: "100000",
    price: "1",
    openingClosingEffect: "TO_OPEN",
    instrumentKey: null,
    underlyingSymbol: "SNSXX",
    optionType: null,
    strike: null,
    expirationDate: null,
    spreadGroupId: null,
    importId: "import-1",
    ...overrides,
  };
}

describe("par-value instruments", () => {
  it("recognises a thinkorswim money-market sweep by Spread=FUND / Type=FUND", () => {
    expect(isParValueExecution(execution({ rawRowJson: { spread: "FUND", type: "FUND" } }))).toBe(true);
    expect(isParValueExecution(execution({ rawRowJson: { spread: "fund", type: null } }))).toBe(true);
    expect(isParValueExecution(execution({ rawRowJson: { spread: "STOCK", type: "ETF" } }))).toBe(false);
    expect(isParValueExecution(execution({ rawRowJson: null }))).toBe(false);
    expect(isParValueExecution(execution({}))).toBe(false);
  });

  it("collects instrument keys the same way computeOpenPositions derives them", () => {
    const keys = collectParValueInstrumentKeys([
      execution({ rawRowJson: { spread: "FUND", type: "FUND" } }),
      execution({ id: "exec-2", symbol: "SPY", underlyingSymbol: "SPY", rawRowJson: { spread: "STOCK", type: "ETF" } }),
      execution({ id: "exec-3", instrumentKey: "acct-1|EQUITY|SWVXX", symbol: "SWVXX", rawRowJson: { spread: "FUND", type: "FUND" } }),
    ]);

    expect(Array.from(keys).sort()).toEqual(["acct-1|EQUITY|SNSXX|||", "acct-1|EQUITY|SWVXX"]);
    expect(PAR_VALUE_MARK).toBe(1);
  });
});
