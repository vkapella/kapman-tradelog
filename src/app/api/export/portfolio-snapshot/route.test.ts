import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PortfolioSnapshot } from "@/types/api";

const mocks = vi.hoisted(() => ({
  account: { findMany: vi.fn() },
  execution: { findMany: vi.fn() },
  matchedLot: { findMany: vi.fn() },
  manualAdjustment: { findMany: vi.fn() },
  getEquityQuotes: vi.fn(),
  getOptionQuotesBatch: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    account: mocks.account,
    execution: mocks.execution,
    matchedLot: mocks.matchedLot,
    manualAdjustment: mocks.manualAdjustment,
  },
}));

vi.mock("@/lib/mcp/market-data", () => ({
  getEquityQuotes: mocks.getEquityQuotes,
  getOptionQuotesBatch: mocks.getOptionQuotesBatch,
}));

async function callGet(): Promise<PortfolioSnapshot> {
  const { GET } = await import("./route");
  const response = await GET(new Request("http://localhost/api/export/portfolio-snapshot"));
  const payload = (await response.json()) as { data: PortfolioSnapshot };
  return payload.data;
}

describe("GET /api/export/portfolio-snapshot", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.account.findMany.mockResolvedValue([]);
    mocks.execution.findMany.mockResolvedValue([]);
    mocks.matchedLot.findMany.mockResolvedValue([]);
    mocks.manualAdjustment.findMany.mockResolvedValue([]);
    mocks.getEquityQuotes.mockResolvedValue(null);
    mocks.getOptionQuotesBatch.mockResolvedValue(new Map());
  });

  it("returns a valid empty snapshot when there is no data", async () => {
    const data = await callGet();
    expect(data.kind).toBe("portfolio_snapshot");
    expect(data.source).toBe("kapman-tradelog");
    expect(data.tradelog_schema_version).toBe("1.0");
    expect(data.open_excursions_available).toBe(false);
    expect(data.open_positions).toEqual([]);
    expect(data.closed_lots).toEqual([]);
  });

  it("emits an open option leg with a computed mark and unrealized P&L, open-leg excursions null", async () => {
    mocks.account.findMany.mockResolvedValue([{ id: "acc1", accountId: "D-123" }]);
    mocks.execution.findMany.mockResolvedValue([
      {
        id: "open-aapl",
        accountId: "acc1",
        broker: "SCHWAB_THINKORSWIM",
        symbol: "AAPL",
        tradeDate: new Date("2026-05-20T00:00:00.000Z"),
        eventTimestamp: new Date("2026-05-20T14:30:00.000Z"),
        eventType: "TRADE",
        assetClass: "OPTION",
        side: "BUY",
        quantity: { toString: () => "2" },
        price: { toString: () => "6.20" },
        openingClosingEffect: "TO_OPEN",
        instrumentKey: "AAPL_K",
        underlyingSymbol: "AAPL",
        optionType: "CALL",
        strike: { toString: () => "190" },
        expirationDate: new Date("2026-08-15T00:00:00.000Z"),
        spreadGroupId: "SG1",
        importId: "imp-1",
      },
    ]);
    mocks.getOptionQuotesBatch.mockResolvedValue(new Map([["AAPL_K", 7.85]]));

    const data = await callGet();

    expect(mocks.getOptionQuotesBatch).toHaveBeenCalledTimes(1);
    expect(data.open_positions).toHaveLength(1);
    const leg = data.open_positions[0];
    expect(leg.instrument_key).toBe("AAPL_K");
    expect(leg.account_id).toBe("D-123");
    expect(leg.structure).toBe("long_call");
    expect(leg.direction).toBe("LONG");
    expect(leg.mark).toBe(7.85);
    expect(leg.unrealized_pnl).toBeCloseTo(330, 6); // 7.85*2*100 - 1240
    expect(leg.entry_price).toBeCloseTo(6.2, 6);
    expect(leg.entry_date).toBe("2026-05-20T00:00:00.000Z");
    expect(leg.spread_group_id).toBe("SG1");
    expect(leg.mae_pct).toBeNull();
    expect(leg.mfe_pct).toBeNull();
  });

  it("emits a closed lot with effectiveClosePrice and excursions", async () => {
    mocks.account.findMany.mockResolvedValue([{ id: "acc1", accountId: "D-123" }]);
    mocks.matchedLot.findMany.mockResolvedValue([
      {
        id: "ml1",
        accountId: "acc1",
        quantity: { toString: () => "1" },
        realizedPnl: { toString: () => "412" },
        holdingDays: 22,
        outcome: "WIN",
        openExecutionId: "open-msft",
        closeExecutionId: "close-msft",
        openExecution: { symbol: "MSFT", tradeDate: new Date("2026-05-27T00:00:00.000Z"), importId: "imp-2" },
        closeExecution: {
          tradeDate: new Date("2026-06-18T00:00:00.000Z"),
          price: null,
          eventType: "ASSIGNMENT",
          strike: { toString: () => "190" },
        },
        excursion: { maePct: { toString: () => "-0.18" }, mfePct: { toString: () => "0.41" } },
      },
    ]);

    const data = await callGet();

    expect(data.open_positions).toEqual([]);
    expect(data.closed_lots).toHaveLength(1);
    const lot = data.closed_lots[0];
    expect(lot.symbol).toBe("MSFT");
    expect(lot.account_id).toBe("D-123");
    expect(lot.realized_pnl).toBe(412);
    expect(lot.exit_date).toBe("2026-06-18T00:00:00.000Z");
    expect(lot.exit_price).toBe(190); // assignment, price null -> strike
    expect(lot.mae_pct).toBeCloseTo(-0.18, 6);
    expect(lot.mfe_pct).toBeCloseTo(0.41, 6);
  });
});
