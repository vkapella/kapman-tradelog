import { describe, expect, it } from "vitest";
import { parseOptionSymbol } from "@/lib/adapters/fidelity/symbol-parser";

describe("parseOptionSymbol", () => {
  it("parses supported compact OCC option symbols", () => {
    expect(parseOptionSymbol("-NTAP260220C115")).toEqual({
      underlyingTicker: "NTAP",
      expirationDate: "2026-02-20",
      optionType: "CALL",
      strikePrice: 115,
    });

    expect(parseOptionSymbol("-PLTR260116P150")).toEqual({
      underlyingTicker: "PLTR",
      expirationDate: "2026-01-16",
      optionType: "PUT",
      strikePrice: 150,
    });

    expect(parseOptionSymbol("-RKLB260320C55")).toEqual({
      underlyingTicker: "RKLB",
      expirationDate: "2026-03-20",
      optionType: "CALL",
      strikePrice: 55,
    });

    expect(parseOptionSymbol("-NVDA261218C175")).toEqual({
      underlyingTicker: "NVDA",
      expirationDate: "2026-12-18",
      optionType: "CALL",
      strikePrice: 175,
    });

    expect(parseOptionSymbol("-AMZN260717C215")).toEqual({
      underlyingTicker: "AMZN",
      expirationDate: "2026-07-17",
      optionType: "CALL",
      strikePrice: 215,
    });
  });

  it("returns null for equities or non-matching symbols", () => {
    expect(parseOptionSymbol("MTUM")).toBeNull();
    expect(parseOptionSymbol("SPAXX")).toBeNull();
    expect(parseOptionSymbol("")).toBeNull();
  });
});
