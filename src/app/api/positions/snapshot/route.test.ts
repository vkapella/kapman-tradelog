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
      createdAt: new Date("2026-04-13T04:00:01.000Z"),
      status: "COMPLETE",
      errorMessage: null,
      accountIds: JSON.stringify(["acct-internal-1"]),
      accountValuesJson: JSON.stringify([{ accountId: "acct-internal-1", reconstructedNlv: "10050.00" }]),
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
        createdAt: "2026-04-13T04:00:01.000Z",
        scopeAccountIds: ["acct-internal-1"],
        status: "COMPLETE",
        positions: [{ instrumentKey: "SPY", mark: 510 }],
        accountValues: [{ accountId: "acct-internal-1", reconstructedNlv: "10050.00" }],
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
        currentDataRevisions: { "acct-internal-1": "0", "acct-internal-2": "0" },
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
        where: { accountIds: JSON.stringify(["acct-internal-1", "acct-internal-2"]), status: "COMPLETE" },
      }),
    );
  });

  it("ignores the caller's date range so a snapshot past the local day's UTC end is still returned", async () => {
    routeMocks.positionSnapshot.findFirst.mockResolvedValue({
      id: "snapshot-after-utc-midnight",
      // 8:58 PM on 2026-08-27 at UTC-4 lands on the next UTC day. Scoping by the
      // caller's local endDate used to bound this out and serve a stale snapshot.
      snapshotAt: new Date("2026-08-28T00:58:34.860Z"),
      createdAt: new Date("2026-08-28T00:58:34.860Z"),
      status: "COMPLETE",
      errorMessage: null,
      accountIds: JSON.stringify(["acct-internal-1", "acct-internal-2"]),
      positionsJson: "[]",
      accountValuesJson: JSON.stringify([{ accountId: "acct-internal-1", reconstructedNlv: "199960.00" }]),
      unrealizedPnl: null,
      realizedPnl: null,
      cashAdjustments: null,
      manualAdjustments: null,
      currentNlv: { toString: () => "199960" },
      startingCapital: null,
      totalGain: null,
      unexplainedDelta: null,
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "http://localhost/api/positions/snapshot?accountIds=acct-internal-1,acct-internal-2&startDate=2025-09-02&endDate=2026-08-27",
      ),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { data: { id: string; currentNlv: string } };
    expect(payload.data.id).toBe("snapshot-after-utc-midnight");
    expect(payload.data.currentNlv).toBe("199960.00");
    expect(routeMocks.positionSnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountIds: JSON.stringify(["acct-internal-1", "acct-internal-2"]), status: "COMPLETE" },
      }),
    );
  });

  it("returns a pending snapshot when fetched by id (passive lookups are COMPLETE-only)", async () => {
    routeMocks.positionSnapshot.findUnique.mockResolvedValue({
      id: "snapshot-pending",
      snapshotAt: new Date(Date.now() - 5_000),
      createdAt: new Date(Date.now() - 5_000),
      status: "PENDING",
      errorMessage: null,
      accountIds: "[]",
      accountValuesJson: "[]",
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
    const response = await GET(new Request("http://localhost/api/positions/snapshot?snapshotId=snapshot-pending"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        id: "snapshot-pending",
        snapshotAt: expect.any(String),
        createdAt: expect.any(String),
        scopeAccountIds: [],
        status: "PENDING",
        positions: [],
        accountValues: [],
        unrealizedPnl: "0.00",
        realizedPnl: "0.00",
        cashAdjustments: "0.00",
        manualAdjustments: "0.00",
        currentNlv: null,
        startingCapital: "0.00",
        totalGain: "0.00",
        unexplainedDelta: "0.00",
      },
      meta: {
        snapshotExists: true,
        snapshotAge: expect.any(Number),
        currentDataRevisions: {},
      },
    });
    expect(routeMocks.positionSnapshot.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "snapshot-pending" } }));
  });
});
