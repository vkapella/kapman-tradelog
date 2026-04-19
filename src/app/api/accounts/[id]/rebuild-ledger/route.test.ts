import { beforeEach, describe, expect, it, vi } from "vitest";

const rebuildLedgerRouteMocks = vi.hoisted(() => {
  const tx = {};

  return {
    prisma: {
      account: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(),
    },
    tx,
    rebuildAccountLedger: vi.fn(),
    rebuildAccountSetups: vi.fn(),
  };
});

vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: rebuildLedgerRouteMocks.prisma,
  };
});

vi.mock("@/lib/ledger/rebuild-account-ledger", () => {
  return {
    rebuildAccountLedger: rebuildLedgerRouteMocks.rebuildAccountLedger,
  };
});

vi.mock("@/lib/analytics/rebuild-account-setups", () => {
  return {
    rebuildAccountSetups: rebuildLedgerRouteMocks.rebuildAccountSetups,
  };
});

describe("POST /api/accounts/[id]/rebuild-ledger", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    rebuildLedgerRouteMocks.prisma.$transaction.mockImplementation(async (callback: (tx: typeof rebuildLedgerRouteMocks.tx) => unknown) => {
      return callback(rebuildLedgerRouteMocks.tx);
    });
  });

  it("rebuilds one account and returns the summary payload", async () => {
    rebuildLedgerRouteMocks.prisma.account.findFirst.mockResolvedValueOnce({
      id: "acct-internal-1",
      accountId: "D-68011053",
    });
    rebuildLedgerRouteMocks.rebuildAccountLedger.mockResolvedValueOnce({
      matchedLotsPersisted: 263,
      syntheticExecutionsPersisted: 2,
      warningsCleared: 2,
      warnings: [],
    });
    rebuildLedgerRouteMocks.rebuildAccountSetups.mockResolvedValueOnce({
      setupGroupsPersisted: 17,
      uncategorizedCount: 1,
    });

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/accounts/acct-internal-1/rebuild-ledger", { method: "POST" }), {
      params: { id: "acct-internal-1" },
    });
    const payload = (await response.json()) as {
      data: {
        matchedLotsPersisted: number;
        syntheticExecutionsPersisted: number;
        warningsCleared: number;
        setupGroupsPersisted: number;
      };
    };

    expect(rebuildLedgerRouteMocks.prisma.account.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ id: "acct-internal-1" }, { accountId: "acct-internal-1" }],
      },
      select: {
        id: true,
        accountId: true,
      },
    });
    expect(rebuildLedgerRouteMocks.rebuildAccountLedger).toHaveBeenCalledWith(
      rebuildLedgerRouteMocks.tx,
      "acct-internal-1",
      expect.any(Date),
    );
    expect(rebuildLedgerRouteMocks.rebuildAccountSetups).toHaveBeenCalledWith(rebuildLedgerRouteMocks.tx, "acct-internal-1");
    expect(payload.data).toEqual({
      matchedLotsPersisted: 263,
      syntheticExecutionsPersisted: 2,
      warningsCleared: 2,
      setupGroupsPersisted: 17,
    });
  });

  it("returns 404 when the account is missing", async () => {
    rebuildLedgerRouteMocks.prisma.account.findFirst.mockResolvedValueOnce(null);

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/accounts/missing/rebuild-ledger", { method: "POST" }), {
      params: { id: "missing" },
    });

    expect(response.status).toBe(404);
    expect(rebuildLedgerRouteMocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
