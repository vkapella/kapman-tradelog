import { describe, expect, it } from "vitest";
import { formatReconciliationDelta, statusMessage } from "./AccountBalancesWidget";

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

describe("statusMessage", () => {
  const base = { missingMarkCount: 0, staleMarkCount: 0, staleMarkAsOf: null };

  it("says nothing when the account value is current", () => {
    expect(statusMessage({ ...base, status: "CURRENT" })).toBeNull();
  });

  it("reports how many positions are missing a mark", () => {
    expect(statusMessage({ ...base, status: "INCOMPLETE_MARKS", missingMarkCount: 1 }))
      .toBe("1 open position is missing a market mark.");
    expect(statusMessage({ ...base, status: "INCOMPLETE_MARKS", missingMarkCount: 3 }))
      .toBe("3 open positions are missing a market mark.");
  });

  it("states plainly that a value includes stale prices, and as of when", () => {
    expect(statusMessage({ ...base, status: "STALE_MARKS", staleMarkCount: 1, staleMarkAsOf: "2026-08-14" }))
      .toBe("1 open position is priced from the last daily close from 2026-08-14, not a live quote.");
    expect(statusMessage({ ...base, status: "STALE_MARKS", staleMarkCount: 2, staleMarkAsOf: "2026-08-14" }))
      .toBe("2 open positions are priced from the last daily close from 2026-08-14, not a live quote.");
  });

  it("omits the date when no stale mark date is known", () => {
    expect(statusMessage({ ...base, status: "STALE_MARKS", staleMarkCount: 1 }))
      .toBe("1 open position is priced from the last daily close, not a live quote.");
  });

  it("explains a cash and mark date mismatch", () => {
    expect(statusMessage({ ...base, status: "MIXED_AS_OF" }))
      .toBe("Cash and market marks have different effective dates.");
  });
});
