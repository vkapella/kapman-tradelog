import { describe, expect, it } from "vitest";
import { inferSetupGroups, type SetupInferenceLot } from "./setup-inference";

function day(value: string): Date {
  return new Date(value);
}

function lot(overrides: Partial<SetupInferenceLot>): SetupInferenceLot {
  const base: SetupInferenceLot = {
    id: "lot-1",
    accountId: "account-1",
    symbol: "SPY",
    underlyingSymbol: "SPY",
    openTradeDate: day("2026-01-01T00:00:00.000Z"),
    closeTradeDate: day("2026-01-03T00:00:00.000Z"),
    realizedPnl: 100,
    holdingDays: 2,
    openAssetClass: "OPTION",
    openSide: "BUY",
    optionType: "CALL",
    strike: 500,
    expirationDate: day("2026-03-20T00:00:00.000Z"),
    openSpreadGroupId: null,
  };

  return { ...base, ...overrides };
}

describe("inferSetupGroups", () => {
  it("infers long_call for a single bought call lot", () => {
    const result = inferSetupGroups([lot({ id: "single-long-call" })]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.tag).toBe("long_call");
  });

  it("infers long_call for multi-lot bought call groups", () => {
    const first = lot({ id: "call-1", strike: 500, openTradeDate: day("2026-01-01T00:00:00.000Z") });
    const second = lot({ id: "call-2", strike: 510, openTradeDate: day("2026-01-03T00:00:00.000Z") });

    const result = inferSetupGroups([first, second]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.tag).toBe("long_call");
  });

  it("infers long_put for multi-lot bought puts", () => {
    const first = lot({ id: "put-1", optionType: "PUT", openTradeDate: day("2026-01-01T00:00:00.000Z") });
    const second = lot({ id: "put-2", optionType: "PUT", openTradeDate: day("2026-01-02T00:00:00.000Z") });

    const result = inferSetupGroups([first, second]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.tag).toBe("long_put");
  });

  it("infers cash_secured_put for multi-lot short puts", () => {
    const first = lot({ id: "csp-1", optionType: "PUT", openSide: "SELL" });
    const second = lot({ id: "csp-2", optionType: "PUT", openSide: "SELL", openTradeDate: day("2026-01-02T00:00:00.000Z") });

    const result = inferSetupGroups([first, second]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.tag).toBe("cash_secured_put");
  });

  it("pairs a late short call leg to a long call anchor as vertical even beyond grouping window", () => {
    const longCall = lot({
      id: "anchor-long",
      strike: 500,
      expirationDate: day("2026-03-20T00:00:00.000Z"),
      openTradeDate: day("2026-01-01T00:00:00.000Z"),
      closeTradeDate: day("2026-01-21T00:00:00.000Z"),
    });
    const shortCall = lot({
      id: "late-short",
      openSide: "SELL",
      strike: 520,
      expirationDate: day("2026-03-20T00:00:00.000Z"),
      openTradeDate: day("2026-01-12T00:00:00.000Z"),
      closeTradeDate: day("2026-01-15T00:00:00.000Z"),
      realizedPnl: -10,
    });

    const result = inferSetupGroups([longCall, shortCall], { groupingWindowDays: 5 });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.tag).toBe("bull_vertical");
    expect(result.diagnostics.setupInferenceShortCallPairedTotal).toBe(1);
    expect(result.diagnostics.setupInferencePairVerticalTotal).toBe(1);
  });

  it("pairs to diagonal when long call expiration is later than short call", () => {
    const longCall = lot({
      id: "long-diagonal",
      strike: 500,
      expirationDate: day("2026-06-19T00:00:00.000Z"),
      openTradeDate: day("2026-01-01T00:00:00.000Z"),
      closeTradeDate: day("2026-02-15T00:00:00.000Z"),
    });
    const shortCall = lot({
      id: "short-diagonal",
      openSide: "SELL",
      strike: 530,
      expirationDate: day("2026-03-20T00:00:00.000Z"),
      openTradeDate: day("2026-01-20T00:00:00.000Z"),
      closeTradeDate: day("2026-01-25T00:00:00.000Z"),
    });

    const result = inferSetupGroups([longCall, shortCall]);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.tag).toBe("diagonal");
    expect(result.diagnostics.setupInferencePairDiagonalTotal).toBe(1);
  });

  it("uses deterministic tie-breakers and records ambiguous candidate diagnostics", () => {
    const anchorAlpha = lot({
      id: "anchor-alpha",
      strike: 500,
      expirationDate: day("2026-06-19T00:00:00.000Z"),
      openTradeDate: day("2026-01-10T00:00:00.000Z"),
      closeTradeDate: day("2026-03-01T00:00:00.000Z"),
    });
    const anchorBeta = lot({
      id: "anchor-beta",
      strike: 500,
      expirationDate: day("2026-06-19T00:00:00.000Z"),
      openTradeDate: day("2026-01-10T00:00:00.000Z"),
      closeTradeDate: day("2026-03-01T00:00:00.000Z"),
    });
    const shortCall = lot({
      id: "short-ambiguous",
      openSide: "SELL",
      strike: 520,
      expirationDate: day("2026-03-20T00:00:00.000Z"),
      openTradeDate: day("2026-01-20T00:00:00.000Z"),
    });

    const result = inferSetupGroups([anchorAlpha, anchorBeta, shortCall]);

    expect(result.groups).toHaveLength(2);
    const diagonalGroup = result.groups.find((group) => group.tag === "diagonal");
    expect(diagonalGroup).toBeDefined();
    expect(diagonalGroup?.lotIds).toContain("anchor-alpha");
    expect(diagonalGroup?.lotIds).toContain("short-ambiguous");
    expect(result.diagnostics.setupInferencePairAmbiguousTotal).toBe(1);
  });

  it("falls back to short_call when no overlapping long-call anchor exists", () => {
    const shortCall = lot({
      id: "standalone-short",
      openSide: "SELL",
      strike: 520,
      openTradeDate: day("2026-01-20T00:00:00.000Z"),
    });

    const result = inferSetupGroups([shortCall]);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.tag).toBe("short_call");
    expect(result.diagnostics.setupInferencePairFailNoOverlapLongCallTotal).toBe(1);
    expect(result.diagnostics.setupInferenceShortCallStandaloneTotal).toBe(1);
  });

  it("reports no-eligible-exp failure when overlap exists but expiration rules fail", () => {
    const longCall = lot({
      id: "long-exp-too-soon",
      strike: 500,
      expirationDate: day("2026-02-20T00:00:00.000Z"),
      openTradeDate: day("2026-01-01T00:00:00.000Z"),
      closeTradeDate: day("2026-03-01T00:00:00.000Z"),
    });
    const shortCall = lot({
      id: "short-fail-exp",
      openSide: "SELL",
      strike: 520,
      expirationDate: day("2026-03-20T00:00:00.000Z"),
      openTradeDate: day("2026-01-20T00:00:00.000Z"),
    });

    const result = inferSetupGroups([longCall, shortCall]);

    expect(result.groups).toHaveLength(2);
    expect(result.groups.map((group) => group.tag).sort()).toEqual(["long_call", "short_call"]);
    expect(result.diagnostics.setupInferencePairFailNoEligibleExpTotal).toBe(1);
  });

  it("ignores cross-underlying anchors that only create a no-eligible-exp false positive", () => {
    const spxwLongCall = lot({
      id: "spxw-long",
      symbol: "SPXW",
      underlyingSymbol: "SPXW",
      strike: 6080,
      expirationDate: day("2026-01-10T00:00:00.000Z"),
      openTradeDate: day("2026-01-01T00:00:00.000Z"),
      closeTradeDate: day("2026-02-15T00:00:00.000Z"),
    });
    const xleShortCall = lot({
      id: "xle-short",
      symbol: "XLE",
      underlyingSymbol: "XLE",
      openSide: "SELL",
      strike: 95,
      expirationDate: day("2026-03-20T00:00:00.000Z"),
      openTradeDate: day("2026-01-20T00:00:00.000Z"),
    });

    const result = inferSetupGroups([spxwLongCall, xleShortCall]);
    const diagnosticCodes = result.diagnostics.setupInferenceSamples.map((sample) => sample.code);
    const xleGroup = result.groups.find((group) => group.underlyingSymbol === "XLE");

    expect(result.groups).toHaveLength(2);
    expect(xleGroup?.tag).toBe("short_call");
    expect(result.diagnostics.setupInferencePairFailNoEligibleExpTotal).toBe(0);
    expect(result.diagnostics.setupInferencePairFailNoOverlapLongCallTotal).toBe(1);
    expect(diagnosticCodes).not.toContain("PAIR_FAIL_NO_ELIGIBLE_EXP");
  });

  it("ignores cross-underlying anchors that would otherwise create a pairing ambiguity", () => {
    const armAnchorAlpha = lot({
      id: "arm-anchor-alpha",
      symbol: "ARM",
      underlyingSymbol: "ARM",
      strike: 140,
      expirationDate: day("2026-06-19T00:00:00.000Z"),
      openTradeDate: day("2026-01-10T00:00:00.000Z"),
      closeTradeDate: day("2026-03-01T00:00:00.000Z"),
    });
    const armAnchorBeta = lot({
      id: "arm-anchor-beta",
      symbol: "ARM",
      underlyingSymbol: "ARM",
      strike: 140,
      expirationDate: day("2026-06-19T00:00:00.000Z"),
      openTradeDate: day("2026-01-10T00:00:00.000Z"),
      closeTradeDate: day("2026-03-01T00:00:00.000Z"),
    });
    const nvdaShortCall = lot({
      id: "nvda-short",
      symbol: "NVDA",
      underlyingSymbol: "NVDA",
      openSide: "SELL",
      strike: 160,
      expirationDate: day("2026-03-20T00:00:00.000Z"),
      openTradeDate: day("2026-01-20T00:00:00.000Z"),
    });

    const result = inferSetupGroups([armAnchorAlpha, armAnchorBeta, nvdaShortCall]);
    const diagnosticCodes = result.diagnostics.setupInferenceSamples.map((sample) => sample.code);
    const nvdaGroup = result.groups.find((group) => group.underlyingSymbol === "NVDA");

    expect(nvdaGroup?.tag).toBe("short_call");
    expect(result.diagnostics.setupInferencePairAmbiguousTotal).toBe(0);
    expect(diagnosticCodes).not.toContain("PAIR_AMBIGUOUS");
  });

  it("prevents cross-underlying short calls from contaminating anchor tag resolution", () => {
    const tsmLongCall = lot({
      id: "tsm-anchor",
      symbol: "TSM",
      underlyingSymbol: "TSM",
      strike: 200,
      expirationDate: day("2026-06-19T00:00:00.000Z"),
      openTradeDate: day("2026-01-01T00:00:00.000Z"),
      closeTradeDate: day("2026-04-01T00:00:00.000Z"),
    });
    const nvdaShortVertical = lot({
      id: "nvda-short-vertical",
      symbol: "NVDA",
      underlyingSymbol: "NVDA",
      openSide: "SELL",
      strike: 220,
      expirationDate: day("2026-06-19T00:00:00.000Z"),
      openTradeDate: day("2026-01-20T00:00:00.000Z"),
    });
    const nvdaShortCalendar = lot({
      id: "nvda-short-calendar",
      symbol: "NVDA",
      underlyingSymbol: "NVDA",
      openSide: "SELL",
      strike: 200,
      expirationDate: day("2026-03-20T00:00:00.000Z"),
      openTradeDate: day("2026-01-22T00:00:00.000Z"),
    });

    const result = inferSetupGroups([tsmLongCall, nvdaShortVertical, nvdaShortCalendar]);
    const diagnosticCodes = result.diagnostics.setupInferenceSamples.map((sample) => sample.code);
    const tsmGroup = result.groups.find((group) => group.underlyingSymbol === "TSM");
    const nvdaGroup = result.groups.find((group) => group.underlyingSymbol === "NVDA");

    expect(tsmGroup?.tag).toBe("long_call");
    expect(nvdaGroup?.tag).toBe("short_call");
    expect(diagnosticCodes).not.toContain("ANCHOR_TAG_AMBIGUOUS");
  });

  it("infers covered_call when stock and short_call atoms are in the same setup window", () => {
    const stockLot = lot({
      id: "stock-1",
      openAssetClass: "EQUITY",
      optionType: null,
      strike: null,
      expirationDate: null,
      openSide: "BUY",
    });
    const shortCall = lot({
      id: "cc-short",
      openSide: "SELL",
      optionType: "CALL",
      strike: 520,
      openTradeDate: day("2026-01-02T00:00:00.000Z"),
      closeTradeDate: day("2026-01-04T00:00:00.000Z"),
    });

    const result = inferSetupGroups([stockLot, shortCall]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.tag).toBe("covered_call");
  });

  it("infers covered_call for later short-call clusters when overlapping stock inventory remains open", () => {
    const stockLot = lot({
      id: "stock-anchor",
      openAssetClass: "EQUITY",
      optionType: null,
      strike: null,
      expirationDate: null,
      openTradeDate: day("2026-01-01T00:00:00.000Z"),
      closeTradeDate: day("2026-03-01T00:00:00.000Z"),
      openSide: "BUY",
    });
    const shortCall = lot({
      id: "covered-short-late",
      openSide: "SELL",
      optionType: "CALL",
      strike: 520,
      openTradeDate: day("2026-01-20T00:00:00.000Z"),
      closeTradeDate: day("2026-01-24T00:00:00.000Z"),
    });

    const result = inferSetupGroups([stockLot, shortCall], { groupingWindowDays: 5 });

    expect(result.groups.map((group) => group.tag).sort()).toEqual(["covered_call", "stock"]);
    const coveredCallGroup = result.groups.find((group) => group.tag === "covered_call");
    expect(coveredCallGroup?.lotIds).toEqual(["covered-short-late"]);
    expect(result.diagnostics.setupInferenceShortCallStandaloneTotal).toBe(0);
    expect(result.diagnostics.setupInferencePairFailNoOverlapLongCallTotal).toBe(0);
  });

  it("does not force spread classification for same-side spread_group_id lots", () => {
    const first = lot({
      id: "put-group-1",
      optionType: "PUT",
      openSide: "BUY",
      openSpreadGroupId: "spread-same-side",
    });
    const second = lot({
      id: "put-group-2",
      optionType: "PUT",
      openSide: "BUY",
      openTradeDate: day("2026-01-02T00:00:00.000Z"),
      openSpreadGroupId: "spread-same-side",
    });

    const result = inferSetupGroups([first, second]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.tag).toBe("long_put");
  });
});
