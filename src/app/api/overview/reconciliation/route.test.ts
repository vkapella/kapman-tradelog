import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => {
  return {
    account: {
      findMany: vi.fn(),
    },
    positionSnapshot: {
      findFirst: vi.fn(),
    },
  };
});

vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: {
      account: routeMocks.account,
      positionSnapshot: routeMocks.positionSnapshot,
    },
  };
});

describe("GET /api/overview/reconciliation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    routeMocks.account.findMany.mockResolvedValue([{ id: "acct-1" }, { id: "acct-2" }]);
  });

  it("returns reconciliation values from the latest persisted snapshot", async () => {
    routeMocks.positionSnapshot.findFirst.mockResolvedValue({
      status: "COMPLETE",
      startingCapital: { toString: () => "200000" },
      currentNlv: { toString: () => "240000" },
      totalGain: { toString: () => "40000" },
      unrealizedPnl: { toString: () => "10000" },
      cashAdjustments: { toString: () => "5000" },
      realizedPnl: { toString: () => "20000" },
      manualAdjustments: { toString: () => "3000" },
      unexplainedDelta: { toString: () => "2000" },
    });

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/overview/reconciliation"));
    const payload = (await response.json()) as { data: { startingCapital: string; totalGain: string; startingCapitalConfigured: boolean } };

    expect(payload.data).toEqual({
      startingCapital: "200000.00",
      startingCapitalConfigured: true,
      currentNlv: "240000.00",
      totalGain: "40000.00",
      unrealizedPnl: "10000.00",
      cashAdjustments: "5000.00",
      realizedPnl: "20000.00",
      manualAdjustments: "3000.00",
      unexplainedDelta: "2000.00",
    });
    expect(routeMocks.positionSnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountIds: JSON.stringify(["acct-1", "acct-2"]) },
      }),
    );
  });
});
