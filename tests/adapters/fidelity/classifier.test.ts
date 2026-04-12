import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyAction } from "@/lib/adapters/fidelity/classifier";
import { parseFidelityCsv } from "@/lib/adapters/fidelity/parser";

function loadActions(): string[] {
  const fixtures = [
    "tests/adapters/fidelity/fixtures/History_for_Account_X19467537-8.csv",
    "tests/adapters/fidelity/fixtures/History_for_Account_X19467537-9.csv",
    "tests/adapters/fidelity/fixtures/History_for_Account_X19467537-10.csv",
  ];

  return fixtures
    .flatMap((fixture) => parseFidelityCsv(readFileSync(fixture), fixture).map((row) => row.rawAction))
    .filter((action) => action.trim().length > 0);
}

function pickAction(actions: string[], needle: string): string {
  const match = actions.find((action) => action.includes(needle));
  if (!match) {
    throw new Error(`Unable to locate fixture action containing '${needle}'.`);
  }

  return match;
}

describe("classifyAction", () => {
  const actions = loadActions();

  it("classifies all priority match categories from fixture action strings", () => {
    expect(classifyAction(pickAction(actions, "BUY CANCEL"))).toEqual({ kind: "CANCELLED" });
    expect(classifyAction(pickAction(actions, "YOU BOUGHT OPENING TRANSACTION"))).toEqual({
      kind: "EXECUTION",
      side: "BUY",
      openClose: "OPEN",
      assetClass: "OPTION",
    });
    expect(classifyAction(pickAction(actions, "YOU BOUGHT CLOSING TRANSACTION"))).toEqual({
      kind: "EXECUTION",
      side: "BUY",
      openClose: "CLOSE",
      assetClass: "OPTION",
    });
    expect(classifyAction(pickAction(actions, "YOU SOLD OPENING TRANSACTION"))).toEqual({
      kind: "EXECUTION",
      side: "SELL",
      openClose: "OPEN",
      assetClass: "OPTION",
    });
    expect(classifyAction(pickAction(actions, "YOU SOLD CLOSING TRANSACTION"))).toEqual({
      kind: "EXECUTION",
      side: "SELL",
      openClose: "CLOSE",
      assetClass: "OPTION",
    });
    expect(classifyAction(pickAction(actions, "ASSIGNED as of"))).toEqual({
      kind: "EXECUTION",
      side: "BUY",
      openClose: "CLOSE",
      assetClass: "OPTION",
    });
    expect(classifyAction(pickAction(actions, "YOU BOUGHT ASSIGNED"))).toEqual({
      kind: "EXECUTION",
      side: "BUY",
      openClose: null,
      assetClass: "EQUITY",
    });
    expect(classifyAction(pickAction(actions, "YOU BOUGHT PROSPECTUS UNDER SEPARATE COVER"))).toEqual({
      kind: "CASH_EVENT",
      cashEventType: "MONEY_MARKET_BUY",
    });
    expect(classifyAction(pickAction(actions, "DIVIDEND RECEIVED"))).toEqual({ kind: "CASH_EVENT", cashEventType: "DIVIDEND" });
    expect(classifyAction(pickAction(actions, "REINVESTMENT"))).toEqual({ kind: "CASH_EVENT", cashEventType: "REINVESTMENT" });
    expect(classifyAction(pickAction(actions, "REDEMPTION FROM CORE ACCOUNT"))).toEqual({ kind: "CASH_EVENT", cashEventType: "REDEMPTION" });
    expect(classifyAction(pickAction(actions, "TRANSFERRED FROM"))).toEqual({ kind: "CASH_EVENT", cashEventType: "TRANSFER_IN" });
    expect(classifyAction(pickAction(actions, "TRANSFER OF ASSETS ACAT RECEIVE"))).toEqual({ kind: "CASH_EVENT", cashEventType: "ACAT_RECEIVE" });
    expect(classifyAction(pickAction(actions, "TRANSFER OF ASSETS ACAT RES.CREDIT"))).toEqual({ kind: "CASH_EVENT", cashEventType: "ACAT_CREDIT" });
    expect(classifyAction(pickAction(actions, "YOU BOUGHT ISHARES TR MSCI USA MMENTM"))).toEqual({
      kind: "EXECUTION",
      side: "BUY",
      openClose: null,
      assetClass: "EQUITY",
    });
    expect(classifyAction(pickAction(actions, "YOU SOLD SELECT SECTOR SPDR TRUST"))).toEqual({
      kind: "EXECUTION",
      side: "SELL",
      openClose: null,
      assetClass: "EQUITY",
    });
    expect(classifyAction("UNMAPPED FIDELITY ACTION")).toEqual({ kind: "UNKNOWN" });
  });

  it("prioritizes specific rules before generic YOU BOUGHT", () => {
    const assigned = pickAction(actions, "YOU BOUGHT ASSIGNED");
    const moneyMarket = pickAction(actions, "YOU BOUGHT PROSPECTUS UNDER SEPARATE COVER");

    expect(classifyAction(assigned)).toEqual({
      kind: "EXECUTION",
      side: "BUY",
      openClose: null,
      assetClass: "EQUITY",
    });
    expect(classifyAction(moneyMarket)).toEqual({ kind: "CASH_EVENT", cashEventType: "MONEY_MARKET_BUY" });
  });
});
