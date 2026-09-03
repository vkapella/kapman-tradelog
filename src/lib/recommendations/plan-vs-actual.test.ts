import { describe, expect, it } from "vitest";
import {
  matchRecommendationToExecutions,
  type PlanExecRow,
  type PlanRecRow,
} from "./plan-vs-actual";

function rec(overrides: Partial<PlanRecRow> = {}): PlanRecRow {
  return {
    recId: "VS-20260807-1425-01/P2-01",
    ticker: "AMZN",
    structure: "LONG_CALL",
    disposition: "VALIDATED",
    asOf: new Date("2026-08-07T00:00:00.000Z"),
    optionType: "CALL",
    strike: 280,
    strikeShort: null,
    expirationDate: new Date("2026-11-20T00:00:00.000Z"),
    entryRangeLow: 16.6,
    entryRangeHigh: 16.9,
    sizingBand: null,
    ...overrides,
  };
}

function exec(overrides: Partial<PlanExecRow> = {}): PlanExecRow {
  return {
    id: "e1",
    accountId: "a1",
    tradeDate: new Date("2026-08-07T00:00:00.000Z"),
    underlyingSymbol: "AMZN",
    optionType: "CALL",
    strike: 280,
    expirationDate: new Date("2026-11-20T00:00:00.000Z"),
    side: "BUY",
    openingClosingEffect: "TO_OPEN",
    quantity: 2,
    price: 16.75,
    ...overrides,
  };
}

describe("matchRecommendationToExecutions — entity scope (#349)", () => {
  const personalFill = exec({ id: "personal", accountId: "fidelity", accountLegalEntityId: "le_personal", accountPaperMoney: false, price: 16.7 });
  const corporateFill = exec({ id: "corporate", accountId: "schwab-corp", accountLegalEntityId: "le_corp", accountPaperMoney: false, price: 18.2 });
  const paperFill = exec({ id: "paper", accountId: "d-53", accountLegalEntityId: "le_personal", accountPaperMoney: true, price: 16.0 });

  it("attributes only the entity's own live fill to a scoped recommendation", () => {
    const personal = matchRecommendationToExecutions(
      rec({ recId: "VS-1-R1/P2-01", legalEntityId: "le_personal", legalEntitySlug: "personal-vkapella", environment: "LIVE" }),
      [personalFill, corporateFill, paperFill],
      5,
    );
    expect(personal.scope).toEqual({ kind: "SCOPED", legalEntitySlug: "personal-vkapella", environment: "LIVE" });
    expect(personal.legs[0]?.executionIds).toEqual(["personal"]);
    expect(personal.effectivePrice).toBe(16.7);

    const corporate = matchRecommendationToExecutions(
      rec({ recId: "VS-1-R2/P2-01", legalEntityId: "le_corp", legalEntitySlug: "kapman-capital", environment: "LIVE" }),
      [personalFill, corporateFill, paperFill],
      5,
    );
    expect(corporate.legs[0]?.executionIds).toEqual(["corporate"]);
    expect(corporate.effectivePrice).toBe(18.2);
  });

  it("keeps a paper run away from live fills and vice versa", () => {
    const paperRun = matchRecommendationToExecutions(
      rec({ legalEntityId: "le_personal", legalEntitySlug: "personal-vkapella", environment: "PAPER" }),
      [personalFill, paperFill],
      5,
    );
    expect(paperRun.legs[0]?.executionIds).toEqual(["paper"]);
  });

  it("never matches an unclassified account to a scoped recommendation", () => {
    const result = matchRecommendationToExecutions(
      rec({ legalEntityId: "le_corp", legalEntitySlug: "kapman-capital", environment: "LIVE" }),
      [exec({ id: "unclassified", accountLegalEntityId: null, accountPaperMoney: false })],
      5,
    );
    expect(result.taken).toBe(false);
  });

  it("keeps the all-accounts join for legacy unscoped recommendations and says so", () => {
    const result = matchRecommendationToExecutions(rec(), [personalFill, corporateFill], 5);
    expect(result.scope).toEqual({ kind: "LEGACY_UNSCOPED" });
    expect(result.legs[0]?.executionIds).toEqual(["personal", "corporate"]);
  });
});

describe("matchRecommendationToExecutions — single leg", () => {
  it("marks a same-day fill inside the range", () => {
    const result = matchRecommendationToExecutions(rec(), [exec()], 5);
    expect(result.taken).toBe(true);
    expect(result.effectivePrice).toBe(16.75);
    expect(result.fillVsRange).toBe("INSIDE");
    expect(result.rangeDeviationPct).toBe(0);
    expect(result.daysToFill).toBe(0);
  });

  it("flags a fill above the validated range with signed % deviation (the 8/07 lesson)", () => {
    // AMZN filled ~25% above its validated range and nothing surfaced it.
    const result = matchRecommendationToExecutions(rec(), [exec({ price: 21.05 })], 5);
    expect(result.fillVsRange).toBe("ABOVE");
    expect(result.rangeDeviationPct).toBeCloseTo(((21.05 - 16.9) / 16.9) * 100, 1);
  });

  it("reports not-taken when no execution matches the strike", () => {
    const result = matchRecommendationToExecutions(rec(), [exec({ strike: 285 })], 5);
    expect(result.taken).toBe(false);
    expect(result.fillVsRange).toBeNull();
  });

  it("excludes executions outside the entry window", () => {
    const late = exec({ tradeDate: new Date("2026-08-20T00:00:00.000Z") });
    const result = matchRecommendationToExecutions(rec(), [late], 5);
    expect(result.taken).toBe(false);
  });

  it("excludes closing executions", () => {
    const closing = exec({ openingClosingEffect: "TO_CLOSE", side: "SELL" });
    const result = matchRecommendationToExecutions(rec(), [closing], 5);
    expect(result.taken).toBe(false);
  });

  it("computes a weighted average across partial fills", () => {
    const fills = [exec({ quantity: 1, price: 16.6 }), exec({ id: "e2", quantity: 3, price: 17.2 })];
    const result = matchRecommendationToExecutions(rec(), fills, 5);
    expect(result.effectivePrice).toBeCloseTo((16.6 * 1 + 17.2 * 3) / 4, 6);
    expect(result.fillVsRange).toBe("ABOVE");
  });
});

describe("matchRecommendationToExecutions — spreads", () => {
  const honRec = rec({
    recId: "VS-20260807-1425-01/P2-02",
    ticker: "HON",
    structure: "CALL_DEBIT_SPREAD",
    strike: 250,
    strikeShort: 270,
    expirationDate: new Date("2026-10-16T00:00:00.000Z"),
    entryRangeLow: 6.7,
    entryRangeHigh: 6.7,
  });

  const longLeg = exec({
    id: "L1",
    underlyingSymbol: "HON",
    strike: 250,
    expirationDate: new Date("2026-10-16T00:00:00.000Z"),
    price: 11.4,
  });
  const shortLeg = exec({
    id: "S1",
    underlyingSymbol: "HON",
    strike: 270,
    expirationDate: new Date("2026-10-16T00:00:00.000Z"),
    side: "SELL",
    price: 4.6,
  });

  it("prices a completed spread as net debit across both legs", () => {
    const result = matchRecommendationToExecutions(honRec, [longLeg, shortLeg], 5);
    expect(result.taken).toBe(true);
    expect(result.partialLegs).toBe(false);
    expect(result.effectivePrice).toBeCloseTo(11.4 - 4.6, 6);
    expect(result.fillVsRange).toBe("ABOVE");
    expect(result.legs).toHaveLength(2);
  });

  it("flags a single-leg fill as partial, not taken", () => {
    const result = matchRecommendationToExecutions(honRec, [longLeg], 5);
    expect(result.taken).toBe(false);
    expect(result.partialLegs).toBe(true);
    expect(result.fillVsRange).toBeNull();
  });
});

describe("matchRecommendationToExecutions — UNKNOWN opening effect", () => {
  it("falls back to the structure's opening side when the effect is UNKNOWN", () => {
    const unknown = exec({ openingClosingEffect: "UNKNOWN", side: "BUY" });
    const result = matchRecommendationToExecutions(rec(), [unknown], 5);
    expect(result.taken).toBe(true);
  });

  it("excludes a wrong-side execution when the effect is UNKNOWN (a closing SELL of a long call)", () => {
    const closingSell = exec({ openingClosingEffect: "UNKNOWN", side: "SELL" });
    const result = matchRecommendationToExecutions(rec(), [closingSell], 5);
    expect(result.taken).toBe(false);
  });

  it("excludes an UNKNOWN-effect execution when the structure gives no expected side", () => {
    const unknown = exec({ openingClosingEffect: "UNKNOWN", side: "BUY" });
    const result = matchRecommendationToExecutions(rec({ structure: null }), [unknown], 5);
    expect(result.taken).toBe(false);
  });

  it("accepts a SELL TO_OPEN for a CSP via the structure's opening side", () => {
    const cspRec = rec({ structure: "CSP", optionType: "PUT" });
    const sellOpen = exec({ openingClosingEffect: "UNKNOWN", side: "SELL", optionType: "PUT" });
    const result = matchRecommendationToExecutions(cspRec, [sellOpen], 5);
    expect(result.taken).toBe(true);
  });
});

describe("matchRecommendationToExecutions — degraded specs", () => {
  it("returns not-taken with empty legs when the rec has no strike", () => {
    const result = matchRecommendationToExecutions(rec({ strike: null }), [exec()], 5);
    expect(result.taken).toBe(false);
    expect(result.legs).toEqual([]);
  });

  it("reports NO_RANGE rather than inventing bounds when the range is absent", () => {
    const result = matchRecommendationToExecutions(
      rec({ entryRangeLow: null, entryRangeHigh: null }),
      [exec()],
      5,
    );
    expect(result.taken).toBe(true);
    expect(result.fillVsRange).toBe("NO_RANGE");
    expect(result.rangeDeviationPct).toBeNull();
  });
});
