import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  cashLedgerAmount,
  classifyCashRow,
  inKindTransferValue,
  isCashNeutralTransferReceive,
  isExternalFlowRow,
  summarizeCashRows,
} from "./cash-row-classification";

describe("classifyCashRow", () => {
  it("treats transfers, ACAT cash and thinkorswim funding/bookkeeping rows as external flows", () => {
    for (const rowType of ["TRANSFER_IN", "TRANSFER_OUT", "TRANSFER_ADJUSTMENT", "ACAT_RECEIVE", "ACAT_CREDIT", "FND", "LIQ", "RAD"]) {
      expect(classifyCashRow({ rowType, amount: 1 })).toBe("external_flow");
      expect(isExternalFlowRow({ rowType, amount: -1 })).toBe(true);
    }
  });

  it("treats money-market sweeps and dividend reinvestment legs as internal cash equivalents", () => {
    for (const rowType of ["MONEY_MARKET", "MONEY_MARKET_BUY", "MONEY_MARKET_REDEEM", "MONEY_MARKET_EXCHANGE_IN", "MONEY_MARKET_EXCHANGE_OUT", "REDEMPTION"]) {
      expect(classifyCashRow({ rowType, amount: 100 })).toBe("internal_cash_equivalent");
    }
    expect(classifyCashRow({ rowType: "MONEY_MARKET_DIVIDEND", amount: -104.42 })).toBe("internal_cash_equivalent");
    expect(classifyCashRow({ rowType: "MONEY_MARKET_DIVIDEND", amount: 104.42 })).toBe("income");
  });

  it("excludes paper forex sub-account journals from equity cash (#361)", () => {
    const row = { rowType: "FND", amount: "10000", description: "Initial forex money transfer." };
    expect(classifyCashRow(row)).toBe("excluded_sub_account");
    expect(cashLedgerAmount(row)).toBe(0);
    expect(isExternalFlowRow(row)).toBe(false);
    expect(classifyCashRow({ rowType: "FND", amount: "50000", description: "Cash liquidation" })).toBe("external_flow");
  });

  it("zeroes Fidelity internal cash/margin journals (#369)", () => {
    expect(classifyCashRow({ rowType: "INTERNAL_JOURNAL", amount: -2500 })).toBe("internal_journal");
    expect(cashLedgerAmount({ rowType: "INTERNAL_JOURNAL", amount: -2500 })).toBe(0);
  });

  it("keeps income and residual broker rows in cash without treating them as flows", () => {
    expect(classifyCashRow({ rowType: "DIVIDEND", amount: 6.55 })).toBe("income");
    expect(classifyCashRow({ rowType: "JRN", amount: 40, description: "CUST SERVICE GEST 40.0 US$" })).toBe("broker_adjustment");
    expect(cashLedgerAmount({ rowType: "JRN", amount: new Prisma.Decimal("40") })).toBe(40);
    expect(isExternalFlowRow({ rowType: "DIVIDEND", amount: 6.55 })).toBe(false);
  });
});

describe("summarizeCashRows", () => {
  it("reproduces the value engine's ledger total while exposing the class breakdown", () => {
    const rows = [
      { rowType: "TRANSFER_IN", amount: "52973.60" },
      { rowType: "MONEY_MARKET_BUY", amount: "-55339.78" },
      { rowType: "MONEY_MARKET_REDEEM", amount: "13090.54" },
      { rowType: "MONEY_MARKET_DIVIDEND", amount: "104.42" },
      { rowType: "MONEY_MARKET_DIVIDEND", amount: "-104.42" },
      { rowType: "DIVIDEND", amount: "6.55" },
      { rowType: "FND", amount: "10000", description: "Initial forex money transfer." },
    ];
    const summary = summarizeCashRows(rows);
    expect(summary.ledgerTotal).toBeCloseTo(52973.6 + 104.42 + 6.55, 6);
    expect(summary.externalFlows).toBeCloseTo(52973.6, 6);
    expect(summary.byClass.internal_cash_equivalent).toBeCloseTo(-55339.78 + 13090.54 - 104.42, 6);
    expect(summary.byClass.excluded_sub_account).toBe(10000);
    expect(summary.rowCountByClass.income).toBe(2);
  });
});

describe("inKindTransferValue", () => {
  const acat = {
    assetClass: "EQUITY",
    side: "BUY",
    quantity: new Prisma.Decimal("100"),
    price: new Prisma.Decimal("89.81"),
    rawRowJson: { action: "EXECUTION BUY OPEN EQUITY (ACAT_RECEIVE)", rawAction: "TRANSFER OF ASSETS ACAT RECEIVE SELECT SECTOR SPDR TRUST STATE STREET (XLE)" },
  };

  it("values an ACAT receive at quantity times the provisional basis", () => {
    expect(isCashNeutralTransferReceive(acat.rawRowJson)).toBe(true);
    expect(inKindTransferValue(acat)).toBeCloseTo(8981, 6);
  });

  it("uses a basis override when supplied and ignores ordinary executions", () => {
    expect(inKindTransferValue(acat, 85)).toBeCloseTo(8500, 6);
    expect(inKindTransferValue({ ...acat, rawRowJson: { action: "YOU BOUGHT" } })).toBe(0);
    expect(inKindTransferValue({ ...acat, side: "SELL" })).toBe(0);
    expect(inKindTransferValue({ ...acat, price: null })).toBe(0);
  });
});
