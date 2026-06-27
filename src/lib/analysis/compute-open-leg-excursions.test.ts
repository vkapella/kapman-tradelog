import { describe, expect, it } from "vitest";
import type { ExecutionRecord, OpenPosition } from "@/types/api";
import { buildExcursionLegs, excursionForLeg } from "./compute-open-leg-excursions";
import type { LotExcursionMark } from "./compute-lot-excursion";

function marks(entries: Record<string, LotExcursionMark>): Map<string, LotExcursionMark> {
  return new Map(Object.entries(entries));
}

describe("excursionForLeg", () => {
  it("computes MAE/MFE as fractions of entry from daily high/low", () => {
    const result = excursionForLeg(
      { assetClass: "OPTION", entryDate: new Date("2026-05-20T00:00:00.000Z"), entryPrice: 6.2, netQty: 2, mark: null },
      marks({ "2026-06-01": { high: 9, low: 5 } }),
      new Date("2026-06-10T00:00:00.000Z"),
      ["2026-06-01"],
    );
    expect(result.mfePct).toBeCloseTo(0.4516, 3); // (9 - 6.20) / 6.20
    expect(result.maePct).toBeCloseTo(-0.1935, 3); // (5 - 6.20) / 6.20
    expect(result.pricedDays).toBe(1);
    expect(result.excursionAsOf).toBe("2026-06-01");
  });

  it("folds the live mark in as a same-day extreme so MFE reflects the current gain", () => {
    const result = excursionForLeg(
      { assetClass: "OPTION", entryDate: new Date("2026-05-20T00:00:00.000Z"), entryPrice: 6.2, netQty: 2, mark: 12 },
      marks({ "2026-06-01": { high: 9, low: 5 } }),
      new Date("2026-06-10T00:00:00.000Z"),
      ["2026-06-01", "2026-06-10"],
    );
    expect(result.mfePct).toBeCloseTo(0.9355, 3); // live mark 12 beats the daily high 9: (12 - 6.20) / 6.20
    expect(result.excursionAsOf).toBe("2026-06-10");
  });

  it("handles short legs with flipped favorable/adverse sides", () => {
    const result = excursionForLeg(
      { assetClass: "OPTION", entryDate: new Date("2026-06-01T00:00:00.000Z"), entryPrice: 11, netQty: -1, mark: null },
      marks({ "2026-06-05": { high: 15, low: 8 } }),
      new Date("2026-06-10T00:00:00.000Z"),
      ["2026-06-05"],
    );
    expect(result.mfePct).toBeCloseTo(0.2727, 3); // short: (entry 11 - low 8) / 11
    expect(result.maePct).toBeCloseTo(-0.3636, 3); // short: (entry 11 - high 15) / 11
  });

  it("returns nulls when entry is unusable or there is no coverage", () => {
    const noEntry = excursionForLeg(
      { assetClass: "OPTION", entryDate: null, entryPrice: null, netQty: 1, mark: 5 },
      marks({}),
      new Date("2026-06-10T00:00:00.000Z"),
    );
    expect(noEntry.maePct).toBeNull();
    expect(noEntry.mfePct).toBeNull();
    expect(noEntry.excursionAsOf).toBeNull();

    const noCoverage = excursionForLeg(
      { assetClass: "EQUITY", entryDate: new Date("2026-05-20T00:00:00.000Z"), entryPrice: 50, netQty: 10, mark: null },
      marks({}),
      new Date("2026-06-10T00:00:00.000Z"),
      ["2026-06-01"],
    );
    expect(noCoverage.pricedDays).toBe(0);
    expect(noCoverage.excursionAsOf).toBeNull();
  });
});

describe("buildExcursionLegs", () => {
  function execution(overrides: Partial<ExecutionRecord>): ExecutionRecord {
    return {
      id: "e1", accountId: "acc1", broker: "SCHWAB_THINKORSWIM", symbol: "AAPL",
      tradeDate: "2026-05-20T00:00:00.000Z", eventTimestamp: "2026-05-20T14:30:00.000Z", eventType: "TRADE",
      assetClass: "OPTION", side: "BUY", quantity: "2", price: "6.20", openingClosingEffect: "TO_OPEN",
      instrumentKey: "AAPL_K", underlyingSymbol: "AAPL", optionType: "CALL", strike: "190",
      expirationDate: "2026-08-15T00:00:00.000Z", spreadGroupId: null, importId: "imp-1", ...overrides,
    };
  }
  const position: OpenPosition & { mark: number | null } = {
    symbol: "AAPL", underlyingSymbol: "AAPL", assetClass: "OPTION", optionType: "CALL", strike: "190",
    expirationDate: "2026-08-15T00:00:00.000Z", instrumentKey: "AAPL_K", netQty: 2, costBasis: 1240, accountId: "acc1", mark: 7.85,
  };

  it("derives entry date and weighted-average entry price per leg", () => {
    const legs = buildExcursionLegs([position], [execution({})]);
    expect(legs).toHaveLength(1);
    expect(legs[0].entryDate?.toISOString()).toBe("2026-05-20T00:00:00.000Z");
    expect(legs[0].entryPrice).toBeCloseTo(6.2, 6); // 1240 / (2 * 100)
    expect(legs[0].mark).toBe(7.85);
  });

  it("leaves entryDate null when no opening execution re-joins the leg", () => {
    const legs = buildExcursionLegs([position], []);
    expect(legs[0].entryDate).toBeNull();
  });
});
