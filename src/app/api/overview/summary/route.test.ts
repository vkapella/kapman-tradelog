import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  prisma: {
    account: {
      findMany: vi.fn(),
    },
    execution: {
      count: vi.fn(),
    },
    matchedLot: {
      findMany: vi.fn(),
    },
    setupGroup: {
      count: vi.fn(),
    },
    import: {
      findMany: vi.fn(),
    },
    dailyAccountSnapshot: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    cashEvent: {
      findMany: vi.fn(),
    },
    positionSnapshot: {
      findMany: vi.fn(),
    },
  },
  loadAccountBalanceContext: vi.fn(),
  getStartingCapitalSummary: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: routeMocks.prisma,
}));

vi.mock("@/lib/accounts/account-balance-context", () => ({
  loadAccountBalanceContext: routeMocks.loadAccountBalanceContext,
}));

vi.mock("@/lib/accounts/starting-capital", () => ({
  getStartingCapitalSummary: routeMocks.getStartingCapitalSummary,
}));

function money(value: string): { toString(): string } {
  return { toString: () => value };
}

describe("GET /api/overview/summary", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    routeMocks.prisma.account.findMany.mockResolvedValue([{ id: "acct-internal-1", accountId: "X19467537" }]);
    routeMocks.prisma.execution.count.mockResolvedValue(0);
    routeMocks.prisma.matchedLot.findMany.mockResolvedValue([]);
    routeMocks.prisma.setupGroup.count.mockResolvedValue(0);
    routeMocks.prisma.import.findMany.mockResolvedValue([]);
    routeMocks.prisma.dailyAccountSnapshot.count.mockResolvedValue(2);
    routeMocks.prisma.dailyAccountSnapshot.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "beginning-snapshot",
          accountId: "acct-internal-1",
          snapshotDate: new Date("2026-01-01T00:00:00.000Z"),
          balance: money("48049.97"),
          totalCash: null,
          brokerNetLiquidationValue: money("48049.97"),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "ending-snapshot",
          accountId: "acct-internal-1",
          snapshotDate: new Date("2026-05-22T00:00:00.000Z"),
          balance: money("127574.58"),
          totalCash: null,
          brokerNetLiquidationValue: money("127574.58"),
        },
      ]);
    routeMocks.prisma.cashEvent.findMany.mockResolvedValue([{ amount: money("52973.60") }]);
    routeMocks.prisma.positionSnapshot.findMany.mockResolvedValue([
      {
        accountIds: JSON.stringify(["acct-internal-1"]),
        currentNlv: money("127574.58"),
      },
    ]);
    routeMocks.loadAccountBalanceContext.mockResolvedValue([
      {
        accountExternalId: "X19467537",
        cash: 91532.64,
        cashAsOf: "2026-05-19T00:00:00.000Z",
        brokerNetLiquidationValue: null,
      },
    ]);
    routeMocks.getStartingCapitalSummary.mockResolvedValue({ total: 4500, byAccount: { "acct-internal-1": 4500 } });
  });

  it("returns a date-scoped return on capital using external capital flows", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/overview/summary?accountIds=X19467537&startDate=2026-01-01&endDate=2026-05-24"),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(routeMocks.prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ id: { in: ["X19467537"] } }, { accountId: { in: ["X19467537"] } }],
        },
      }),
    );
    expect(routeMocks.prisma.cashEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          accountId: { in: ["acct-internal-1"] },
          rowType: { in: ["TRANSFER_IN", "ACAT_RECEIVE", "ACAT_CREDIT"] },
          eventDate: {
            gte: new Date("2026-01-01"),
            lte: new Date("2026-05-24T23:59:59.999Z"),
          },
        }),
      }),
    );
    expect(routeMocks.prisma.matchedLot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.any(Object),
            {
              openExecution: {
                tradeDate: {
                  gte: new Date("2026-01-01"),
                  lte: new Date("2026-05-24T23:59:59.999Z"),
                },
              },
            },
          ],
        },
      }),
    );
    expect(routeMocks.prisma.setupGroup.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.any(Object),
            {
              lots: {
                some: {
                  matchedLot: {
                    openExecution: {
                      tradeDate: {
                        gte: new Date("2026-01-01"),
                        lte: new Date("2026-05-24T23:59:59.999Z"),
                      },
                    },
                  },
                },
                every: {
                  matchedLot: {
                    openExecution: {
                      tradeDate: {
                        gte: new Date("2026-01-01"),
                        lte: new Date("2026-05-24T23:59:59.999Z"),
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      }),
    );
    expect(payload.data.returnOnCapitalPct).toBe("26.28");
    expect(payload.data.returnOnCapital).toMatchObject({
      beginningValue: "48049.97",
      endingValue: "127574.58",
      netExternalContributions: "52973.60",
      positiveExternalContributions: "52973.60",
      withdrawals: "0.00",
      returnDollars: "26551.01",
      capitalBase: "101023.57",
      accountCount: 1,
      missingBeginningValueAccountIds: [],
      missingEndingValueAccountIds: [],
      endingValueSource: "position_snapshot",
    });
  });

  it("returns N/A-compatible return percentage when a scoped account lacks a beginning value", async () => {
    routeMocks.prisma.account.findMany.mockResolvedValue([
      { id: "acct-internal-1", accountId: "X19467537" },
      { id: "acct-internal-2", accountId: "D-68011054" },
    ]);
    routeMocks.prisma.dailyAccountSnapshot.findMany
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "beginning-snapshot",
          accountId: "acct-internal-1",
          snapshotDate: new Date("2026-01-01T00:00:00.000Z"),
          balance: money("10000.00"),
          totalCash: null,
          brokerNetLiquidationValue: money("10000.00"),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "ending-snapshot-1",
          accountId: "acct-internal-1",
          snapshotDate: new Date("2026-05-22T00:00:00.000Z"),
          balance: money("12000.00"),
          totalCash: null,
          brokerNetLiquidationValue: money("12000.00"),
        },
        {
          id: "ending-snapshot-2",
          accountId: "acct-internal-2",
          snapshotDate: new Date("2026-05-22T00:00:00.000Z"),
          balance: money("5000.00"),
          totalCash: null,
          brokerNetLiquidationValue: money("5000.00"),
        },
      ]);
    routeMocks.prisma.cashEvent.findMany.mockResolvedValue([]);
    routeMocks.prisma.positionSnapshot.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/overview/summary?accountIds=X19467537,D-68011054&startDate=2026-01-01&endDate=2026-05-24"),
    );
    const payload = await response.json();

    expect(payload.data.returnOnCapitalPct).toBeNull();
    expect(payload.data.returnOnCapital.missingBeginningValueAccountIds).toEqual(["D-68011054"]);
  });

  it("reduces capital base by withdrawals and uses snapshot ending source when quote-backed NLV is unavailable", async () => {
    routeMocks.prisma.cashEvent.findMany.mockResolvedValue([{ amount: money("2000.00") }, { amount: money("-500.00") }]);
    routeMocks.prisma.positionSnapshot.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/overview/summary?accountIds=X19467537&startDate=2026-01-01&endDate=2026-05-24"),
    );
    const payload = await response.json();

    expect(payload.data.returnOnCapital).toMatchObject({
      netExternalContributions: "1500.00",
      positiveExternalContributions: "2000.00",
      withdrawals: "500.00",
      returnDollars: "78024.61",
      capitalBase: "49549.97",
      endingValueSource: "daily_account_snapshot",
    });
    expect(payload.data.returnOnCapitalPct).toBe("157.47");
  });

  it("aggregates multi-account return on capital portfolio-style and reports mixed ending source", async () => {
    routeMocks.prisma.account.findMany.mockResolvedValue([
      { id: "acct-internal-1", accountId: "X19467537" },
      { id: "acct-internal-2", accountId: "D-68011054" },
    ]);
    routeMocks.prisma.dailyAccountSnapshot.findMany
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "beginning-snapshot-1",
          accountId: "acct-internal-1",
          snapshotDate: new Date("2026-01-01T00:00:00.000Z"),
          balance: money("10000.00"),
          totalCash: null,
          brokerNetLiquidationValue: money("10000.00"),
        },
        {
          id: "beginning-snapshot-2",
          accountId: "acct-internal-2",
          snapshotDate: new Date("2026-01-01T00:00:00.000Z"),
          balance: money("20000.00"),
          totalCash: null,
          brokerNetLiquidationValue: money("20000.00"),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "ending-snapshot-1",
          accountId: "acct-internal-1",
          snapshotDate: new Date("2026-05-24T00:00:00.000Z"),
          balance: money("14000.00"),
          totalCash: null,
          brokerNetLiquidationValue: money("14000.00"),
        },
        {
          id: "ending-snapshot-2",
          accountId: "acct-internal-2",
          snapshotDate: new Date("2026-05-24T00:00:00.000Z"),
          balance: money("26000.00"),
          totalCash: null,
          brokerNetLiquidationValue: money("26000.00"),
        },
      ]);
    routeMocks.prisma.cashEvent.findMany.mockResolvedValue([{ amount: money("5000.00") }]);
    routeMocks.prisma.positionSnapshot.findMany.mockResolvedValue([
      {
        accountIds: JSON.stringify(["acct-internal-1"]),
        currentNlv: money("15000.00"),
      },
    ]);

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/overview/summary?accountIds=X19467537,D-68011054&startDate=2026-01-01&endDate=2026-05-24"),
    );
    const payload = await response.json();

    expect(payload.data.returnOnCapital).toMatchObject({
      beginningValue: "30000.00",
      endingValue: "41000.00",
      netExternalContributions: "5000.00",
      capitalBase: "35000.00",
      endingValueSource: "mixed",
      missingBeginningValueAccountIds: [],
      missingEndingValueAccountIds: [],
    });
    expect(payload.data.returnOnCapitalPct).toBe("17.14");
  });
});
