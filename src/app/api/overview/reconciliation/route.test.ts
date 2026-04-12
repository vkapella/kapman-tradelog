import { beforeEach, describe, expect, it, vi } from "vitest";

const reconciliationRouteMocks = vi.hoisted(() => {
  return {
    execution: {
      findMany: vi.fn(),
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
    },
    account: {
      findMany: vi.fn(),
    },
  };
});

vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: {
      execution: reconciliationRouteMocks.execution,
      matchedLot: reconciliationRouteMocks.matchedLot,
      manualAdjustment: reconciliationRouteMocks.manualAdjustment,
      dailyAccountSnapshot: reconciliationRouteMocks.dailyAccountSnapshot,
      cashEvent: reconciliationRouteMocks.cashEvent,
      account: reconciliationRouteMocks.account,
    },
  };
});

vi.mock("@/lib/mcp/market-data", () => {
  return {
    getEquityQuotes: vi.fn().mockResolvedValue({}),
    getOptionQuote: vi.fn().mockResolvedValue(null),
  };
});

describe("GET /api/overview/reconciliation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.STARTING_CAPITAL = "999999";

    reconciliationRouteMocks.execution.findMany.mockResolvedValue([]);
    reconciliationRouteMocks.matchedLot.findMany.mockResolvedValue([]);
    reconciliationRouteMocks.manualAdjustment.findMany.mockResolvedValue([]);
    reconciliationRouteMocks.dailyAccountSnapshot.findMany.mockResolvedValue([
      {
        accountId: "acct-1",
        brokerNetLiquidationValue: { toString: () => "125000" },
        snapshotDate: new Date("2026-04-12T00:00:00.000Z"),
        id: "snapshot-1",
      },
      {
        accountId: "acct-2",
        brokerNetLiquidationValue: { toString: () => "115000" },
        snapshotDate: new Date("2026-04-12T00:00:00.000Z"),
        id: "snapshot-2",
      },
    ]);
    reconciliationRouteMocks.matchedLot.aggregate.mockResolvedValue({ _sum: { realizedPnl: { toString: () => "0" } } });
    reconciliationRouteMocks.cashEvent.aggregate.mockResolvedValue({ _sum: { amount: { toString: () => "0" } } });
    reconciliationRouteMocks.account.findMany.mockResolvedValue([
      { accountId: "D-68011053", startingCapital: { toString: () => "100000" } },
      { accountId: "D-68011054", startingCapital: { toString: () => "100000" } },
    ]);
  });

  it("uses Account.startingCapital instead of the STARTING_CAPITAL env var", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/overview/reconciliation"));
    const payload = (await response.json()) as { data: { startingCapital: string; totalGain: string; startingCapitalConfigured: boolean } };

    expect(payload.data).toEqual(
      expect.objectContaining({
        startingCapital: "200000.00",
        totalGain: "40000.00",
        startingCapitalConfigured: true,
      }),
    );
  });
});
