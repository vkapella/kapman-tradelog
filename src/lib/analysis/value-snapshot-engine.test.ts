import { describe, expect, it } from "vitest";
import type { OpenPosition } from "@/types/api";
import { computeAccountValueForDate, type HistoricalMarksByInstrument } from "./value-snapshot-engine";

function holding(overrides: Partial<OpenPosition> & Pick<OpenPosition, "instrumentKey" | "assetClass" | "netQty">): OpenPosition {
  return {
    symbol: overrides.symbol ?? overrides.instrumentKey,
    underlyingSymbol: overrides.underlyingSymbol ?? overrides.symbol ?? overrides.instrumentKey,
    assetClass: overrides.assetClass,
    optionType: overrides.optionType ?? null,
    strike: overrides.strike ?? null,
    expirationDate: overrides.expirationDate ?? null,
    instrumentKey: overrides.instrumentKey,
    netQty: overrides.netQty,
    costBasis: overrides.costBasis ?? 0,
    accountId: overrides.accountId ?? "account-1",
  };
}

function marks(rows: Array<[string, string, number]>): HistoricalMarksByInstrument {
  const result: HistoricalMarksByInstrument = new Map();

  for (const [instrumentKey, markDate, close] of rows) {
    const byDate = result.get(instrumentKey) ?? new Map();
    byDate.set(markDate, { close });
    result.set(instrumentKey, byDate);
  }

  return result;
}

describe("computeAccountValueForDate", () => {
  it("splits priced equity and option holdings and computes the total", () => {
    const result = computeAccountValueForDate({
      snapshotDate: new Date("2026-01-05T00:00:00.000Z"),
      cashValue: 1000,
      holdings: [
        holding({ instrumentKey: "SPY", assetClass: "EQUITY", netQty: 10 }),
        holding({ instrumentKey: "SPY|CALL|500|2026-01-16", assetClass: "OPTION", netQty: 2 }),
      ],
      marksByKey: marks([
        ["SPY", "2026-01-05", 500],
        ["SPY|CALL|500|2026-01-16", "2026-01-05", 3.25],
      ]),
    });

    expect(result.equityValue).toBe(5000);
    expect(result.optionValue).toBe(650);
    expect(result.totalValue).toBe(6650);
    expect(result.unpricedPositionCount).toBe(0);
    expect(result.source).toBe("RECONSTRUCTED");
  });

  it("counts a missing mark as unpriced and values that holding at zero", () => {
    const result = computeAccountValueForDate({
      snapshotDate: new Date("2026-01-05T00:00:00.000Z"),
      cashValue: 1000,
      holdings: [
        holding({ instrumentKey: "SPY", assetClass: "EQUITY", netQty: 10 }),
        holding({ instrumentKey: "SPY|PUT|450|2026-01-16", assetClass: "OPTION", netQty: -1 }),
      ],
      marksByKey: marks([["SPY", "2026-01-05", 500]]),
    });

    expect(result.equityValue).toBe(5000);
    expect(result.optionValue).toBe(0);
    expect(result.totalValue).toBe(6000);
    expect(result.unpricedPositionCount).toBe(1);
  });

  it("populates reconcile delta when broker NLV is present", () => {
    const result = computeAccountValueForDate({
      snapshotDate: new Date("2026-01-05T00:00:00.000Z"),
      cashValue: 1000,
      brokerNlv: 6200,
      holdings: [holding({ instrumentKey: "SPY", assetClass: "EQUITY", netQty: 10 })],
      marksByKey: marks([["SPY", "2026-01-05", 500]]),
    });

    expect(result.totalValue).toBe(6000);
    expect(result.brokerNlv).toBe(6200);
    expect(result.reconcileDelta).toBe(200);
  });

  it("leaves broker NLV and reconcile delta null when broker NLV is absent", () => {
    const result = computeAccountValueForDate({
      snapshotDate: new Date("2026-01-05T00:00:00.000Z"),
      cashValue: 1000,
      holdings: [holding({ instrumentKey: "SPY", assetClass: "EQUITY", netQty: 10 })],
      marksByKey: marks([["SPY", "2026-01-05", 500]]),
    });

    expect(result.brokerNlv).toBeNull();
    expect(result.reconcileDelta).toBeNull();
  });

  it("supports cash-only accounts", () => {
    const result = computeAccountValueForDate({
      snapshotDate: new Date("2026-01-05T00:00:00.000Z"),
      cashValue: 1234.56,
      holdings: [],
      marksByKey: marks([]),
    });

    expect(result.cashValue).toBe(1234.56);
    expect(result.totalValue).toBe(1234.56);
    expect(result.unpricedPositionCount).toBe(0);
  });

  it("falls back to a recent prior mark", () => {
    const result = computeAccountValueForDate({
      snapshotDate: new Date("2026-01-06T00:00:00.000Z"),
      cashValue: 0,
      holdings: [holding({ instrumentKey: "SPY", assetClass: "EQUITY", netQty: 10 })],
      marksByKey: marks([["SPY", "2026-01-05", 500]]),
    });

    expect(result.equityValue).toBe(5000);
    expect(result.unpricedPositionCount).toBe(0);
  });
});
