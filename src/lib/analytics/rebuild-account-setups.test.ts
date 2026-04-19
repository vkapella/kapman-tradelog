import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { rebuildAccountSetups } from "./rebuild-account-setups";

function decimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

describe("rebuildAccountSetups", () => {
  it("uses unmatched open equity executions as stock anchors and infers covered_call", async () => {
    const accountId = "account-1";
    const shortCallOpenExecutionId = "exec-short-call-open";
    const assignmentStockExecutionId = "exec-assigned-stock";

    const tx = {
      setupGroup: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({ id: "setup-covered-call" }),
      },
      matchedLot: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "lot-short-call",
            accountId,
            openExecutionId: shortCallOpenExecutionId,
            realizedPnl: decimal(125.5),
            holdingDays: 3,
            openExecution: {
              id: shortCallOpenExecutionId,
              symbol: "INTC240607C34",
              underlyingSymbol: "INTC",
              tradeDate: new Date("2024-05-07T00:00:00.000Z"),
              assetClass: "OPTION",
              side: "SELL",
              optionType: "CALL",
              strike: decimal(34),
              expirationDate: new Date("2024-06-07T00:00:00.000Z"),
              spreadGroupId: null,
            },
            closeExecution: null,
          },
        ]),
      },
      execution: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: assignmentStockExecutionId,
            accountId,
            symbol: "INTC",
            underlyingSymbol: "INTC",
            tradeDate: new Date("2024-05-07T00:00:00.000Z"),
            spreadGroupId: "assignment-link-1",
          },
        ]),
      },
      setupGroupLot: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const result = await rebuildAccountSetups(tx as unknown as Prisma.TransactionClient, accountId);

    expect(result.setupGroupsPersisted).toBe(1);
    expect(result.uncategorizedCount).toBe(0);

    const executionQueryArg = tx.execution.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(executionQueryArg.where).toMatchObject({
      accountId,
      assetClass: "EQUITY",
      side: "BUY",
      openingClosingEffect: { in: ["TO_OPEN", "UNKNOWN"] },
      id: { notIn: [shortCallOpenExecutionId] },
    });
    expect(executionQueryArg.where).not.toHaveProperty("spreadGroupId");

    expect(tx.setupGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tag: "covered_call",
          underlyingSymbol: "INTC",
        }),
      }),
    );

    expect(tx.setupGroupLot.createMany).toHaveBeenCalledWith({
      data: [{ setupGroupId: "setup-covered-call", matchedLotId: "lot-short-call" }],
    });
  });

  it("does not persist setupGroupLot links for synthetic stock-anchor-only groups", async () => {
    const accountId = "account-2";

    const tx = {
      setupGroup: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({ id: "setup-stock-only" }),
      },
      matchedLot: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      execution: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "exec-open-stock",
            accountId,
            symbol: "AAPL",
            underlyingSymbol: "AAPL",
            tradeDate: new Date("2024-01-10T00:00:00.000Z"),
          },
        ]),
      },
      setupGroupLot: {
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const result = await rebuildAccountSetups(tx as unknown as Prisma.TransactionClient, accountId);

    expect(result.setupGroupsPersisted).toBe(1);
    expect(tx.setupGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tag: "stock",
          underlyingSymbol: "AAPL",
        }),
      }),
    );
    expect(tx.setupGroupLot.createMany).not.toHaveBeenCalled();
  });
});
