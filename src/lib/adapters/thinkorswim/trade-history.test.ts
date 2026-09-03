import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseThinkorswimTradeHistory } from "./trade-history";

describe("parseThinkorswimTradeHistory", () => {
  it("parses real fixtures and preserves known spread types", () => {
    const fixtureOne = readFileSync("fixtures/2026-04-06-AccountStatement.csv", "utf8");
    const fixtureTwo = readFileSync("fixtures/2026-04-06-AccountStatement-2.csv", "utf8");
    const syntheticFixture = readFileSync("fixtures/sample_tos_export.csv", "utf8");

    const resultOne = parseThinkorswimTradeHistory(fixtureOne);
    const resultTwo = parseThinkorswimTradeHistory(fixtureTwo);
    const resultSynthetic = parseThinkorswimTradeHistory(syntheticFixture);

    expect(resultOne.executions.length).toBeGreaterThan(0);
    expect(resultTwo.executions.length).toBeGreaterThan(0);
    expect(resultSynthetic.executions.length).toBeGreaterThan(0);

    expect(resultOne.snapshots.length).toBeGreaterThan(0);
    expect(resultTwo.snapshots.length).toBeGreaterThan(0);
    expect(Array.isArray(resultSynthetic.snapshots)).toBe(true);
    expect(resultOne.cashEvents.length).toBeGreaterThan(0);
    expect(new Set(resultOne.cashEvents.map((event) => event.rowType))).toEqual(new Set(["LIQ", "FND"]));

    const spreads = new Set(resultOne.executions.map((row) => row.spread));
    expect(spreads.has("CALENDAR")).toBe(true);
    expect(spreads.has("COMBO")).toBe(true);
    expect(spreads.has("CUSTOM")).toBe(true);
  });

  it("keeps continuation rows as separate legs with shared spread_group_id", () => {
    const fixture = readFileSync("fixtures/2026-04-06-AccountStatement.csv", "utf8");
    const result = parseThinkorswimTradeHistory(fixture);

    const continuationRows = result.executions.filter((row) => row.rawRowJson.execTime === null);
    expect(continuationRows.length).toBeGreaterThan(0);
    expect(continuationRows.some((row) => row.rawRowJson.netPrice === "DEBIT")).toBe(true);
    expect(continuationRows.some((row) => row.rawRowJson.netPrice === "CREDIT")).toBe(true);
    expect(continuationRows.every((row) => typeof row.spreadGroupId === "string" && row.spreadGroupId.length > 0)).toBe(true);
  });

  it("assigns distinct broker ref numbers to same-timestamp duplicate trade rows", () => {
    const fixture = readFileSync("fixtures/2026-04-06-AccountStatement.csv", "utf8");
    const result = parseThinkorswimTradeHistory(fixture);

    const rklbRows = result.executions.filter(
      (row) =>
        row.eventTimestamp.toISOString() === "2025-12-23T09:31:01.000Z" &&
        row.symbol === "RKLB" &&
        row.optionType === "CALL" &&
        row.strike === 55,
    );

    expect(rklbRows).toHaveLength(2);
    expect(new Set(rklbRows.map((row) => row.brokerRefNumber))).toEqual(new Set(["5278319313", "5278319395"]));
  });

  it("treats a FUND money-market sweep as a known single-leg spread without warning", () => {
    const csv = [
      "Account Statement for 18528700SCHW (margin) since 7/29/26 through 8/27/26",
      "",
      "Account Trade History",
      ",Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type",
      ",8/26/26 20:22:37,FUND,BUY,+100000,TO OPEN,SNSXX,,,FUND,1.00,1.00,AMT",
      "",
    ].join("\n");

    const parsed = parseThinkorswimTradeHistory(csv);

    expect(parsed.executions).toHaveLength(1);
    expect(parsed.executions[0]).toMatchObject({ symbol: "SNSXX", assetClass: "EQUITY", quantity: 100000, side: "BUY" });
    expect(parsed.executions[0]?.rawRowJson).toMatchObject({ spread: "FUND", type: "FUND" });
    expect(parsed.warnings.filter((warning) => warning.code === "UNKNOWN_SPREAD_TYPE")).toEqual([]);
  });

  it("handles price '~' as null and warns on unknown spread", () => {
    const synthetic = [
      "This document was exported from the paperMoney platform.",
      "",
      "Account Statement for D-99999999 (margin) since 1/1/26 through 1/2/26",
      "",
      "Account Trade History",
      ",Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type",
      ",1/2/26 10:00:00,BUTTERFLY,BUY,+1,TO OPEN,SPY,17 APR 26,500,CALL,~,DEBIT,LMT",
    ].join("\n");

    const result = parseThinkorswimTradeHistory(synthetic);

    expect(result.executions).toHaveLength(1);
    expect(result.executions[0]?.price).toBeNull();
    expect(result.warnings.some((warning) => warning.code === "UNKNOWN_SPREAD_TYPE")).toBe(true);
  });

  it("parses assignment stock acquisitions from cash balance EXP rows", () => {
    const synthetic = [
      "This document was exported from the paperMoney platform.",
      "",
      "Account Statement for D-99999999 (margin) since 5/1/26 through 5/2/26",
      "",
      "Cash Balance",
      "DATE,TIME,TYPE,REF #,DESCRIPTION,Commissions & Fees,Short Term Rdm Fee,AMOUNT,BALANCE",
      "5/2/26,01:00:00,EXP,=\"5336674732\",Bought 100.0 XLE due to assignment,,,\"-5,900.00\",\"37,961.37\"",
      "",
      "Account Trade History",
      ",Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type",
    ].join("\n");

    const result = parseThinkorswimTradeHistory(synthetic);

    expect(result.executions).toHaveLength(1);
    expect(result.executions[0]).toMatchObject({
      eventType: "ASSIGNMENT",
      assetClass: "EQUITY",
      symbol: "XLE",
      side: "BUY",
      quantity: 100,
      price: 59,
      openingClosingEffect: "UNKNOWN",
      brokerRefNumber: "5336674732",
    });
  });

  it("parses the 260727 Total Cost layout without shifting execution fields", () => {
    const account53 = parseThinkorswimTradeHistory(readFileSync("fixtures/tos-260727-account53.csv", "utf8"));
    const account54 = parseThinkorswimTradeHistory(readFileSync("fixtures/tos-260727-account54.csv", "utf8"));

    expect(account53.accountMetadata.accountId).toBe("D-68011053");
    expect(account53.executions).toHaveLength(3);
    expect(account53.executions.map((execution) => ({
      symbol: execution.symbol,
      side: execution.side,
      quantity: execution.quantity,
      effect: execution.openingClosingEffect,
      price: execution.price,
      type: execution.optionType,
      expiration: execution.expirationDate?.toISOString().slice(0, 10),
      orderType: execution.rawRowJson.orderType,
      totalCost: execution.rawRowJson.totalCost,
    }))).toEqual([
      {
        symbol: "D",
        side: "SELL",
        quantity: 2,
        effect: "TO_CLOSE",
        price: 7.25,
        type: "CALL",
        expiration: "2026-09-18",
        orderType: "LMT",
        totalCost: "0.00",
      },
      {
        symbol: "APH",
        side: "SELL",
        quantity: 2,
        effect: "TO_CLOSE",
        price: 14.2,
        type: "CALL",
        expiration: "2026-10-16",
        orderType: "LMT",
        totalCost: "0.00",
      },
      {
        symbol: "DDOG",
        side: "SELL",
        quantity: 1,
        effect: "TO_OPEN",
        price: 20.1,
        type: "CALL",
        expiration: "2026-09-18",
        orderType: "LMT",
        totalCost: "0.00",
      },
    ]);
    expect(account53.executions.map((execution) => execution.brokerRefNumber)).toEqual([
      "5374121706",
      "5374119292",
      "5374117674",
    ]);

    expect(account54.accountMetadata.accountId).toBe("D-68011054");
    expect(account54.executions).toHaveLength(1);
    expect(account54.executions[0]).toMatchObject({
      symbol: "GOOG",
      side: "SELL",
      quantity: 1,
      openingClosingEffect: "TO_CLOSE",
      optionType: "CALL",
      strike: 400,
      price: 21.75,
      netAmount: 21.75,
      brokerRefNumber: "5374114443",
    });
    expect(account54.executions[0]?.rawRowJson).toMatchObject({
      totalCost: "0.00",
      orderType: "LMT",
    });
  });

  it("reports unsupported trade-history columns precisely", () => {
    const synthetic = [
      "Account Statement for D-99999999 (margin) since 1/1/26 through 1/2/26",
      "Account Trade History",
      ",Exec Time,Spread,Side,Qty,Total Cost,Pos Effect,Symbol,Exp,Strike,Type,Net Price,Order Type,Future Field",
    ].join("\n");

    expect(() => parseThinkorswimTradeHistory(synthetic)).toThrow(
      "Unsupported Account Trade History header: missing required columns: Price.",
    );
  });
});
