import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  prisma: {
    account: {
      findMany: vi.fn(),
    },
    dailyAccountSnapshot: {
      findMany: vi.fn(),
    },
    cashEvent: {
      aggregate: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: routeMocks.prisma,
}));

function money(value: string): { toString(): string } {
  return { toString: () => value };
}

describe("GET /api/overview/period-return", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    routeMocks.prisma.account.findMany.mockResolvedValue([{ id: "acct-internal-1" }]);
    routeMocks.prisma.dailyAccountSnapshot.findMany
      .mockResolvedValueOnce([
        {
          accountId: "acct-internal-1",
          balance: money("10000.00"),
          brokerNetLiquidationValue: money("10000.00"),
        },
      ])
      .mockResolvedValueOnce([
        {
          accountId: "acct-internal-1",
          balance: money("16000.00"),
          brokerNetLiquidationValue: money("16000.00"),
        },
      ]);
    routeMocks.prisma.cashEvent.aggregate.mockResolvedValue({ _sum: { amount: money("2000.00") } });
  });

  it("uses only external capital flow row types for net flows", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/overview/period-return?accountIds=X19467537&startDate=2025-09-02&endDate=2025-09-30"),
    );
    const payload = await response.json();

    expect(routeMocks.prisma.account.findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ id: { in: ["X19467537"] } }, { accountId: { in: ["X19467537"] } }],
      },
      select: { id: true },
    });
    expect(routeMocks.prisma.cashEvent.aggregate).toHaveBeenCalledWith({
      where: {
        accountId: { in: ["acct-internal-1"] },
        rowType: { in: ["TRANSFER_IN", "ACAT_RECEIVE", "ACAT_CREDIT"] },
        eventDate: {
          gte: new Date("2025-09-02"),
          lte: new Date("2025-09-30T23:59:59.999Z"),
        },
      },
      _sum: { amount: true },
    });
    expect(payload.data.netFlows).toBe(2000);
    expect(payload.data.profit).toBe(4000);
  });
});
