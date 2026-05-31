import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { cumulativeLedgerAmountForCashEvent } from "./backfill-value-snapshots";

describe("cumulativeLedgerAmountForCashEvent", () => {
  it("includes every persisted cash-event row type in the reconstructed cash ledger", () => {
    const rows = [
      ["DIVIDEND", "6.55", 6.55],
      ["FND", "24761.54", 24761.54],
      ["MONEY_MARKET_BUY", "-80476.91", -80476.91],
      ["MONEY_MARKET_DIVIDEND", "0", 0],
      ["MONEY_MARKET_REDEEM", "27626.68", 27626.68],
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

    expect(total).toBeCloseTo(24891.46, 2);
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
