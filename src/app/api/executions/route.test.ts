import { beforeEach, describe, expect, it, vi } from "vitest";

const executionRouteMocks = vi.hoisted(() => {
  return {
    execution: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  };
});

vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: {
      execution: executionRouteMocks.execution,
    },
  };
});

describe("GET /api/executions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("applies global accountIds scope to execution queries", async () => {
    executionRouteMocks.execution.count.mockResolvedValueOnce(0);
    executionRouteMocks.execution.findMany.mockResolvedValueOnce([]);
    const { GET } = await import("./route");

    await GET(new Request("http://localhost/api/executions?page=1&pageSize=25&accountIds=acct-internal,acct-external"));

    const countArgs = executionRouteMocks.execution.count.mock.calls[0]?.[0] as { where: { AND: Array<Record<string, unknown>> } };
    expect(countArgs.where.AND).toEqual(
      expect.arrayContaining([
        {
          OR: [
            { accountId: { in: ["acct-internal", "acct-external"] } },
            { account: { accountId: { in: ["acct-internal", "acct-external"] } } },
          ],
        },
      ]),
    );
  });

  it("omits account scope when accountIds is not provided", async () => {
    executionRouteMocks.execution.count.mockResolvedValueOnce(0);
    executionRouteMocks.execution.findMany.mockResolvedValueOnce([]);
    const { GET } = await import("./route");

    await GET(new Request("http://localhost/api/executions?page=1&pageSize=25"));

    const countArgs = executionRouteMocks.execution.count.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(countArgs.where).toEqual({});
  });
});
