import { beforeEach, describe, expect, it, vi } from "vitest";

const startingCapitalRouteMocks = vi.hoisted(() => {
  return {
    account: {
      findMany: vi.fn(),
    },
  };
});

vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: {
      account: startingCapitalRouteMocks.account,
    },
  };
});

describe("GET /api/accounts/starting-capital", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns combined and per-account starting capital", async () => {
    startingCapitalRouteMocks.account.findMany.mockResolvedValueOnce([
      { accountId: "D-68011053", startingCapital: { toString: () => "100000" } },
      { accountId: "D-68011054", startingCapital: { toString: () => "100000" } },
      { accountId: "X19467537", startingCapital: { toString: () => "0" } },
    ]);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/accounts/starting-capital"));
    const payload = (await response.json()) as { data: { total: number; byAccount: Record<string, number> } };

    expect(payload.data).toEqual({
      total: 200000,
      byAccount: {
        "D-68011053": 100000,
        "D-68011054": 100000,
        X19467537: 0,
      },
    });
  });
});
