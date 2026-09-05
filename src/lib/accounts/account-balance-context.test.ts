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
  accountValueSnapshot: {
    findMany: vi.fn(),
  },
  execution: {
    groupBy: vi.fn(),
  },
  cashEvent: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    account: accountBalanceMocks.account,
    import: accountBalanceMocks.import,
    dailyAccountSnapshot: accountBalanceMocks.dailyAccountSnapshot,
    accountValueSnapshot: accountBalanceMocks.accountValueSnapshot,
    execution: accountBalanceMocks.execution,
    cashEvent: accountBalanceMocks.cashEvent,
  },
}));

describe("loadAccountBalanceContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accountBalanceMocks.accountValueSnapshot.findMany.mockResolvedValue([]);
  });

  it("uses snapshot total cash when available", async () => {
    accountBalanceMocks.account.findMany.mockResolvedValue([
      { id: "acct-internal-1", accountId: "acct-external-1", broker: "SCHWAB_THINKORSWIM" },
    ]);
    accountBalanceMocks.import.findMany.mockResolvedValue([]);
    accountBalanceMocks.dailyAccountSnapshot.findMany.mockResolvedValue([
      {
        accountId: "acct-internal-1",
        snapshotDate: new Date("2026-04-13T00:00:00.000Z"),
        balance: { toString: () => "12345.67" },
        totalCash: { toString: () => "2345.67" },
        brokerNetLiquidationValue: null,
        brokerNlvAsOf: null,
        id: "snapshot-1",
      },
    ]);
    accountBalanceMocks.execution.groupBy.mockResolvedValue([]);
    accountBalanceMocks.cashEvent.findMany.mockResolvedValue([]);

    const { loadAccountBalanceContext } = await import("./account-balance-context");
    const result = await loadAccountBalanceContext(["acct-internal-1"]);

    expect(result).toEqual([
      {
        accountExternalId: "acct-external-1",
        brokerNetLiquidationValue: null,
        brokerNlvAsOf: null,
        cash: 2345.67,
        cashAsOf: "2026-04-13T00:00:00.000Z",
        cashSource: "snapshot",
      },
    ]);
  });

  it("adds back internal money-market sweep movement when snapshots are unavailable", async () => {
    accountBalanceMocks.account.findMany.mockResolvedValue([
      { id: "acct-internal-1", accountId: "X19467537", broker: "FIDELITY" },
    ]);
    accountBalanceMocks.import.findMany.mockResolvedValue([{ id: "import-latest", accountId: "acct-internal-1" }]);
    accountBalanceMocks.dailyAccountSnapshot.findMany.mockResolvedValue([]);
    accountBalanceMocks.execution.groupBy.mockResolvedValue([
      {
        accountId: "acct-internal-1",
        _sum: { netAmount: { toString: () => "-2000" } },
        _max: { tradeDate: new Date("2026-04-10T00:00:00.000Z") },
      },
    ]);
    // Same rows the value engine classifies (#363): the transfer counts, the
    // sweep into the money-market fund does not.
    accountBalanceMocks.cashEvent.findMany.mockResolvedValue([
      { accountId: "acct-internal-1", eventDate: new Date("2026-04-09T00:00:00.000Z"), rowType: "TRANSFER_IN", amount: { toString: () => "8000" }, description: null },
      { accountId: "acct-internal-1", eventDate: new Date("2026-04-10T00:00:00.000Z"), rowType: "MONEY_MARKET_BUY", amount: { toString: () => "-4000" }, description: null },
    ]);

    const { loadAccountBalanceContext } = await import("./account-balance-context");
    const result = await loadAccountBalanceContext(["acct-internal-1"]);

    expect(result).toEqual([
      {
        accountExternalId: "X19467537",
        brokerNetLiquidationValue: null,
        brokerNlvAsOf: null,
        cash: 6000,
        cashAsOf: "2026-04-10T00:00:00.000Z",
        cashSource: "heuristic_fallback",
      },
    ]);
  });

  // #346: Fidelity's DailyAccountSnapshot.totalCash is an importer reconstruction
  // that misses MMF-swept deposits; the value engine's cashValue is the
  // reconciled ledger and must win for that broker.
  it("prefers the value-engine cash over the daily snapshot for Fidelity", async () => {
    accountBalanceMocks.account.findMany.mockResolvedValue([
      { id: "acct-internal-1", accountId: "X19467537", broker: "FIDELITY" },
    ]);
    accountBalanceMocks.dailyAccountSnapshot.findMany.mockResolvedValue([
      {
        accountId: "acct-internal-1",
        snapshotDate: new Date("2026-08-25T00:00:00.000Z"),
        balance: { toString: () => "24028.41" },
        totalCash: { toString: () => "24028.41" },
        brokerNetLiquidationValue: null,
        id: "snapshot-1",
      },
    ]);
    accountBalanceMocks.accountValueSnapshot.findMany.mockResolvedValue([
      {
        accountId: "acct-internal-1",
        snapshotDate: new Date("2026-08-28T00:00:00.000Z"),
        cashValue: { toString: () => "125652.12" },
      },
      {
        accountId: "acct-internal-1",
        snapshotDate: new Date("2026-08-27T00:00:00.000Z"),
        cashValue: { toString: () => "125600.00" },
      },
    ]);
    accountBalanceMocks.execution.groupBy.mockResolvedValue([]);
    accountBalanceMocks.cashEvent.findMany.mockResolvedValue([]);

    const { loadAccountBalanceContext } = await import("./account-balance-context");
    const result = await loadAccountBalanceContext(["acct-internal-1"]);

    expect(result).toEqual([
      {
        accountExternalId: "X19467537",
        brokerNetLiquidationValue: null,
        brokerNlvAsOf: null,
        cash: 125652.12,
        cashAsOf: "2026-08-28T00:00:00.000Z",
        cashSource: "value_snapshot",
      },
    ]);
  });

  it("keeps the broker-reported daily snapshot cash for thinkorswim even when a value snapshot exists", async () => {
    accountBalanceMocks.account.findMany.mockResolvedValue([
      { id: "acct-internal-2", accountId: "18528700SCHW", broker: "SCHWAB_THINKORSWIM" },
    ]);
    accountBalanceMocks.dailyAccountSnapshot.findMany.mockResolvedValue([
      {
        accountId: "acct-internal-2",
        snapshotDate: new Date("2026-08-28T00:00:00.000Z"),
        balance: { toString: () => "200040.00" },
        totalCash: { toString: () => "200040.00" },
        brokerNetLiquidationValue: { toString: () => "200040.00" },
        id: "snapshot-2",
      },
    ]);
    // The #348 shape: the ledger reconstruction is wrong for this account.
    accountBalanceMocks.accountValueSnapshot.findMany.mockResolvedValue([
      {
        accountId: "acct-internal-2",
        snapshotDate: new Date("2026-08-28T00:00:00.000Z"),
        cashValue: { toString: () => "-99960.00" },
      },
    ]);
    accountBalanceMocks.execution.groupBy.mockResolvedValue([]);
    accountBalanceMocks.cashEvent.findMany.mockResolvedValue([]);

    const { loadAccountBalanceContext } = await import("./account-balance-context");
    const result = await loadAccountBalanceContext(["acct-internal-2"]);

    expect(result).toEqual([
      {
        accountExternalId: "18528700SCHW",
        brokerNetLiquidationValue: 200040,
        brokerNlvAsOf: "2026-08-28T00:00:00.000Z",
        cash: 200040,
        cashAsOf: "2026-08-28T00:00:00.000Z",
        cashSource: "snapshot",
      },
    ]);
  });

  it("falls back to the daily snapshot for Fidelity when no value snapshot exists yet", async () => {
    accountBalanceMocks.account.findMany.mockResolvedValue([
      { id: "acct-internal-1", accountId: "X19467537", broker: "FIDELITY" },
    ]);
    accountBalanceMocks.dailyAccountSnapshot.findMany.mockResolvedValue([
      {
        accountId: "acct-internal-1",
        snapshotDate: new Date("2026-08-25T00:00:00.000Z"),
        balance: { toString: () => "24028.41" },
        totalCash: { toString: () => "24028.41" },
        brokerNetLiquidationValue: null,
        id: "snapshot-1",
      },
    ]);
    accountBalanceMocks.accountValueSnapshot.findMany.mockResolvedValue([]);
    accountBalanceMocks.execution.groupBy.mockResolvedValue([]);
    accountBalanceMocks.cashEvent.findMany.mockResolvedValue([]);

    const { loadAccountBalanceContext } = await import("./account-balance-context");
    const result = await loadAccountBalanceContext(["acct-internal-1"]);

    expect(result[0]).toMatchObject({ cash: 24028.41, cashSource: "snapshot" });
  });
});
