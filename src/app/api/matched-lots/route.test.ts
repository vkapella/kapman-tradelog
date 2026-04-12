import { beforeEach, describe, expect, it, vi } from "vitest";

const matchedLotsRouteMocks = vi.hoisted(() => {
  return {
    matchedLot: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  };
});

vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: {
      matchedLot: matchedLotsRouteMocks.matchedLot,
    },
  };
});

describe("GET /api/matched-lots", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("applies global accountIds scope to matched lot queries", async () => {
    matchedLotsRouteMocks.matchedLot.count.mockResolvedValueOnce(0);
    matchedLotsRouteMocks.matchedLot.findMany.mockResolvedValueOnce([]);
    const { GET } = await import("./route");

    await GET(new Request("http://localhost/api/matched-lots?page=1&pageSize=25&accountIds=acct-1,acct-2"));

    const countArgs = matchedLotsRouteMocks.matchedLot.count.mock.calls[0]?.[0] as { where: { AND: Array<Record<string, unknown>> } };
    expect(countArgs.where.AND).toEqual(
      expect.arrayContaining([
        {
          OR: [{ accountId: { in: ["acct-1", "acct-2"] } }, { account: { accountId: { in: ["acct-1", "acct-2"] } } }],
        },
      ]),
    );
  });

  it("omits account scope when accountIds is absent", async () => {
    matchedLotsRouteMocks.matchedLot.count.mockResolvedValueOnce(0);
    matchedLotsRouteMocks.matchedLot.findMany.mockResolvedValueOnce([]);
    const { GET } = await import("./route");

    await GET(new Request("http://localhost/api/matched-lots?page=1&pageSize=25"));

    const countArgs = matchedLotsRouteMocks.matchedLot.count.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(countArgs.where).toEqual({});
  });
});
