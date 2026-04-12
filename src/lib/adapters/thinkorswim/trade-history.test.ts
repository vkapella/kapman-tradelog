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
});
