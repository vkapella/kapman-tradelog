import { describe, expect, it } from "vitest";
import { calculateReturnOnCapital, snapshotValue } from "./return-on-capital";

describe("calculateReturnOnCapital", () => {
  it("calculates return against beginning value plus net contributed capital", () => {
    const result = calculateReturnOnCapital({
      beginningValue: 48049.97,
      endingValue: 127574.58,
      positiveExternalContributions: 52973.6,
      withdrawals: 0,
      missingBeginningValueAccountIds: [],
      missingEndingValueAccountIds: [],
      endingValueSource: "position_snapshot",
    });

    expect(result.netExternalContributions).toBeCloseTo(52973.6, 2);
    expect(result.returnDollars).toBeCloseTo(26551.01, 2);
    expect(result.capitalBase).toBeCloseTo(101023.57, 2);
    expect(result.returnOnCapitalPct).toBeCloseTo(26.28, 2);
  });

  it("treats withdrawals as capital reductions and subtracts net flows from return dollars", () => {
    const result = calculateReturnOnCapital({
      beginningValue: 10000,
      endingValue: 14000,
      positiveExternalContributions: 5000,
      withdrawals: 2000,
      missingBeginningValueAccountIds: [],
      missingEndingValueAccountIds: [],
      endingValueSource: "daily_account_snapshot",
    });

    expect(result.netExternalContributions).toBe(3000);
    expect(result.returnDollars).toBe(1000);
    expect(result.capitalBase).toBe(13000);
    expect(result.returnOnCapitalPct).toBeCloseTo(7.69, 2);
  });

  it("returns null percentage when any scoped account lacks required valuation coverage", () => {
    const result = calculateReturnOnCapital({
      beginningValue: 10000,
      endingValue: 14000,
      positiveExternalContributions: 0,
      withdrawals: 0,
      missingBeginningValueAccountIds: ["acct-2"],
      missingEndingValueAccountIds: [],
      endingValueSource: "daily_account_snapshot",
    });

    expect(result.returnDollars).toBe(4000);
    expect(result.returnOnCapitalPct).toBeNull();
  });
});

describe("snapshotValue", () => {
  it("uses broker NLV, then total cash, then balance", () => {
    expect(snapshotValue({ brokerNetLiquidationValue: { toString: () => "120" }, totalCash: 100, balance: 50 })).toBe(120);
    expect(snapshotValue({ brokerNetLiquidationValue: null, totalCash: { toString: () => "100" }, balance: 50 })).toBe(100);
    expect(snapshotValue({ brokerNetLiquidationValue: null, totalCash: null, balance: { toString: () => "50" } })).toBe(50);
  });
});
