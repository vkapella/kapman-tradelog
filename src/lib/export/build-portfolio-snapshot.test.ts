import { describe, expect, it } from "vitest";
import type { ExecutionRecord, OpenPosition } from "@/types/api";
import {
  buildEntryInfoByGroupKey,
  buildPortfolioSnapshot,
  deriveStructure,
  type PricedOpenPosition,
} from "./build-portfolio-snapshot";

function execution(overrides: Partial<ExecutionRecord>): ExecutionRecord {
  return {
    id: "exec-1",
    accountId: "acc1",
    broker: "SCHWAB_THINKORSWIM",
    symbol: "AAPL",
    tradeDate: "2026-05-20T00:00:00.000Z",
    eventTimestamp: "2026-05-20T14:30:00.000Z",
    eventType: "TRADE",
    assetClass: "OPTION",
    side: "BUY",
    quantity: "2",
    price: "6.20",
    openingClosingEffect: "TO_OPEN",
    instrumentKey: "AAPL_K",
    underlyingSymbol: "AAPL",
    optionType: "CALL",
    strike: "190",
    expirationDate: "2026-08-15T00:00:00.000Z",
    spreadGroupId: null,
    importId: "imp-1",
    ...overrides,
  };
}

function optionLeg(overrides: Partial<PricedOpenPosition>): PricedOpenPosition {
  const base: OpenPosition = {
    symbol: "AAPL",
    underlyingSymbol: "AAPL",
    assetClass: "OPTION",
    optionType: "CALL",
    strike: "190",
    expirationDate: "2026-08-15T00:00:00.000Z",
    instrumentKey: "AAPL_K",
    netQty: 2,
    costBasis: 1240,
    accountId: "acc1",
  };
  return { ...base, mark: 7.85, ...overrides };
}

describe("deriveStructure", () => {
  it("labels equity as stock", () => {
    expect(deriveStructure({ assetClass: "EQUITY", optionType: null, netQty: 100 })).toBe("stock");
  });

  it("labels option legs by type and sign", () => {
    expect(deriveStructure({ assetClass: "OPTION", optionType: "CALL", netQty: 2 })).toBe("long_call");
    expect(deriveStructure({ assetClass: "OPTION", optionType: "CALL", netQty: -2 })).toBe("short_call");
    expect(deriveStructure({ assetClass: "OPTION", optionType: "PUT", netQty: 3 })).toBe("long_put");
    expect(deriveStructure({ assetClass: "OPTION", optionType: "PUT", netQty: -3 })).toBe("short_put");
  });

  it("falls back to uncategorized when option type is missing", () => {
    expect(deriveStructure({ assetClass: "OPTION", optionType: null, netQty: 1 })).toBe("uncategorized");
  });
});

describe("buildEntryInfoByGroupKey", () => {
  it("keeps the earliest opening execution and carries its spread group", () => {
    const info = buildEntryInfoByGroupKey([
      execution({ id: "a", tradeDate: "2026-05-22T00:00:00.000Z", spreadGroupId: "SG1" }),
      execution({ id: "b", tradeDate: "2026-05-20T00:00:00.000Z", spreadGroupId: "SG1" }),
    ]);
    expect(info.get("acc1::AAPL_K")).toEqual({ entryDate: "2026-05-20T00:00:00.000Z", spreadGroupId: "SG1" });
  });

  it("ignores closing executions", () => {
    const info = buildEntryInfoByGroupKey([
      execution({ id: "close", openingClosingEffect: "TO_CLOSE", tradeDate: "2026-04-01T00:00:00.000Z" }),
    ]);
    expect(info.size).toBe(0);
  });
});

describe("buildPortfolioSnapshot", () => {
  const accountMap = new Map([["acc1", "D-123"]]);

  it("computes per-leg entry_price, unrealized_pnl, structure, direction and joins entry info", () => {
    const snapshot = buildPortfolioSnapshot({
      exportedAt: "2026-06-26T18:00:00.000Z",
      asOf: "2026-06-26T18:00:00.000Z",
      accountExternalIds: ["D-123"],
      accountExternalIdByInternal: accountMap,
      pricedOpenPositions: [optionLeg({})],
      executions: [execution({ spreadGroupId: "SG1" })],
    });

    expect(snapshot.kind).toBe("portfolio_snapshot");
    expect(snapshot.source).toBe("kapman-tradelog");
    expect(snapshot.tradelog_schema_version).toBe("1.0");
    expect(snapshot.open_excursions_available).toBe(false);
    expect(snapshot.account_ids).toEqual(["D-123"]);
    expect(snapshot).not.toHaveProperty("closed_lots");

    const leg = snapshot.open_positions[0];
    expect(leg.account_id).toBe("D-123");
    expect(leg.underlying_symbol).toBe("AAPL");
    expect(leg.structure).toBe("long_call");
    expect(leg.direction).toBe("LONG");
    expect(leg.entry_price).toBeCloseTo(6.2, 6); // 1240 / (2 * 100)
    expect(leg.unrealized_pnl).toBeCloseTo(330, 6); // 7.85*2*100 - 1240
    expect(leg.entry_date).toBe("2026-05-20T00:00:00.000Z");
    expect(leg.spread_group_id).toBe("SG1");
    expect(leg.mae_pct).toBeNull();
    expect(leg.mfe_pct).toBeNull();
    expect(leg.excursion_as_of).toBeNull();
  });

  it("emits null unrealized_pnl when the mark is unavailable", () => {
    const snapshot = buildPortfolioSnapshot({
      exportedAt: "t",
      asOf: "t",
      accountExternalIds: [],
      accountExternalIdByInternal: accountMap,
      pricedOpenPositions: [optionLeg({ mark: null })],
      executions: [],
    });
    expect(snapshot.open_positions[0].unrealized_pnl).toBeNull();
    expect(snapshot.open_positions[0].entry_date).toBeNull(); // no executions to join
  });
});
