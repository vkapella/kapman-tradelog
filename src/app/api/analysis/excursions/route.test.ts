import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  prisma: {
    matchedLot: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: routeMocks.prisma,
}));

function money(value: string): { toString(): string; valueOf(): number } {
  return {
    toString: () => value,
    valueOf: () => Number(value),
  };
}

describe("GET /api/analysis/excursions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    routeMocks.prisma.matchedLot.count.mockResolvedValue(0);
    routeMocks.prisma.matchedLot.findMany.mockResolvedValue([]);
  });

  it("returns persisted lot excursions with setup and return fields", async () => {
    routeMocks.prisma.matchedLot.count.mockResolvedValue(1);
    routeMocks.prisma.matchedLot.findMany.mockResolvedValue([
      {
        id: "lot-1",
        accountId: "acct-1",
        quantity: money("10"),
        realizedPnl: money("150"),
        createdAt: new Date("2026-01-07T00:00:00.000Z"),
        excursion: {
          id: "exc-1",
          mfe: money("250"),
          mae: money("-75"),
          mfePct: money("0.250000"),
          maePct: money("-0.075000"),
          mfeDate: new Date("2026-01-05T00:00:00.000Z"),
          maeDate: new Date("2026-01-06T00:00:00.000Z"),
          pricedDays: 3,
          unpricedDays: 1,
          computedAt: new Date("2026-01-08T00:00:00.000Z"),
        },
        openExecution: {
          symbol: "AAPL",
          underlyingSymbol: null,
          tradeDate: new Date("2026-01-02T00:00:00.000Z"),
          price: money("100"),
          assetClass: "EQUITY",
          multiplier: null,
        },
        closeExecution: {
          tradeDate: new Date("2026-01-07T00:00:00.000Z"),
        },
        setupGroupLots: [
          {
            setupGroup: {
              id: "setup-1",
              tag: "swing",
              overrideTag: "breakout",
            },
          },
        ],
      },
    ]);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/analysis/excursions?accountIds=A1&page=1&pageSize=25"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      data: [
        {
          id: "exc-1",
          matchedLotId: "lot-1",
          accountId: "acct-1",
          symbol: "AAPL",
          underlyingSymbol: null,
          setupId: "setup-1",
          setupTag: "breakout",
          openTradeDate: "2026-01-02T00:00:00.000Z",
          closeTradeDate: "2026-01-07T00:00:00.000Z",
          quantity: "10",
          realizedPnl: "150",
          realizedReturnPct: "0.150000",
          mfe: "250",
          mae: "-75",
          mfePct: "0.250000",
          maePct: "-0.075000",
          mfeDate: "2026-01-05",
          maeDate: "2026-01-06",
          pricedDays: 3,
          unpricedDays: 1,
          computedAt: "2026-01-08T00:00:00.000Z",
        },
      ],
      meta: { total: 1, page: 1, pageSize: 25 },
    });
  });

  it("applies account, date, setup, and symbol filters", async () => {
    const { GET } = await import("./route");

    await GET(
      new Request("http://localhost/api/analysis/excursions?accountIds=A1,A2&setupId=setup-1&symbol=SPY&startDate=2026-01-01&endDate=2026-01-31"),
    );

    expect(routeMocks.prisma.matchedLot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            { excursion: { isNot: null } },
            { OR: [{ accountId: { in: ["A1", "A2"] } }, { account: { accountId: { in: ["A1", "A2"] } } }] },
            {
              setupGroupLots: {
                some: {
                  setupGroupId: "setup-1",
                },
              },
            },
            {
              openExecution: {
                tradeDate: {
                  gte: new Date("2026-01-01"),
                  lte: new Date("2026-01-31T23:59:59.999Z"),
                },
              },
            },
          ]),
        },
      }),
    );
  });
});
