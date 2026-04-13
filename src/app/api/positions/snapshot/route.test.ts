import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => {
  return {
    account: {
      findMany: vi.fn(),
    },
    positionSnapshot: {
      findUnique: vi.fn(),
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

describe("GET /api/positions/snapshot", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    routeMocks.account.findMany.mockResolvedValue([{ id: "acct-internal-1" }, { id: "acct-internal-2" }]);
  });

  it("returns the requested snapshot by id", async () => {
    routeMocks.positionSnapshot.findUnique.mockResolvedValue({
      id: "snapshot-1",
      snapshotAt: new Date("2026-04-13T04:00:00.000Z"),
      status: "COMPLETE",
      errorMessage: null,
      positionsJson: JSON.stringify([{ instrumentKey: "SPY", mark: 510 }]),
      unrealizedPnl: { toString: () => "25" },
      realizedPnl: { toString: () => "50" },
      cashAdjustments: { toString: () => "10" },
      manualAdjustments: { toString: () => "0" },
      currentNlv: { toString: () => "10050" },
      startingCapital: { toString: () => "10000" },
      totalGain: { toString: () => "50" },
      unexplainedDelta: { toString: () => "-35" },
    });

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/positions/snapshot?snapshotId=snapshot-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        id: "snapshot-1",
        snapshotAt: "2026-04-13T04:00:00.000Z",
        status: "COMPLETE",
        errorMessage: undefined,
        positions: [{ instrumentKey: "SPY", mark: 510 }],
        unrealizedPnl: "25.00",
        realizedPnl: "50.00",
        cashAdjustments: "10.00",
        manualAdjustments: "0.00",
        currentNlv: "10050.00",
        startingCapital: "10000.00",
        totalGain: "50.00",
        unexplainedDelta: "-35.00",
      },
      meta: {
        snapshotExists: true,
        snapshotAge: expect.any(Number),
      },
    });
    expect(routeMocks.positionSnapshot.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "snapshot-1" } }));
  });

  it("returns null metadata when no snapshot exists for the scope", async () => {
    routeMocks.positionSnapshot.findFirst.mockResolvedValue(null);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/positions/snapshot?accountIds=acct-internal-1,acct-internal-2"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: null,
      meta: {
        snapshotExists: false,
      },
    });
    expect(routeMocks.positionSnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountIds: JSON.stringify(["acct-internal-1", "acct-internal-2"]) },
      }),
    );
  });

  it("returns the latest pending snapshot for an exact account scope", async () => {
    routeMocks.positionSnapshot.findFirst.mockResolvedValue({
      id: "snapshot-pending",
      snapshotAt: new Date(Date.now() - 5_000),
      status: "PENDING",
      errorMessage: null,
      positionsJson: "[]",
      unrealizedPnl: null,
      realizedPnl: null,
      cashAdjustments: null,
      manualAdjustments: null,
      currentNlv: null,
      startingCapital: null,
      totalGain: null,
      unexplainedDelta: null,
    });

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/positions/snapshot?accountIds=acct-internal-2,acct-internal-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        id: "snapshot-pending",
        snapshotAt: expect.any(String),
        status: "PENDING",
        errorMessage: undefined,
        positions: [],
        unrealizedPnl: "0.00",
        realizedPnl: "0.00",
        cashAdjustments: "0.00",
        manualAdjustments: "0.00",
        currentNlv: "0.00",
        startingCapital: "0.00",
        totalGain: "0.00",
        unexplainedDelta: "0.00",
      },
      meta: {
        snapshotExists: true,
        snapshotAge: expect.any(Number),
      },
    });
    expect(routeMocks.positionSnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountIds: JSON.stringify(["acct-internal-1", "acct-internal-2"]) },
      }),
    );
  });
});
