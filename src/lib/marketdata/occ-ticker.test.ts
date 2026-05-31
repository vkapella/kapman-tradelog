import { describe, expect, it } from "vitest";
import { canonicalToOcc, normalizeCanonicalStrike, occToCanonical, parseCanonicalOptionInstrumentKey } from "./occ-ticker";

describe("OCC ticker conversion", () => {
  it("converts a standard OCC ticker to the canonical option instrument key", () => {
    expect(occToCanonical("O:SPY260116C00500000")).toEqual({
      occTicker: "O:SPY260116C00500000",
      instrumentKey: "SPY|CALL|500|2026-01-16",
      underlying: "SPY",
      optionType: "CALL",
      strike: "500",
      expirationDate: "2026-01-16",
    });
  });

  it("converts a canonical option instrument key to OCC format", () => {
    expect(canonicalToOcc("SPY|CALL|500|2026-01-16")).toBe("O:SPY260116C00500000");
    expect(canonicalToOcc("QQQ|PUT|450|2026-02-20")).toBe("O:QQQ260220P00450000");
  });

  it("normalizes fractional strikes without losing join-compatible precision", () => {
    expect(normalizeCanonicalStrike("007.5000")).toBe("7.5");
    expect(canonicalToOcc("XYZ|CALL|7.5|2026-03-20")).toBe("O:XYZ260320C00007500");
    expect(occToCanonical("O:XYZ260320C00007500").instrumentKey).toBe("XYZ|CALL|7.5|2026-03-20");
  });

  it("round-trips a real holding-style instrument key", () => {
    const holdingKey = "TSLA|PUT|262.5|2026-06-18";
    const occ = canonicalToOcc(holdingKey);
    const parsed = occToCanonical(occ);

    expect(parsed.instrumentKey).toBe(holdingKey);
    expect(canonicalToOcc(parsed.instrumentKey)).toBe(occ);
  });

  it("supports underlyings that are not three letters", () => {
    expect(canonicalToOcc("BRK.B|CALL|350|2026-01-16")).toBe("O:BRK.B260116C00350000");
    expect(occToCanonical("O:SPXW260116P05000000").instrumentKey).toBe("SPXW|PUT|5000|2026-01-16");
  });

  it("rejects malformed canonical keys and unsupported strike precision", () => {
    expect(() => parseCanonicalOptionInstrumentKey("SPY|CALL|500")).toThrow(/Invalid canonical/);
    expect(() => canonicalToOcc("SPY|CALL|7.1234|2026-01-16")).toThrow(/precision/);
    expect(() => occToCanonical("SPY260116C00500000")).toThrow(/Invalid OCC/);
  });
});
