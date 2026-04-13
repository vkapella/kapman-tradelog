import { beforeEach, describe, expect, it, vi } from "vitest";

const ttsEvidenceRouteMocks = vi.hoisted(() => {
  return {
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
      execution: ttsEvidenceRouteMocks.execution,
      matchedLot: ttsEvidenceRouteMocks.matchedLot,
    },
  };
});

describe("GET /api/tts/evidence", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("applies global accountIds scope to execution and matched lot queries", async () => {
    ttsEvidenceRouteMocks.execution.findMany.mockResolvedValueOnce([]);
    ttsEvidenceRouteMocks.matchedLot.findMany.mockResolvedValueOnce([]);
    const { GET } = await import("./route");

    await GET(new Request("http://localhost/api/tts/evidence?accountIds=acct-internal,acct-external"));

    const executionArgs = ttsEvidenceRouteMocks.execution.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    const matchedLotArgs = ttsEvidenceRouteMocks.matchedLot.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };

    expect(executionArgs.where).toEqual({
      OR: [
        { accountId: { in: ["acct-internal", "acct-external"] } },
        { account: { accountId: { in: ["acct-internal", "acct-external"] } } },
      ],
    });
    expect(matchedLotArgs.where).toEqual(executionArgs.where);
  });

  it("returns selector-scoped evidence metrics from the shared endpoint", async () => {
    ttsEvidenceRouteMocks.execution.findMany.mockResolvedValueOnce([
      {
        tradeDate: new Date("2026-01-02T00:00:00.000Z"),
        quantity: 2,
        price: 5,
      },
      {
        tradeDate: new Date("2026-01-09T00:00:00.000Z"),
        quantity: 1,
        price: 10,
      },
    ]);
    ttsEvidenceRouteMocks.matchedLot.findMany.mockResolvedValueOnce([
      {
        holdingDays: 3,
        createdAt: new Date("2026-01-10T00:00:00.000Z"),
        closeExecution: { tradeDate: new Date("2026-01-10T00:00:00.000Z") },
      },
      {
        holdingDays: 7,
        createdAt: new Date("2026-01-12T00:00:00.000Z"),
        closeExecution: { tradeDate: new Date("2026-01-12T00:00:00.000Z") },
      },
    ]);
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/tts/evidence?accountIds=acct-1"));
    const payload = (await response.json()) as {
      data: { tradesPerMonth: number; annualizedTradeCount: number; grossProceedsProxy: string; monthlySeries: Array<{ month: string }> };
    };

    expect(payload.data.tradesPerMonth).toBe(2);
    expect(payload.data.annualizedTradeCount).toBe(24);
    expect(payload.data.grossProceedsProxy).toBe("20.00");
    expect(payload.data.monthlySeries).toEqual([
      expect.objectContaining({
        month: "2026-01",
      }),
    ]);
  });
});
