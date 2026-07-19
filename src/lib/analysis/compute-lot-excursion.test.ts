import { describe, expect, it } from "vitest";
import { computeLotExcursion } from "./compute-lot-excursion";

const tradingDays = ["2026-01-02", "2026-01-05", "2026-01-06"];

describe("computeLotExcursion", () => {
  it("computes long equity MFE and MAE from daily high/low extremes", () => {
    const result = computeLotExcursion({
      openTradeDate: new Date("2026-01-02T00:00:00.000Z"),
      closeTradeDate: new Date("2026-01-06T00:00:00.000Z"),
      entryPrice: 100,
      quantity: 10,
      direction: "LONG",
      assetClass: "EQUITY",
      evaluationDateKeys: tradingDays,
      marksByDate: {
        "2026-01-02": { high: 103, low: 98 },
        "2026-01-05": { high: 112, low: 101 },
        "2026-01-06": { high: 108, low: 94 },
      },
    });

    expect(result).toEqual({
      mfe: 120,
      mae: -60,
      mfePct: 0.12,
      maePct: -0.06,
      mfeDate: "2026-01-05",
      maeDate: "2026-01-06",
      pricedDays: 3,
      unpricedDays: 0,
    });
  });

  it("inverts signs for a short option and applies the option multiplier", () => {
    const result = computeLotExcursion({
      openTradeDate: new Date("2026-02-03T00:00:00.000Z"),
      closeTradeDate: new Date("2026-02-05T00:00:00.000Z"),
      entryPrice: 2,
      quantity: 1,
      direction: "SHORT",
      assetClass: "OPTION",
      evaluationDateKeys: ["2026-02-03", "2026-02-04", "2026-02-05"],
      marksByDate: {
        "2026-02-03": { high: 2.4, low: 1.7 },
        "2026-02-04": { high: 3.1, low: 1.2 },
        "2026-02-05": { high: 2.3, low: 1.5 },
      },
    });

    expect(result.mfe).toBeCloseTo(80);
    expect(result.mae).toBeCloseTo(-110);
    expect(result.mfePct).toBeCloseTo(0.4);
    expect(result.maePct).toBeCloseTo(-0.55);
    expect(result.mfeDate).toBe("2026-02-04");
    expect(result.maeDate).toBe("2026-02-04");
  });

  it("counts a missing mark day without crashing", () => {
    const result = computeLotExcursion({
      openTradeDate: new Date("2026-03-10T00:00:00.000Z"),
      closeTradeDate: new Date("2026-03-12T00:00:00.000Z"),
      entryPrice: 50,
      quantity: 2,
      direction: "LONG",
      assetClass: "EQUITY",
      evaluationDateKeys: ["2026-03-10", "2026-03-11", "2026-03-12"],
      marksByDate: {
        "2026-03-10": { high: 51, low: 49 },
        "2026-03-12": { high: 53, low: 48 },
      },
    });

    expect(result.pricedDays).toBe(2);
    expect(result.unpricedDays).toBe(1);
    expect(result.mfe).toBe(6);
    expect(result.mae).toBe(-4);
  });

  it("returns null percentages for zero cost basis", () => {
    const result = computeLotExcursion({
      openTradeDate: new Date("2026-04-01T00:00:00.000Z"),
      closeTradeDate: new Date("2026-04-01T00:00:00.000Z"),
      entryPrice: 0,
      quantity: 4,
      direction: "LONG",
      assetClass: "EQUITY",
      marksByDate: {
        "2026-04-01": { high: 3, low: -1 },
      },
    });

    expect(result.mfe).toBe(12);
    expect(result.mae).toBe(-4);
    expect(result.mfePct).toBeNull();
    expect(result.maePct).toBeNull();
  });

  it("uses the entry execution as a zero floor when no marks are priced", () => {
    const result = computeLotExcursion({
      openTradeDate: new Date("2026-05-01T00:00:00.000Z"),
      closeTradeDate: new Date("2026-05-05T00:00:00.000Z"),
      entryPrice: 10,
      quantity: 5,
      direction: "LONG",
      assetClass: "EQUITY",
      evaluationDateKeys: ["2026-05-01", "2026-05-04", "2026-05-05"],
      marksByDate: {},
    });

    expect(result).toEqual({
      mfe: 0,
      mae: 0,
      mfePct: 0,
      maePct: 0,
      mfeDate: "2026-05-01",
      maeDate: "2026-05-01",
      pricedDays: 0,
      unpricedDays: 3,
    });
  });

  it("uses the SPCX close execution when the provider close-day bar is missing", () => {
    const result = computeLotExcursion({
      openTradeDate: new Date("2026-06-18T00:00:00.000Z"),
      closeTradeDate: new Date("2026-07-17T00:00:00.000Z"),
      entryPrice: 16.1,
      closePrice: 55.62,
      quantity: 1,
      direction: "LONG",
      assetClass: "OPTION",
      evaluationDateKeys: ["2026-06-18", "2026-07-16"],
      marksByDate: {
        "2026-06-18": { high: 18.2, low: 13.2 },
        "2026-07-16": { high: 48.9, low: 42.52 },
      },
    });

    expect(result.mfe).toBeCloseTo(3952);
    expect(result.mfePct).toBeCloseTo(2.454658, 6);
    expect(result.mfeDate).toBe("2026-07-17");
    expect(result.pricedDays).toBe(2);
    expect(result.unpricedDays).toBe(1);
  });

  it("keeps a close-day historical high above the exit as the true MFE", () => {
    const result = computeLotExcursion({
      openTradeDate: new Date("2026-06-18T00:00:00.000Z"),
      closeTradeDate: new Date("2026-07-17T00:00:00.000Z"),
      entryPrice: 16.1,
      closePrice: 55.62,
      quantity: 1,
      direction: "LONG",
      assetClass: "OPTION",
      evaluationDateKeys: ["2026-06-18", "2026-07-17"],
      marksByDate: {
        "2026-06-18": { high: 18.2, low: 13.2 },
        "2026-07-17": { high: 60, low: 47 },
      },
    });

    expect(result.mfe).toBeCloseTo(4390);
    expect(result.mfePct).toBeCloseTo(2.726708, 6);
    expect(result.mfeDate).toBe("2026-07-17");
    expect(result.unpricedDays).toBe(0);
  });

  it("uses a short-option buyback as a favorable execution observation", () => {
    const result = computeLotExcursion({
      openTradeDate: new Date("2026-07-09T00:00:00.000Z"),
      closeTradeDate: new Date("2026-07-17T00:00:00.000Z"),
      entryPrice: 12,
      closePrice: 3.99,
      quantity: 1,
      direction: "SHORT",
      assetClass: "OPTION",
      evaluationDateKeys: ["2026-07-09", "2026-07-16"],
      marksByDate: {
        "2026-07-09": { high: 13.02, low: 10.8 },
        "2026-07-16": { high: 7.5, low: 5.07 },
      },
    });

    expect(result.mfe).toBeCloseTo(801);
    expect(result.mfePct).toBeCloseTo(0.6675);
    expect(result.mfeDate).toBe("2026-07-17");
    expect(result.unpricedDays).toBe(1);
  });

  it("supports stock quantities and partial FIFO lot closures", () => {
    const result = computeLotExcursion({
      openTradeDate: new Date("2026-01-02T00:00:00.000Z"),
      closeTradeDate: new Date("2026-01-05T00:00:00.000Z"),
      entryPrice: 100,
      closePrice: 120,
      quantity: 40,
      direction: "LONG",
      assetClass: "EQUITY",
      evaluationDateKeys: ["2026-01-02"],
      marksByDate: {
        "2026-01-02": { high: 110, low: 98 },
      },
    });

    expect(result.mfe).toBe(800);
    expect(result.mfePct).toBe(0.2);
    expect(result.mfeDate).toBe("2026-01-05");
    expect(result.unpricedDays).toBe(1);
  });

  it("handles same-day executions without a historical bar", () => {
    const result = computeLotExcursion({
      openTradeDate: new Date("2026-02-10T14:30:00.000Z"),
      closeTradeDate: new Date("2026-02-10T19:30:00.000Z"),
      entryPrice: 10,
      closePrice: 12,
      quantity: 5,
      direction: "LONG",
      assetClass: "EQUITY",
      evaluationDateKeys: [],
      marksByDate: {},
    });

    expect(result.mfe).toBe(10);
    expect(result.mfePct).toBe(0.2);
    expect(result.mae).toBe(0);
    expect(result.pricedDays).toBe(0);
    expect(result.unpricedDays).toBe(1);
  });

  it("uses an inferred zero-price expiration as the closing observation", () => {
    const longExpiration = computeLotExcursion({
      openTradeDate: new Date("2026-01-02T00:00:00.000Z"),
      closeTradeDate: new Date("2026-01-16T00:00:00.000Z"),
      entryPrice: 2,
      closePrice: 0,
      quantity: 1,
      direction: "LONG",
      assetClass: "OPTION",
      evaluationDateKeys: ["2026-01-02"],
      marksByDate: { "2026-01-02": { high: 2, low: 2 } },
    });
    const shortExpiration = computeLotExcursion({
      openTradeDate: new Date("2026-01-02T00:00:00.000Z"),
      closeTradeDate: new Date("2026-01-16T00:00:00.000Z"),
      entryPrice: 2,
      closePrice: 0,
      quantity: 1,
      direction: "SHORT",
      assetClass: "OPTION",
      evaluationDateKeys: ["2026-01-02"],
      marksByDate: { "2026-01-02": { high: 2, low: 2 } },
    });

    expect(longExpiration.mfe).toBe(0);
    expect(longExpiration.mae).toBe(-200);
    expect(shortExpiration.mfe).toBe(200);
    expect(shortExpiration.mfePct).toBe(1);
  });
});
