import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cashEvent: { count: vi.fn(), findMany: vi.fn() } }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { cashEvent: mocks.cashEvent } }));

describe("GET /api/cash-events", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.cashEvent.count.mockResolvedValue(0);
    mocks.cashEvent.findMany.mockResolvedValue([]);
  });

  it("applies accountIds and date filters and echoes the scope", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/cash-events?accountIds=acct-1,X19467537&startDate=2026-08-01&endDate=2026-08-31"));
    const payload = (await response.json()) as { meta: { scope: { accountIds: string[]; startDate: string | null; endDate: string | null } } };

    const where = mocks.cashEvent.findMany.mock.calls[0][0].where as { AND: unknown[] };
    expect(where.AND).toHaveLength(2);
    expect(JSON.stringify(where.AND[0])).toContain("acct-1");
    expect(JSON.stringify(where.AND[1])).toContain("2026-08-31T23:59:59.999Z");
    expect(payload.meta.scope).toEqual({ accountIds: ["acct-1", "X19467537"], startDate: "2026-08-01", endDate: "2026-08-31" });
  });

  it("still honours the legacy singular accountId and reports an empty scope when unfiltered", async () => {
    const { GET } = await import("./route");
    await GET(new Request("http://localhost/api/cash-events?accountId=X19467537"));
    expect(JSON.stringify(mocks.cashEvent.findMany.mock.calls[0][0].where)).toContain("X19467537");

    const response = await GET(new Request("http://localhost/api/cash-events"));
    const payload = (await response.json()) as { meta: { scope: { accountIds: string[] } } };
    expect(mocks.cashEvent.findMany.mock.calls[1][0].where).toEqual({});
    expect(payload.meta.scope.accountIds).toEqual([]);
  });
});
