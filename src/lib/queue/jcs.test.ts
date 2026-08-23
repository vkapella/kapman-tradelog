import { describe, expect, it } from "vitest";
import { canonicalize, proposalHash } from "./jcs";

describe("canonicalize (RFC 8785 JCS)", () => {
  it("sorts object keys recursively", () => {
    expect(canonicalize({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(canonicalize({ z: { y: 2, x: 1 }, a: [{ c: 3, b: 2 }] })).toBe(
      '{"a":[{"b":2,"c":3}],"z":{"x":1,"y":2}}',
    );
  });

  it("serializes numbers per ECMAScript (the JCS number form)", () => {
    expect(canonicalize(2)).toBe("2");
    expect(canonicalize(2.0)).toBe("2");
    expect(canonicalize(0.5)).toBe("0.5");
    expect(canonicalize(1e30)).toBe("1e+30");
    expect(canonicalize(1e-7)).toBe("1e-7");
    expect(canonicalize(0.000001)).toBe("0.000001");
  });

  it("preserves the three snapshot states: value, null, absent", () => {
    expect(canonicalize({ a: null })).toBe('{"a":null}');
    expect(canonicalize({})).toBe("{}");
    // undefined-valued keys drop, matching JSON.stringify — absence stays absence
    expect(canonicalize({ a: undefined, b: 1 })).toBe('{"b":1}');
  });

  it("matches JSON.stringify string escaping", () => {
    const s = 'quote " backslash \\ newline \n tab \t unicode €';
    expect(canonicalize(s)).toBe(JSON.stringify(s));
  });

  it("refuses non-finite numbers", () => {
    expect(() => canonicalize(Number.NaN)).toThrow();
    expect(() => canonicalize(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("is insensitive to source key order (the property the hash relies on)", () => {
    const a = { evaluation: { gate_result: "pipeline-flagged", flag_reasons: ["x"] }, ticker: "HON" };
    const b = { ticker: "HON", evaluation: { flag_reasons: ["x"], gate_result: "pipeline-flagged" } };
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(proposalHash(a)).toBe(proposalHash(b));
  });
});

describe("proposalHash", () => {
  it("is lowercase-hex sha256 of the canonical form", () => {
    // sha256('{"a":1}') — fixed vector
    expect(proposalHash({ a: 1 })).toBe(
      "015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862",
    );
    expect(proposalHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
