import { beforeEach, describe, expect, it, vi } from "vitest";

const diagnosticsRouteMocks = vi.hoisted(() => {
  return {
    import: {
      findMany: vi.fn(),
    },
    execution: {
      findMany: vi.fn(),
    },
    matchedLot: {
      findMany: vi.fn(),
    },
  };
});

vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: {
      import: diagnosticsRouteMocks.import,
      execution: diagnosticsRouteMocks.execution,
      matchedLot: diagnosticsRouteMocks.matchedLot,
    },
  };
});

describe("GET /api/diagnostics", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("keeps same-instrument warnings scoped by account when building case refs", async () => {
    diagnosticsRouteMocks.import.findMany.mockResolvedValueOnce([
      {
        accountId: "account-a",
        parsedRows: 10,
        skippedRows: 0,
        warnings: [{ code: "UNMATCHED_CLOSE_QUANTITY", message: "Unmatched close quantity 1 for instrument SPY|CALL|500|2026-01-16." }],
      },
      {
        accountId: "account-b",
        parsedRows: 8,
        skippedRows: 0,
        warnings: [{ code: "UNMATCHED_CLOSE_QUANTITY", message: "Unmatched close quantity 1 for instrument SPY|CALL|500|2026-01-16." }],
      },
    ]);
    diagnosticsRouteMocks.execution.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "close-a",
          accountId: "account-a",
          symbol: "SPY",
          instrumentKey: "SPY|CALL|500|2026-01-16",
          eventType: "TRADE",
          tradeDate: new Date("2026-01-16T00:00:00.000Z"),
          quantity: 1,
          side: "SELL",
        },
        {
          id: "close-b",
          accountId: "account-b",
          symbol: "SPY",
          instrumentKey: "SPY|CALL|500|2026-01-16",
          eventType: "TRADE",
          tradeDate: new Date("2026-01-16T00:00:00.000Z"),
          quantity: 1,
          side: "SELL",
        },
      ]);
    diagnosticsRouteMocks.matchedLot.findMany.mockResolvedValueOnce([]);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/diagnostics"));
    const payload = (await response.json()) as { data: { warningGroups: Array<{ caseRef: { executionId?: string } | null }> } };

    const executionIds = payload.data.warningGroups
      .map((group) => group.caseRef?.executionId)
      .filter((value): value is string => Boolean(value))
      .sort();

    expect(executionIds).toEqual(["close-a", "close-b"]);
  });

  it("applies accountIds scope to diagnostics source queries", async () => {
    diagnosticsRouteMocks.import.findMany.mockResolvedValueOnce([]);
    diagnosticsRouteMocks.execution.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    diagnosticsRouteMocks.matchedLot.findMany.mockResolvedValueOnce([]);

    const { GET } = await import("./route");
    await GET(new Request("http://localhost/api/diagnostics?accountIds=acct-1,acct-2"));

    const importsArgs = diagnosticsRouteMocks.import.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(importsArgs.where).toEqual({
      OR: [{ accountId: { in: ["acct-1", "acct-2"] } }, { account: { accountId: { in: ["acct-1", "acct-2"] } } }],
    });
  });
});
