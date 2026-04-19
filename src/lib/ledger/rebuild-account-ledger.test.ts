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
      import: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const result = await rebuildAccountLedger(
      tx as unknown as Prisma.TransactionClient,
      "account-1",
      new Date("2026-04-10T00:00:00.000Z"),
      {
        executionQtyOverrides: [
          { executionId: "cmnw7y63w00zr7hl4onohf70n", overrideQty: 2 },
          { executionId: "cmnw7y63u00zp7hl4ez0ohvjz", overrideQty: 0 },
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

describe("rebuildAccountLedger execution price overrides", () => {
  it("applies execution price overrides before FIFO matching", async () => {
    const open = tradeExecution({
      id: "open-1",
      side: "BUY",
      quantity: new Prisma.Decimal(100),
      price: new Prisma.Decimal(89.81),
      symbol: "XLE",
      underlyingSymbol: "XLE",
      instrumentKey: "XLE",
      openingClosingEffect: "TO_OPEN",
    });
    const close = tradeExecution({
      id: "close-1",
      side: "SELL",
      quantity: new Prisma.Decimal(100),
      price: new Prisma.Decimal(85.42),
      symbol: "XLE",
      underlyingSymbol: "XLE",
      instrumentKey: "XLE",
      openingClosingEffect: "TO_CLOSE",
      eventTimestamp: new Date("2026-04-02T14:30:00.000Z"),
      tradeDate: new Date("2026-04-02T00:00:00.000Z"),
    });

    const tx = {
      matchedLot: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      execution: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([open, close]),
        update: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      manualAdjustment: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "basis-override",
            createdAt: new Date("2026-04-03T00:00:00.000Z"),
            createdBy: "tester",
            accountId: "account-1",
            symbol: "XLE",
            effectiveDate: new Date("2026-04-01T00:00:00.000Z"),
            adjustmentType: "EXECUTION_PRICE_OVERRIDE",
            payloadJson: { executionId: "open-1", overridePrice: 72.5 },
            reason: "correct transferred basis",
            evidenceRef: null,
            status: "ACTIVE",
            reversedByAdjustmentId: null,
            account: { accountId: "D-1" },
          },
        ]),
      },
      import: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const result = await rebuildAccountLedger(
      tx as unknown as Prisma.TransactionClient,
      "account-1",
      new Date("2026-04-10T00:00:00.000Z"),
    );

    expect(result.matchedLotsPersisted).toBe(1);
    expect(result.warnings).toEqual([]);

    const createManyArg = tx.matchedLot.createMany.mock.calls[0]?.[0] as { data: Array<Record<string, unknown>> };
    expect(createManyArg.data[0]).toMatchObject({
      accountId: "account-1",
      openExecutionId: "open-1",
      closeExecutionId: "close-1",
      quantity: 100,
    });
    expect(createManyArg.data[0]?.realizedPnl).toBeCloseTo(1292, 6);
  });
});

describe("rebuildAccountLedger import warning rewrite", () => {
  it("clears stale ledger warnings while preserving parse-class warnings", async () => {
    const open = tradeExecution({
      id: "open-1",
      quantity: new Prisma.Decimal(2),
      price: new Prisma.Decimal(100),
      openingClosingEffect: "TO_OPEN",
    });
    const close = tradeExecution({
      id: "close-1",
      side: "SELL",
      quantity: new Prisma.Decimal(3),
      price: new Prisma.Decimal(110),
      openingClosingEffect: "TO_CLOSE",
      eventTimestamp: new Date("2026-04-02T14:30:00.000Z"),
      tradeDate: new Date("2026-04-02T00:00:00.000Z"),
    });

    const tx = {
      matchedLot: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      execution: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([open, close]),
        update: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      manualAdjustment: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "qty-override",
            createdAt: new Date("2026-04-03T00:00:00.000Z"),
            createdBy: "tester",
            accountId: "account-1",
            symbol: "GOOG",
            effectiveDate: new Date("2026-04-02T00:00:00.000Z"),
            adjustmentType: "EXECUTION_QTY_OVERRIDE",
            payloadJson: { executionId: "close-1", overrideQty: 2 },
            reason: "fix stale unmatched close",
            evidenceRef: null,
            status: "ACTIVE",
            reversedByAdjustmentId: null,
            account: { accountId: "D-1" },
          },
        ]),
      },
      import: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "import-1",
            warnings: [
              {
                code: "UNMATCHED_CLOSE_QUANTITY",
                message: "Unmatched close quantity 1 for instrument GOOG.",
                rowRef: "close-1",
              },
              {
                code: "EXECUTION_QTY_OVERRIDE_TARGET_MISSING",
                message: "Execution qty override references missing execution missing-close.",
                rowRef: "missing-close",
              },
              {
                code: "LIMITED_SPREAD_INTERPRETATION",
                message: "Preserve parse warning.",
              },
              {
                code: "SYNTHETIC_EXPIRATION_INFERRED",
                message: "Preserve synthetic expiration warning.",
                rowRef: "synthetic-1",
              },
            ],
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const result = await rebuildAccountLedger(
      tx as unknown as Prisma.TransactionClient,
      "account-1",
      new Date("2026-04-10T00:00:00.000Z"),
    );

    expect(result.warnings).toEqual([]);
    expect(result.warningsCleared).toBe(2);
    expect(tx.import.update).toHaveBeenCalledWith({
      where: { id: "import-1" },
      data: {
        warnings: [
          {
            code: "LIMITED_SPREAD_INTERPRETATION",
            message: "Preserve parse warning.",
          },
          {
            code: "SYNTHETIC_EXPIRATION_INFERRED",
            message: "Preserve synthetic expiration warning.",
            rowRef: "synthetic-1",
          },
        ],
      },
    });
  });

  it("rewrites current ledger warnings back onto the owning import", async () => {
    const open = tradeExecution({
      id: "open-1",
      quantity: new Prisma.Decimal(1),
      price: new Prisma.Decimal(100),
      openingClosingEffect: "TO_OPEN",
    });
    const close = tradeExecution({
      id: "close-1",
      side: "SELL",
      quantity: new Prisma.Decimal(2),
      price: new Prisma.Decimal(110),
      openingClosingEffect: "TO_CLOSE",
      eventTimestamp: new Date("2026-04-02T14:30:00.000Z"),
      tradeDate: new Date("2026-04-02T00:00:00.000Z"),
    });

    const tx = {
      matchedLot: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      execution: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([open, close]),
        update: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      manualAdjustment: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      import: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "import-1",
            warnings: [
              {
                code: "UNMATCHED_CLOSE_QUANTITY",
                message: "Outdated unmatched close quantity warning.",
                rowRef: "close-1",
              },
              {
                code: "LIMITED_SPREAD_INTERPRETATION",
                message: "Preserve parse warning.",
              },
            ],
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const result = await rebuildAccountLedger(
      tx as unknown as Prisma.TransactionClient,
      "account-1",
      new Date("2026-04-10T00:00:00.000Z"),
    );

    expect(result.warnings).toEqual([
      {
        code: "UNMATCHED_CLOSE_QUANTITY",
        message: "Unmatched close quantity 1 for instrument GOOG.",
        rowRef: "close-1",
      },
    ]);
    expect(result.warningsCleared).toBe(1);
    expect(tx.import.update).toHaveBeenCalledWith({
      where: { id: "import-1" },
      data: {
        warnings: [
          {
            code: "LIMITED_SPREAD_INTERPRETATION",
            message: "Preserve parse warning.",
          },
          {
            code: "UNMATCHED_CLOSE_QUANTITY",
            message: "Unmatched close quantity 1 for instrument GOOG.",
            rowRef: "close-1",
          },
        ],
      },
    });
  });
});
