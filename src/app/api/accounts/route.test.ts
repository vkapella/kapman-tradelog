import { beforeEach, describe, expect, it, vi } from "vitest";

const accountsRouteMocks = vi.hoisted(() => {
  return {
    account: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };
});

vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: {
      account: accountsRouteMocks.account,
    },
  };
});

describe("GET /api/accounts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.STARTING_CAPITAL;
  });

  it("seeds defaults for accounts with null metadata before returning rows", async () => {
    accountsRouteMocks.account.findMany
      .mockResolvedValueOnce([
        {
          id: "acct-1",
          label: "IRA",
          broker: "SCHWAB_THINKORSWIM",
          displayLabel: null,
          brokerName: null,
          startingCapital: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "acct-1",
          accountId: "D-68011053",
          displayLabel: "IRA",
          brokerName: "Schwab",
          startingCapital: { toString: () => "100000" },
          createdAt: new Date("2026-04-12T00:00:00.000Z"),
        },
      ]);

    const { GET } = await import("./route");
    const response = await GET();
    const payload = (await response.json()) as { data: Array<{ startingCapital: string | null }> };

    expect(accountsRouteMocks.account.update).toHaveBeenCalledWith({
      where: { id: "acct-1" },
      data: expect.objectContaining({
        displayLabel: "IRA",
        brokerName: "Schwab",
        startingCapital: expect.anything(),
      }),
    });
    expect(payload.data[0]?.startingCapital).toBe("100000");
  });

  it("emits the deprecation warning when STARTING_CAPITAL is set", async () => {
    process.env.STARTING_CAPITAL = "50000";
    accountsRouteMocks.account.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { GET } = await import("./route");
    await GET();

    expect(warnSpy).toHaveBeenCalledWith(
      "STARTING_CAPITAL env var is deprecated. Use the Accounts page to set per-account starting capital.",
    );
  });
});
