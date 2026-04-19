import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { buildInferenceLots, STOCK_ANCHOR_PREFIX, type MatchedLotWithExecutions } from "./inference-lot-builder";

function decimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function createMatchedLot(overrides: Partial<MatchedLotWithExecutions> = {}): MatchedLotWithExecutions {
  return {
    id: "lot-1",
    accountId: "account-1",
    openExecutionId: "exec-open-1",
    realizedPnl: decimal(12.5),
    holdingDays: 2,
    openExecution: {
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
    closeExecution: {
      tradeDate: new Date("2024-05-10T00:00:00.000Z"),
    },
    ...overrides,
  };
}

describe("buildInferenceLots", () => {
  it("maps matched lots and adds no stock anchors when no unmatched equity executions exist", async () => {
    const matchedLots = [createMatchedLot()];
    const db = {
      execution: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const lots = await buildInferenceLots(db as never, "account-1", matchedLots);

    expect(lots).toEqual([
      expect.objectContaining({
        id: "lot-1",
        accountId: "account-1",
        underlyingSymbol: "INTC",
        openAssetClass: "OPTION",
      }),
    ]);
    expect(db.execution.findMany).toHaveBeenCalledTimes(1);
  });

  it("synthesizes stock anchors for unmatched UNKNOWN equity BUY executions", async () => {
    const db = {
      execution: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "exec-unknown-buy",
            accountId: "account-1",
            symbol: "INTC",
            underlyingSymbol: null,
            tradeDate: new Date("2024-05-07T00:00:00.000Z"),
          },
        ]),
      },
    };

    const lots = await buildInferenceLots(db as never, "account-1", []);

    expect(lots).toEqual([
      {
        id: `${STOCK_ANCHOR_PREFIX}exec-unknown-buy`,
        accountId: "account-1",
        symbol: "INTC",
        underlyingSymbol: "INTC",
        openTradeDate: new Date("2024-05-07T00:00:00.000Z"),
        closeTradeDate: null,
        realizedPnl: 0,
        holdingDays: 0,
        openAssetClass: "EQUITY",
        openSide: "BUY",
        optionType: null,
        strike: null,
        expirationDate: null,
        openSpreadGroupId: null,
      },
    ]);
    expect(db.execution.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          accountId: "account-1",
          openingClosingEffect: { in: ["TO_OPEN", "UNKNOWN"] },
          spreadGroupId: null,
        }),
      }),
    );
  });

  it("does not duplicate stock anchors for matched open equity executions", async () => {
    const matchedLots = [
      createMatchedLot({
        openExecutionId: "exec-equity-open",
        openExecution: {
          symbol: "AAPL",
          underlyingSymbol: "AAPL",
          tradeDate: new Date("2024-01-10T00:00:00.000Z"),
          assetClass: "EQUITY",
          side: "BUY",
          optionType: null,
          strike: null,
          expirationDate: null,
          spreadGroupId: null,
        },
      }),
    ];
    const db = {
      execution: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const lots = await buildInferenceLots(db as never, "account-1", matchedLots);

    expect(lots).toHaveLength(1);
    expect(lots[0]?.id).toBe("lot-1");
    expect(db.execution.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { notIn: ["exec-equity-open"] },
        }),
      }),
    );
  });
});
