import { beforeEach, describe, expect, it, vi } from "vitest";

const setupsRouteMocks = vi.hoisted(() => {
  return {
    setupGroup: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  };
});

vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: {
      setupGroup: setupsRouteMocks.setupGroup,
    },
  };
});

describe("GET /api/setups", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("applies global accountIds scope to setup queries", async () => {
    setupsRouteMocks.setupGroup.count.mockResolvedValueOnce(0);
    setupsRouteMocks.setupGroup.findMany.mockResolvedValueOnce([]);
    const { GET } = await import("./route");

    await GET(new Request("http://localhost/api/setups?page=1&pageSize=25&accountIds=acct-1,acct-2"));

    const countArgs = setupsRouteMocks.setupGroup.count.mock.calls[0]?.[0] as { where: { AND: Array<Record<string, unknown>> } };
    expect(countArgs.where.AND).toEqual(
      expect.arrayContaining([
        {
          OR: [{ accountId: { in: ["acct-1", "acct-2"] } }, { account: { accountId: { in: ["acct-1", "acct-2"] } } }],
        },
      ]),
    );
  });

  it("omits account scope when accountIds is absent", async () => {
    setupsRouteMocks.setupGroup.count.mockResolvedValueOnce(0);
    setupsRouteMocks.setupGroup.findMany.mockResolvedValueOnce([]);
    const { GET } = await import("./route");

    await GET(new Request("http://localhost/api/setups?page=1&pageSize=25"));

    const countArgs = setupsRouteMocks.setupGroup.count.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(countArgs.where).toEqual({});
  });

  it("filters date ranges by linked matched lot open trade dates and excludes no-lot setups", async () => {
    setupsRouteMocks.setupGroup.count.mockResolvedValueOnce(0);
    setupsRouteMocks.setupGroup.findMany.mockResolvedValueOnce([]);
    const { GET } = await import("./route");

    await GET(new Request("http://localhost/api/setups?startDate=2025-09-02&endDate=2025-09-30"));

    const countArgs = setupsRouteMocks.setupGroup.count.mock.calls[0]?.[0] as { where: { AND: Array<Record<string, unknown>> } };
    expect(countArgs.where.AND).toEqual([
      {
        lots: {
          some: {
            matchedLot: {
              openExecution: {
                tradeDate: {
                  gte: new Date("2025-09-02"),
                  lte: new Date("2025-09-30T23:59:59.999Z"),
                },
              },
            },
          },
          every: {
            matchedLot: {
              openExecution: {
                tradeDate: {
                  gte: new Date("2025-09-02"),
                  lte: new Date("2025-09-30T23:59:59.999Z"),
                },
              },
            },
          },
        },
      },
    ]);
  });
});
