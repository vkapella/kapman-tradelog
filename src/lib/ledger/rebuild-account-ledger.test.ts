import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { rebuildAccountLedger } from "./rebuild-account-ledger";

interface MockExecution {
  quantity: Prisma.Decimal;
  [key: string]: unknown;
}

function tradeExecution(overrides: Record<string, unknown> = {}): MockExecution {
  return {
    id: "exec-1",
    importId: "import-1",
    accountId: "account-1",
    broker: "SCHWAB_THINKORSWIM",
    eventTimestamp: new Date("2026-04-01T14:30:00.000Z"),
    tradeDate: new Date("2026-04-01T00:00:00.000Z"),
    eventType: "TRADE",
    assetClass: "EQUITY",
    symbol: "GOOG",
    underlyingSymbol: "GOOG",
    instrumentKey: "GOOG",
    side: "BUY",
    quantity: new Prisma.Decimal(1),
    price: new Prisma.Decimal(1),
    openingClosingEffect: "TO_OPEN",
    optionType: null,
    strike: null,
    expirationDate: null,
    ...overrides,
  } satisfies MockExecution;
}

describe("rebuildAccountLedger execution qty overrides", () => {
  it("applies execution-id overrides before FIFO and excludes zero-qty overrides", async () => {
    const open = tradeExecution({
      id: "open-1",
      side: "BUY",
      quantity: new Prisma.Decimal(2),
      price: new Prisma.Decimal(100),
      openingClosingEffect: "TO_OPEN",
    });
    const close = tradeExecution({
      id: "cmnw7y63w00zr7hl4onohf70n",
      side: "SELL",
      quantity: new Prisma.Decimal(21),
      price: new Prisma.Decimal(110),
      openingClosingEffect: "TO_CLOSE",
      eventTimestamp: new Date("2026-04-02T14:30:00.000Z"),
      tradeDate: new Date("2026-04-02T00:00:00.000Z"),
    });
    const zeroed = tradeExecution({
      id: "cmnw7y63u00zp7hl4ez0ohvjz",
      side: "BUY",
      quantity: new Prisma.Decimal(5),
      price: new Prisma.Decimal(95),
      openingClosingEffect: "TO_OPEN",
      eventTimestamp: new Date("2026-04-01T15:30:00.000Z"),
    });

    const tx = {
      matchedLot: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      execution: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([open, close, zeroed]),
        update: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      manualAdjustment: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const result = await rebuildAccountLedger(
      tx as unknown as Prisma.TransactionClient,
      "account-1",
      new Date("2026-04-10T00:00:00.000Z"),
      {
        executionQtyOverrides: [
          { payload: { executionId: "cmnw7y63w00zr7hl4onohf70n", overrideQty: 2 } },
          { payload: { executionId: "cmnw7y63u00zp7hl4ez0ohvjz", overrideQty: 0 } },
        ],
      },
    );

    expect(result.matchedLotsPersisted).toBe(1);
    expect(result.syntheticExecutionsPersisted).toBe(0);
    expect(result.warnings).toEqual([]);

    expect(tx.matchedLot.createMany).toHaveBeenCalledTimes(1);
    const createManyArg = tx.matchedLot.createMany.mock.calls[0]?.[0] as { data: Array<Record<string, unknown>> };
    expect(createManyArg.data).toHaveLength(1);
    expect(createManyArg.data[0]).toMatchObject({
      accountId: "account-1",
      openExecutionId: "open-1",
      closeExecutionId: "cmnw7y63w00zr7hl4onohf70n",
      quantity: 2,
      realizedPnl: 20,
    });

    expect(close.quantity.toString()).toBe("21");
  });
});
