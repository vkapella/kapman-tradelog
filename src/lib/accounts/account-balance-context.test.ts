import { beforeEach, describe, expect, it, vi } from "vitest";

const accountBalanceMocks = vi.hoisted(() => ({
  account: {
    findMany: vi.fn(),
  },
  import: {
    findMany: vi.fn(),
  },
  dailyAccountSnapshot: {
    findMany: vi.fn(),
  },
  execution: {
    groupBy: vi.fn(),
  },
  cashEvent: {
    groupBy: vi.fn(),
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    account: accountBalanceMocks.account,
    import: accountBalanceMocks.import,
    dailyAccountSnapshot: accountBalanceMocks.dailyAccountSnapshot,
    execution: accountBalanceMocks.execution,
    cashEvent: accountBalanceMocks.cashEvent,
  },
}));

describe("loadAccountBalanceContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses snapshot total cash when available", async () => {
    accountBalanceMocks.account.findMany.mockResolvedValue([{ id: "acct-internal-1", accountId: "acct-external-1" }]);
    accountBalanceMocks.import.findMany.mockResolvedValue([]);
    accountBalanceMocks.dailyAccountSnapshot.findMany.mockResolvedValue([
      {
        accountId: "acct-internal-1",
        snapshotDate: new Date("2026-04-13T00:00:00.000Z"),
        balance: { toString: () => "12345.67" },
        totalCash: { toString: () => "2345.67" },
        brokerNetLiquidationValue: null,
        id: "snapshot-1",
      },
    ]);
    accountBalanceMocks.execution.groupBy.mockResolvedValue([]);
    accountBalanceMocks.cashEvent.groupBy.mockResolvedValue([]);

    const { loadAccountBalanceContext } = await import("./account-balance-context");
    const result = await loadAccountBalanceContext(["acct-internal-1"]);

    expect(result).toEqual([
      {
        accountExternalId: "acct-external-1",
        brokerNetLiquidationValue: null,
        cash: 2345.67,
        cashAsOf: "2026-04-13T00:00:00.000Z",
        cashSource: "snapshot",
      },
    ]);
  });

  it("adds back internal money-market sweep movement when snapshots are unavailable", async () => {
    accountBalanceMocks.account.findMany.mockResolvedValue([{ id: "acct-internal-1", accountId: "X19467537" }]);
    accountBalanceMocks.import.findMany.mockResolvedValue([{ id: "import-latest", accountId: "acct-internal-1" }]);
    accountBalanceMocks.dailyAccountSnapshot.findMany.mockResolvedValue([]);
    accountBalanceMocks.execution.groupBy.mockResolvedValue([
      {
        accountId: "acct-internal-1",
        _sum: { netAmount: { toString: () => "-2000" } },
        _max: { tradeDate: new Date("2026-04-10T00:00:00.000Z") },
      },
    ]);
    accountBalanceMocks.cashEvent.groupBy
      .mockResolvedValueOnce([
        {
          accountId: "acct-internal-1",
          _sum: { amount: { toString: () => "4000" } },
          _max: { eventDate: new Date("2026-04-10T00:00:00.000Z") },
        },
      ])
      .mockResolvedValueOnce([
        {
          accountId: "acct-internal-1",
          _sum: { amount: { toString: () => "-4000" } },
        },
      ]);

    const { loadAccountBalanceContext } = await import("./account-balance-context");
    const result = await loadAccountBalanceContext(["acct-internal-1"]);

    expect(result).toEqual([
      {
        accountExternalId: "X19467537",
        brokerNetLiquidationValue: null,
        cash: 6000,
        cashAsOf: "2026-04-10T00:00:00.000Z",
        cashSource: "heuristic_fallback",
      },
    ]);
  });
});
