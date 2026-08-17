import { describe, expect, it } from "vitest";
import { formatReconciliationDelta } from "./AccountBalancesWidget";

describe("formatReconciliationDelta", () => {
  it("renders unavailable when reconciliation could not be computed", () => {
    // Null whenever reconstructed NLV is null; a signed zero here would read as
    // a perfect match on the one account whose NLV is unknown.
    expect(formatReconciliationDelta(null)).toBe("—");
  });

  it("still renders an exact match as a signed zero", () => {
    expect(formatReconciliationDelta("0")).toBe("+$0.00");
    expect(formatReconciliationDelta("0.00")).toBe("+$0.00");
  });

  it("renders positive and negative deltas with their sign", () => {
    expect(formatReconciliationDelta("120.05")).toBe("+$120.05");
    expect(formatReconciliationDelta("-120.05")).toBe("-$120.05");
  });

  it("renders unavailable for a non-numeric value rather than NaN", () => {
    expect(formatReconciliationDelta("not-a-number")).toBe("—");
  });
});
