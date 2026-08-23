import { describe, expect, it } from "vitest";
import {
  normalizeDisposition,
  normalizeStructure,
  optionTypeFromStructure,
  parseEntryRange,
  parseExpiration,
  parseStrikes,
} from "./normalize";

describe("normalizeStructure", () => {
  it("maps observed variants to canonical values", () => {
    expect(normalizeStructure("Long Call")).toBe("LONG_CALL");
    expect(normalizeStructure("long_call")).toBe("LONG_CALL");
    expect(normalizeStructure("Call Debit Spread")).toBe("CALL_DEBIT_SPREAD");
    expect(normalizeStructure("CALL_DEBIT_SPREAD")).toBe("CALL_DEBIT_SPREAD");
    expect(normalizeStructure("vertical_spread")).toBe("VERTICAL_SPREAD");
    expect(normalizeStructure("NONE")).toBe("NONE");
  });

  it("returns null for unknown text instead of guessing", () => {
    expect(normalizeStructure("iron condor")).toBeNull();
    expect(normalizeStructure("")).toBeNull();
    expect(normalizeStructure(undefined)).toBeNull();
  });
});

describe("normalizeDisposition", () => {
  it("maps observed variants", () => {
    expect(normalizeDisposition("ELIGIBLE")).toBe("ELIGIBLE");
    expect(normalizeDisposition("Validated")).toBe("VALIDATED");
    expect(normalizeDisposition("NO_TRADE")).toBe("NO_TRADE");
    expect(normalizeDisposition("wait")).toBe("WAIT");
  });

  it("returns null for unknown text", () => {
    expect(normalizeDisposition("maybe")).toBeNull();
  });
});

describe("parseStrikes", () => {
  it("parses a single strike", () => {
    expect(parseStrikes("280")).toEqual({ strike: 280, strikeShort: null, optionType: null });
    expect(parseStrikes("16")).toEqual({ strike: 16, strikeShort: null, optionType: null });
  });

  it("parses spread legs with option-type letters (2026-08-07 form)", () => {
    expect(parseStrikes("250C/270C")).toEqual({ strike: 250, strikeShort: 270, optionType: "CALL" });
    expect(parseStrikes("60C/70C")).toEqual({ strike: 60, strikeShort: 70, optionType: "CALL" });
  });

  it("parses bare spread legs (2026-08-03 form)", () => {
    expect(parseStrikes("160/175")).toEqual({ strike: 160, strikeShort: 175, optionType: null });
  });

  it("returns null for prose", () => {
    expect(parseStrikes("ATM to slightly OTM")).toBeNull();
  });
});

describe("parseEntryRange", () => {
  it("parses en-dash ranges", () => {
    expect(parseEntryRange("$16.60–$16.90")).toEqual({ low: 16.6, high: 16.9 });
    expect(parseEntryRange("$3.60–$6.00 (wide)")).toEqual({ low: 3.6, high: 6 });
  });

  it("parses net-debit ranges (2026-08-03 form)", () => {
    expect(parseEntryRange("net debit $6.20–$7.40")).toEqual({ low: 6.2, high: 7.4 });
  });

  it("parses a point debit as low === high (2026-08-07 spread form)", () => {
    expect(parseEntryRange("~$6.70 debit")).toEqual({ low: 6.7, high: 6.7 });
  });

  it("returns null when there is no number", () => {
    expect(parseEntryRange("see chain")).toBeNull();
  });
});

describe("parseExpiration", () => {
  it("extracts the date from the DTE-annotated form", () => {
    expect(parseExpiration("2026-11-20 (105d)")).toBe("2026-11-20");
    expect(parseExpiration("2026-10-16")).toBe("2026-10-16");
  });

  it("returns null when no date is present", () => {
    expect(parseExpiration("Oct monthly")).toBeNull();
  });
});

describe("optionTypeFromStructure", () => {
  it("derives the option type where the structure implies it", () => {
    expect(optionTypeFromStructure("LONG_CALL")).toBe("CALL");
    expect(optionTypeFromStructure("PUT_DEBIT_SPREAD")).toBe("PUT");
    expect(optionTypeFromStructure("CSP")).toBe("PUT");
  });

  it("returns null for the deliberately unspecific vertical", () => {
    expect(optionTypeFromStructure("VERTICAL_SPREAD")).toBeNull();
    expect(optionTypeFromStructure(null)).toBeNull();
  });
});
