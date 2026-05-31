import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  prisma: {
    account: {
      findMany: vi.fn(),
    },
    accountValueSnapshot: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: routeMocks.prisma,
}));

function money(value: string): { toString(): string } {
  return { toString: () => value };
}

describe("GET /api/analysis/account-value-series", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    routeMocks.prisma.account.findMany.mockResolvedValue([
      { id: "acct-internal-1" },
      { id: "acct-internal-2" },
    ]);
    routeMocks.prisma.accountValueSnapshot.findMany.mockResolvedValue([]);
  });

  it("aggregates overlapping account snapshots by day", async () => {
    routeMocks.prisma.accountValueSnapshot.findMany.mockResolvedValue([
      {
        id: "s1",
        accountId: "acct-internal-1",
        snapshotDate: new Date("2026-03-10T00:00:00.000Z"),
        cashValue: money("100.00"),
        equityValue: money("200.00"),
        optionValue: money("50.00"),
        totalValue: money("350.00"),
        brokerNlv: money("351.00"),
        unpricedPositionCount: 1,
      },
      {
        id: "s2",
        accountId: "acct-internal-2",
        snapshotDate: new Date("2026-03-10T00:00:00.000Z"),
        cashValue: money("10.00"),
        equityValue: money("20.00"),
        optionValue: money("5.00"),
        totalValue: money("35.00"),
        brokerNlv: money("34.00"),
        unpricedPositionCount: 2,
      },
      {
        id: "s3",
        accountId: "acct-internal-1",
        snapshotDate: new Date("2026-03-11T00:00:00.000Z"),
        cashValue: money("101.00"),
        equityValue: money("201.00"),
        optionValue: money("51.00"),
        totalValue: money("353.00"),
        brokerNlv: money("353.00"),
        unpricedPositionCount: 0,
      },
      {
        id: "s4",
        accountId: "acct-internal-2",
        snapshotDate: new Date("2026-03-11T00:00:00.000Z"),
        cashValue: money("11.00"),
        equityValue: money("21.00"),
        optionValue: money("6.00"),
        totalValue: money("38.00"),
        brokerNlv: money("38.00"),
        unpricedPositionCount: 0,
      },
    ]);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/analysis/account-value-series?accountIds=A1,A2"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.points).toEqual([
      {
        date: "2026-03-10",
        cash: "110.00",
        stockEtf: "220.00",
        options: "55.00",
        total: "385.00",
        brokerNlv: "385.00",
        reconcileDelta: "0.00",
        unpricedPositionCount: 3,
      },
      {
        date: "2026-03-11",
        cash: "112.00",
        stockEtf: "222.00",
        options: "57.00",
        total: "391.00",
        brokerNlv: "391.00",
        reconcileDelta: "0.00",
        unpricedPositionCount: 0,
      },
    ]);
    expect(payload.data.meta).toMatchObject({
      accountCount: 2,
      daysWithUnpriced: 1,
      firstTotal: "385.00",
      lastTotal: "391.00",
    });
  });

  it("nulls brokerNlv and reconcileDelta when any in-scope account is missing brokerNlv for a day", async () => {
    routeMocks.prisma.accountValueSnapshot.findMany.mockResolvedValue([
      {
        id: "s1",
        accountId: "acct-internal-1",
        snapshotDate: new Date("2026-03-10T00:00:00.000Z"),
        cashValue: money("100.00"),
        equityValue: money("200.00"),
        optionValue: money("50.00"),
        totalValue: money("350.00"),
        brokerNlv: null,
        unpricedPositionCount: 0,
      },
      {
        id: "s2",
        accountId: "acct-internal-2",
        snapshotDate: new Date("2026-03-10T00:00:00.000Z"),
        cashValue: money("10.00"),
        equityValue: money("20.00"),
        optionValue: money("5.00"),
        totalValue: money("35.00"),
        brokerNlv: money("34.00"),
        unpricedPositionCount: 0,
      },
    ]);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/analysis/account-value-series?accountIds=A1,A2"));
    const payload = await response.json();

    expect(payload.data.points).toEqual([
      expect.objectContaining({
        date: "2026-03-10",
        total: "385.00",
        brokerNlv: null,
        reconcileDelta: null,
      }),
    ]);
  });

  it("applies date-range filtering bounds", async () => {
    const { GET } = await import("./route");

    await GET(
      new Request("http://localhost/api/analysis/account-value-series?accountIds=A1,A2&startDate=2026-01-02&endDate=2026-01-05"),
    );

    expect(routeMocks.prisma.accountValueSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          accountId: { in: ["acct-internal-1", "acct-internal-2"] },
          snapshotDate: {
            gte: new Date("2026-01-02"),
            lte: new Date("2026-01-05T23:59:59.999Z"),
          },
        }),
      }),
    );
  });

  it("returns empty points with valid meta for empty ranges", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/analysis/account-value-series?accountIds=A1,A2&startDate=2026-04-01&endDate=2026-04-10"),
    );
    const payload = await response.json();

    expect(payload.data).toEqual({
      points: [],
      meta: {
        accountCount: 2,
        startDate: "2026-04-01",
        endDate: "2026-04-10",
        daysWithUnpriced: 0,
        firstTotal: null,
        lastTotal: null,
      },
    });
  });

  it("returns empty points and zero account count when no accounts resolve", async () => {
    routeMocks.prisma.account.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/analysis/account-value-series?accountIds=UNKNOWN"));
    const payload = await response.json();

    expect(routeMocks.prisma.accountValueSnapshot.findMany).not.toHaveBeenCalled();
    expect(payload.data).toEqual({
      points: [],
      meta: {
        accountCount: 0,
        startDate: null,
        endDate: null,
        daysWithUnpriced: 0,
        firstTotal: null,
        lastTotal: null,
      },
    });
  });
});
