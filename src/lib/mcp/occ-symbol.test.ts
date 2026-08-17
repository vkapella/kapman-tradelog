import { describe, expect, it } from "vitest";
import { buildOccOptionSymbol } from "./occ-symbol";

describe("buildOccOptionSymbol", () => {
  it("builds the symbol that failed to price from the chain window", () => {
    expect(buildOccOptionSymbol({
      underlyingSymbol: "SPY",
      expirationDate: "2027-12-17",
      optionType: "CALL",
      strike: 650,
    })).toBe("SPY   271217C00650000");
  });

  it("pads the root to six characters and keeps the total length at 21", () => {
    const symbol = buildOccOptionSymbol({
      underlyingSymbol: "PLTR",
      expirationDate: "2026-11-20",
      optionType: "CALL",
      strike: 170,
    });

    expect(symbol).toBe("PLTR  261120C00170000");
    expect(symbol).toHaveLength(21);
  });

  it("does not pad a root that already fills the field", () => {
    expect(buildOccOptionSymbol({
      underlyingSymbol: "GOOGL",
      expirationDate: "2026-09-18",
      optionType: "PUT",
      strike: 200,
    })).toBe("GOOGL 260918P00200000");
  });

  it("marks puts with P", () => {
    expect(buildOccOptionSymbol({
      underlyingSymbol: "SPY",
      expirationDate: "2026-09-18",
      optionType: "PUT",
      strike: 500,
    })).toBe("SPY   260918P00500000");
  });

  it("handles fractional strikes without floating-point truncation", () => {
    expect(buildOccOptionSymbol({
      underlyingSymbol: "SPY",
      expirationDate: "2026-09-18",
      optionType: "CALL",
      strike: 172.5,
    })).toBe("SPY   260918C00172500");

    expect(buildOccOptionSymbol({
      underlyingSymbol: "F",
      expirationDate: "2026-09-18",
      optionType: "CALL",
      strike: 12.25,
    })).toBe("F     260918C00012250");
  });

  it("accepts an ISO timestamp for the expiration", () => {
    expect(buildOccOptionSymbol({
      underlyingSymbol: "SPY",
      expirationDate: "2027-12-17T00:00:00.000Z",
      optionType: "CALL",
      strike: 650,
    })).toBe("SPY   271217C00650000");
  });

  it("normalizes casing and surrounding whitespace", () => {
    expect(buildOccOptionSymbol({
      underlyingSymbol: " spy ",
      expirationDate: " 2027-12-17 ",
      optionType: "call" as "CALL",
      strike: 650,
    })).toBe("SPY   271217C00650000");
  });

  it("returns null rather than a lookalike symbol for unusable input", () => {
    const base = {
      underlyingSymbol: "SPY",
      expirationDate: "2027-12-17",
      optionType: "CALL" as const,
      strike: 650,
    };

    expect(buildOccOptionSymbol({ ...base, underlyingSymbol: "" })).toBeNull();
    expect(buildOccOptionSymbol({ ...base, underlyingSymbol: "TOOLONG" })).toBeNull();
    expect(buildOccOptionSymbol({ ...base, expirationDate: "12/17/2027" })).toBeNull();
    expect(buildOccOptionSymbol({ ...base, optionType: "CALLS" as never })).toBeNull();
    expect(buildOccOptionSymbol({ ...base, strike: 0 })).toBeNull();
    expect(buildOccOptionSymbol({ ...base, strike: -650 })).toBeNull();
    expect(buildOccOptionSymbol({ ...base, strike: Number.NaN })).toBeNull();
    expect(buildOccOptionSymbol({ ...base, strike: 100_000 })).toBeNull();
  });
});
