import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => {
  return {
    account: {
      findMany: vi.fn(),
    },
    execution: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    matchedLot: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    manualAdjustment: {
      findMany: vi.fn(),
    },
    dailyAccountSnapshot: {
      findMany: vi.fn(),
    },
    cashEvent: {
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    positionSnapshot: {
      create: vi.fn(),
      update: vi.fn(),
    },
    getEquityQuotes: vi.fn(),
    getOptionQuotesBatch: vi.fn(),
    getStartingCapitalSummary: vi.fn(),
    computeOpenPositions: vi.fn(),
  };
});

vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: {
      account: routeMocks.account,
      execution: routeMocks.execution,
      matchedLot: routeMocks.matchedLot,
      manualAdjustment: routeMocks.manualAdjustment,
      dailyAccountSnapshot: routeMocks.dailyAccountSnapshot,
      cashEvent: routeMocks.cashEvent,
      positionSnapshot: routeMocks.positionSnapshot,
    },
  };
});

vi.mock("@/lib/mcp/market-data", () => {
  return {
    getEquityQuotes: routeMocks.getEquityQuotes,
    getOptionQuotesBatch: routeMocks.getOptionQuotesBatch,
  };
});

vi.mock("@/lib/accounts/starting-capital", () => {
  return {
    getStartingCapitalSummary: routeMocks.getStartingCapitalSummary,
  };
});

vi.mock("@/lib/positions/compute-open-positions", () => {
  return {
    computeOpenPositions: routeMocks.computeOpenPositions,
  };
});

describe("POST /api/positions/snapshot/compute", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    routeMocks.account.findMany.mockResolvedValue([{ id: "acct-internal-1", accountId: "acct-external-1" }]);
    routeMocks.positionSnapshot.create.mockResolvedValue({ id: "snapshot-1", status: "PENDING" });
    routeMocks.positionSnapshot.update.mockResolvedValue({ id: "snapshot-1" });
    routeMocks.execution.findMany.mockResolvedValue([]);
    routeMocks.execution.groupBy.mockResolvedValue([]);
    routeMocks.matchedLot.findMany.mockResolvedValue([]);
    routeMocks.manualAdjustment.findMany.mockResolvedValue([]);
    routeMocks.dailyAccountSnapshot.findMany.mockResolvedValue([
      {
        accountId: "acct-internal-1",
        brokerNetLiquidationValue: { toString: () => "12345.67" },
        snapshotDate: new Date("2026-04-13T00:00:00.000Z"),
        id: "daily-1",
        balance: { toString: () => "12345.67" },
        totalCash: { toString: () => "2345.67" },
      },
    ]);
    routeMocks.matchedLot.aggregate.mockResolvedValue({ _sum: { realizedPnl: { toString: () => "55.50" } } });
    routeMocks.cashEvent.aggregate.mockResolvedValue({ _sum: { amount: { toString: () => "10.00" } } });
    routeMocks.cashEvent.groupBy.mockResolvedValue([]);
    routeMocks.getStartingCapitalSummary.mockResolvedValue({ total: 10000, byAccount: { "acct-internal-1": 10000 } });
    routeMocks.getEquityQuotes.mockResolvedValue({ SPY: { mark: 510, bid: 509, ask: 511, last: 510, netChange: 0, netPctChange: 0 } });
    routeMocks.getOptionQuotesBatch.mockResolvedValue(new Map());
    routeMocks.computeOpenPositions.mockReturnValue([
      {
        symbol: "SPY",
        underlyingSymbol: "SPY",
        assetClass: "EQUITY",
        optionType: null,
        strike: null,
        expirationDate: null,
        instrumentKey: "SPY",
        netQty: 2,
        costBasis: 1000,
        accountId: "acct-internal-1",
      },
    ]);
  });

  it("returns a pending snapshot immediately and completes the async update", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/positions/snapshot/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds: ["acct-internal-1"] }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        snapshotId: "snapshot-1",
        status: "PENDING",
      },
    });

    await vi.waitFor(() => {
      expect(routeMocks.positionSnapshot.update).toHaveBeenCalled();
    });

    const completedUpdate = routeMocks.positionSnapshot.update.mock.calls.find(
      ([payload]) => payload?.data?.status === "COMPLETE",
    )?.[0];

    expect(completedUpdate).toBeDefined();
    expect(completedUpdate.where).toEqual({ id: "snapshot-1" });
    expect(completedUpdate.data.currentNlv).toBeDefined();
    expect(completedUpdate.data.unrealizedPnl).toBeDefined();
    expect(JSON.parse(completedUpdate.data.positionsJson)).toEqual([
      expect.objectContaining({
        instrumentKey: "SPY",
        mark: 510,
      }),
    ]);
  });

  it("rejects an invalid request body", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/positions/snapshot/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds: "bad" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_BODY",
        message: "Unable to parse snapshot compute request.",
        details: ["Expected body shape: { accountIds?: string[] }."],
      },
    });
  });

  it("falls back to cash plus marked positions when broker NLV snapshots are unavailable", async () => {
    routeMocks.dailyAccountSnapshot.findMany.mockResolvedValue([]);
    routeMocks.execution.groupBy.mockResolvedValue([
      {
        accountId: "acct-internal-1",
        _sum: { netAmount: { toString: () => "250.00" } },
        _max: { tradeDate: new Date("2026-04-10T00:00:00.000Z") },
      },
    ]);
    routeMocks.cashEvent.groupBy.mockResolvedValue([
      {
        accountId: "acct-internal-1",
        _sum: { amount: { toString: () => "750.00" } },
        _max: { eventDate: new Date("2026-04-11T00:00:00.000Z") },
      },
    ]);

    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/positions/snapshot/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds: ["acct-internal-1"] }),
      }),
    );

    expect(response.status).toBe(200);

    await vi.waitFor(() => {
      expect(routeMocks.positionSnapshot.update).toHaveBeenCalled();
    });

    const completedUpdate = routeMocks.positionSnapshot.update.mock.calls.find(
      ([payload]) => payload?.data?.status === "COMPLETE",
    )?.[0];

    expect(completedUpdate).toBeDefined();
    expect(completedUpdate.data.currentNlv.toString()).toBe("2020");
  });
});
