import { beforeEach, describe, expect, it, vi } from "vitest";

const getEquityQuotesMock = vi.fn().mockResolvedValue({});
const getOptionQuoteMock = vi.fn().mockResolvedValue(null);
const getOptionQuotesMock = vi.fn();

const reconciliationRouteMocks = vi.hoisted(() => {
  return {
    execution: {
      findMany: vi.fn(),
    },
    matchedLot: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    manualAdjustment: {
      findMany: vi.fn(),
    },
    dailyAccountSnapshot: {
      findMany: vi.fn(),
    },
    cashEvent: {
      aggregate: vi.fn(),
    },
    account: {
      findMany: vi.fn(),
    },
  };
});

vi.mock("node:fs/promises", () => {
  return {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(new Error("missing cache")),
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: {
      execution: reconciliationRouteMocks.execution,
      matchedLot: reconciliationRouteMocks.matchedLot,
      manualAdjustment: reconciliationRouteMocks.manualAdjustment,
      dailyAccountSnapshot: reconciliationRouteMocks.dailyAccountSnapshot,
      cashEvent: reconciliationRouteMocks.cashEvent,
      account: reconciliationRouteMocks.account,
    },
  };
});

vi.mock("@/lib/mcp/market-data", () => {
  return {
    getEquityQuotes: getEquityQuotesMock,
    getOptionQuote: getOptionQuoteMock,
    getOptionQuotes: getOptionQuotesMock,
  };
});

describe("GET /api/overview/reconciliation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.STARTING_CAPITAL = "999999";

    reconciliationRouteMocks.execution.findMany.mockResolvedValue([]);
    reconciliationRouteMocks.matchedLot.findMany.mockResolvedValue([]);
    reconciliationRouteMocks.manualAdjustment.findMany.mockResolvedValue([]);
    reconciliationRouteMocks.dailyAccountSnapshot.findMany.mockResolvedValue([
      {
        accountId: "acct-1",
        brokerNetLiquidationValue: { toString: () => "125000" },
        snapshotDate: new Date("2026-04-12T00:00:00.000Z"),
        id: "snapshot-1",
      },
      {
        accountId: "acct-2",
        brokerNetLiquidationValue: { toString: () => "115000" },
        snapshotDate: new Date("2026-04-12T00:00:00.000Z"),
        id: "snapshot-2",
      },
    ]);
    reconciliationRouteMocks.matchedLot.aggregate.mockResolvedValue({ _sum: { realizedPnl: { toString: () => "0" } } });
    reconciliationRouteMocks.cashEvent.aggregate.mockResolvedValue({ _sum: { amount: { toString: () => "0" } } });
    reconciliationRouteMocks.account.findMany.mockResolvedValue([
      { accountId: "D-68011053", startingCapital: { toString: () => "100000" } },
      { accountId: "D-68011054", startingCapital: { toString: () => "100000" } },
    ]);
    getEquityQuotesMock.mockResolvedValue({});
    getOptionQuoteMock.mockResolvedValue(null);
    getOptionQuotesMock.mockImplementation(async (requests: Array<{ symbol: string; strike: number; expDate: string; contractType: "CALL" | "PUT" }>) => {
      const entries = await Promise.all(
        requests.map(async (request) => {
          const quote = await getOptionQuoteMock(request.symbol, request.strike, request.expDate, request.contractType);
          return [[request.symbol, String(request.strike), request.expDate, request.contractType].join("|"), quote] as const;
        }),
      );

      return Object.fromEntries(entries);
    });
  });

  it("uses Account.startingCapital instead of the STARTING_CAPITAL env var", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/overview/reconciliation"));
    const payload = (await response.json()) as { data: { startingCapital: string; totalGain: string; startingCapitalConfigured: boolean } };

    expect(payload.data).toEqual(
      expect.objectContaining({
        startingCapital: "200000.00",
        totalGain: "40000.00",
        startingCapitalConfigured: true,
      }),
    );
  });

  it("deduplicates option quote lookups for matching open contracts", async () => {
    reconciliationRouteMocks.execution.findMany.mockResolvedValue([
      {
        id: "open-1",
        accountId: "acct-1",
        broker: "SCHWAB_THINKORSWIM",
        symbol: "AAPL_011726C00200000",
        tradeDate: new Date("2026-01-02T00:00:00.000Z"),
        eventTimestamp: new Date("2026-01-02T15:30:00.000Z"),
        eventType: "TRADE",
        assetClass: "OPTION",
        side: "BUY",
        quantity: { toString: () => "1" },
        price: { toString: () => "2.50" },
        openingClosingEffect: "TO_OPEN",
        instrumentKey: "acct-1::AAPL-200-C-2026-01-17",
        underlyingSymbol: "AAPL",
        optionType: "CALL",
        strike: { toString: () => "200" },
        expirationDate: new Date("2026-01-17T00:00:00.000Z"),
        spreadGroupId: null,
        importId: "import-1",
      },
      {
        id: "open-2",
        accountId: "acct-1",
        broker: "SCHWAB_THINKORSWIM",
        symbol: "AAPL_011726C00200000",
        tradeDate: new Date("2026-01-03T00:00:00.000Z"),
        eventTimestamp: new Date("2026-01-03T15:30:00.000Z"),
        eventType: "TRADE",
        assetClass: "OPTION",
        side: "BUY",
        quantity: { toString: () => "1" },
        price: { toString: () => "2.75" },
        openingClosingEffect: "TO_OPEN",
        instrumentKey: "acct-1::AAPL-200-C-2026-01-17",
        underlyingSymbol: "AAPL",
        optionType: "CALL",
        strike: { toString: () => "200" },
        expirationDate: new Date("2026-01-17T00:00:00.000Z"),
        spreadGroupId: null,
        importId: "import-2",
      },
    ]);
    getOptionQuoteMock.mockResolvedValue({
      mark: 3.4,
      bid: 3.3,
      ask: 3.5,
      delta: 0.5,
      theta: -0.04,
      iv: 0.22,
      dte: 14,
      inTheMoney: false,
    });

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/overview/reconciliation"));
    const payload = (await response.json()) as { data: { unrealizedPnl: string } };

    expect(getOptionQuotesMock).toHaveBeenCalledTimes(1);
    expect(getOptionQuotesMock).toHaveBeenCalledWith([
      {
        symbol: "AAPL",
        strike: 200,
        expDate: "2026-01-17",
        contractType: "CALL",
      },
    ]);
    expect(payload.data.unrealizedPnl).toBe("155.00");
  });

  it("returns cached reconciliation payloads for repeated requests", async () => {
    const { GET } = await import("./route");

    await GET(new Request("http://localhost/api/overview/reconciliation?accountIds=acct-1"));
    reconciliationRouteMocks.execution.findMany.mockClear();
    reconciliationRouteMocks.matchedLot.findMany.mockClear();

    await GET(new Request("http://localhost/api/overview/reconciliation?accountIds=acct-1"));

    expect(reconciliationRouteMocks.execution.findMany).not.toHaveBeenCalled();
    expect(reconciliationRouteMocks.matchedLot.findMany).not.toHaveBeenCalled();
  });
});
