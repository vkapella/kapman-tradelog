import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => {
  return {
    account: {
      findMany: vi.fn(),
    },
    positionSnapshot: {
      findFirst: vi.fn(),
    },
    positionSnapshotAccount: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
  };
});

vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: {
      account: routeMocks.account,
      positionSnapshot: routeMocks.positionSnapshot,
      positionSnapshotAccount: routeMocks.positionSnapshotAccount,
    },
  };
});

describe("GET /api/overview/reconciliation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    routeMocks.account.findMany.mockResolvedValue([{ id: "acct-1" }, { id: "acct-2" }]);
    routeMocks.positionSnapshotAccount.groupBy.mockResolvedValue([]);
    routeMocks.positionSnapshotAccount.findMany.mockResolvedValue([]);
  });

  it("falls back to the legacy exact-scope snapshot when no run has child rows", async () => {
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
      source: "legacy_exact_scope",
    });
    expect(routeMocks.positionSnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountIds: JSON.stringify(["acct-1", "acct-2"]), status: "COMPLETE" },
      }),
    );
  });

  it("composes reconciliation from ONE covering run's child rows and flags stale-revision accounts", async () => {
    const decimal = (value: string) => ({ toString: () => value });
    // Requesting only acct-1; the newest COMPLETE covering run is a 2-account
    // run -- its acct-1 child alone serves the narrower scope.
    routeMocks.positionSnapshotAccount.groupBy.mockResolvedValue([
      { runId: "run-wide", _count: { accountId: 1 } },
    ]);
    routeMocks.positionSnapshot.findFirst.mockResolvedValue({
      id: "run-wide",
      snapshotAt: new Date("2026-08-28T15:00:00.000Z"),
    });
    routeMocks.positionSnapshotAccount.findMany.mockResolvedValue([
      {
        accountId: "acct-1",
        inputsRevision: BigInt(41),
        startingCapital: decimal("100000"),
        reconstructedNlv: decimal("120000"),
        totalGain: decimal("20000"),
        unrealizedPnl: decimal("5000"),
        cashAdjustments: decimal("2500"),
        realizedPnl: decimal("10000"),
        manualAdjustments: decimal("1500"),
        unexplainedDelta: decimal("1000"),
      },
    ]);
    routeMocks.account.findMany
      // resolvePositionSnapshotAccountIds scope resolution
      .mockResolvedValueOnce([{ id: "acct-1" }])
      // currency check: live revision is ahead of the observed 41
      .mockResolvedValueOnce([{ id: "acct-1", dataRevision: BigInt(42) }]);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/overview/reconciliation?accountIds=acct-1"));
    const payload = (await response.json()) as { data: Record<string, unknown> };

    expect(payload.data).toEqual({
      startingCapital: "100000.00",
      startingCapitalConfigured: true,
      currentNlv: "120000.00",
      totalGain: "20000.00",
      unrealizedPnl: "5000.00",
      cashAdjustments: "2500.00",
      realizedPnl: "10000.00",
      manualAdjustments: "1500.00",
      unexplainedDelta: "1000.00",
      runId: "run-wide",
      snapshotAt: "2026-08-28T15:00:00.000Z",
      staleAccountIds: ["acct-1"],
      source: "run_accounts",
    });
    expect(routeMocks.positionSnapshotAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { runId: "run-wide", accountId: { in: ["acct-1"] } } }),
    );
  });
});
