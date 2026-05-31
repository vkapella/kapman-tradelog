import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { cumulativeLedgerAmountForCashEvent, reconstructedTradeCashDelta } from "./backfill-value-snapshots";

describe("cumulativeLedgerAmountForCashEvent", () => {
  it("includes external cash-event row types in the reconstructed cash ledger", () => {
    const rows = [
      ["DIVIDEND", "6.55", 6.55],
      ["FND", "24761.54", 24761.54],
      ["TRANSFER_IN", "52973.60", 52973.6],
    ] as const;

    const total = rows.reduce(
      (sum, [rowType, amount]) =>
        sum +
        cumulativeLedgerAmountForCashEvent({
          rowType,
          amount: new Prisma.Decimal(amount),
        }),
      0,
    );

    expect(total).toBeCloseTo(77741.69, 2);
  });

  it("excludes internal money-market cash-equivalent rows from reconstructed cash", () => {
    const rows = [
      ["MONEY_MARKET_BUY", "-80476.91"],
      ["MONEY_MARKET_REDEEM", "27626.68"],
      ["MONEY_MARKET_EXCHANGE_IN", "-4326.77"],
      ["MONEY_MARKET_EXCHANGE_OUT", "4326.77"],
      ["REDEMPTION", "100.00"],
    ] as const;

    const total = rows.reduce(
      (sum, [rowType, amount]) =>
        sum +
        cumulativeLedgerAmountForCashEvent({
          rowType,
          amount: new Prisma.Decimal(amount),
        }),
      0,
    );

    expect(total).toBe(0);
  });

  it("does not filter unknown persisted row types at the cumulative ledger boundary", () => {
    expect(
      cumulativeLedgerAmountForCashEvent({
        rowType: "BROKER_SPECIFIC_CASH_ADJUSTMENT",
        amount: new Prisma.Decimal("42.10"),
      }),
    ).toBe(42.1);
  });
});

describe("reconstructedTradeCashDelta", () => {
  it("subtracts equity buys and adds equity sells using quantity times price", () => {
    expect(
      reconstructedTradeCashDelta({
        assetClass: "EQUITY",
        side: "BUY",
        quantity: new Prisma.Decimal("10"),
        price: new Prisma.Decimal("576.26"),
      }),
    ).toBeCloseTo(-5762.6, 2);

    expect(
      reconstructedTradeCashDelta({
        assetClass: "EQUITY",
        side: "SELL",
        quantity: new Prisma.Decimal("5"),
        price: new Prisma.Decimal("553.10"),
      }),
    ).toBeCloseTo(2765.5, 2);
  });

  it("uses the option multiplier for option trade cash flow", () => {
    expect(
      reconstructedTradeCashDelta({
        assetClass: "OPTION",
        side: "SELL",
        quantity: new Prisma.Decimal("2"),
        price: new Prisma.Decimal("1.84"),
      }),
    ).toBeCloseTo(368, 2);
  });

  it("ignores rows without a trade side or price", () => {
    expect(
      reconstructedTradeCashDelta({
        assetClass: "EQUITY",
        side: null,
        quantity: new Prisma.Decimal("10"),
        price: new Prisma.Decimal("100"),
      }),
    ).toBe(0);

    expect(
      reconstructedTradeCashDelta({
        assetClass: "EQUITY",
        side: "BUY",
        quantity: new Prisma.Decimal("10"),
        price: null,
      }),
    ).toBe(0);
  });
});
