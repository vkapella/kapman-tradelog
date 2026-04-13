import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCashBalanceRows, parseCashBalanceSnapshots } from "./cash-balance";
import { parseThinkorswimTradeHistory } from "./trade-history";

describe("parseCashBalanceSnapshots", () => {
  it("extracts BAL rows from the Cash Balance section", () => {
    const csv = [
      "Cash Balance",
      "DATE,TIME,TYPE,REF #,DESCRIPTION,Misc Fees,Commissions & Fees,AMOUNT,BALANCE",
      "8/15/25,01:00:00,BAL,,Cash balance at start,,,,\"100,000.00\"",
      "8/15/25,09:30:00,TRD,=\"123\",Option trade,,,,\"99,500.00\"",
      "8/16/25,01:00:00,BAL,,Cash balance at start,,,,\"99,500.00\"",
      "Account Trade History",
    ].join("\n");

    const snapshots = parseCashBalanceSnapshots(csv);

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]?.balance).toBe(100000);
    expect(snapshots[1]?.balance).toBe(99500);
    expect(snapshots[0]?.snapshotDate.toISOString().slice(0, 10)).toBe("2025-08-15");
  });

  it("extracts FND, LIQ, and RAD rows into cash events", () => {
    const csv = [
      "Cash Balance",
      "DATE,TIME,TYPE,REF #,DESCRIPTION,Misc Fees,Commissions & Fees,AMOUNT,BALANCE",
      "8/15/25,01:00:00,BAL,,Cash balance at start,,,,\"100,000.00\"",
      "8/15/25,09:30:00,LIQ,=\"5228994914\",Cash liquidation,,,\"100,000.00\",\"200,000.00\"",
      "8/16/25,10:00:00,FND,=\"5265778392\",tIPAD Position adjustment,,,\"-5,664.75\",\"92,511.66\"",
      "8/16/25,11:00:00,RAD,=\"60012345\",tIP Fee reversal,,,\"120.50\",\"92,632.16\"",
      "8/17/25,01:00:00,BAL,,Cash balance at start,,,,\"92,632.16\"",
      "Account Trade History",
    ].join("\n");

    const parsed = parseCashBalanceRows(csv);

    expect(parsed.snapshots).toHaveLength(2);
    expect(parsed.cashEvents).toHaveLength(3);
    expect(parsed.cashEvents[0]).toMatchObject({
      rowType: "LIQ",
      refNumber: "5228994914",
      description: "Cash liquidation",
      amount: 100000,
    });
    expect(parsed.cashEvents[1]).toMatchObject({
      rowType: "FND",
      refNumber: "5265778392",
      description: "Position adjustment",
      amount: -5664.75,
    });
    expect(parsed.cashEvents[2]).toMatchObject({
      rowType: "RAD",
      refNumber: "60012345",
      description: "Fee reversal",
      amount: 120.5,
    });
  });

  it("extracts TRD rows as trade references with broker ref numbers", () => {
    const csv = [
      "Cash Balance",
      "DATE,TIME,TYPE,REF #,DESCRIPTION,Misc Fees,Commissions & Fees,AMOUNT,BALANCE",
      "12/23/25,09:31:01,TRD,=\"5278319313\",SOLD -2 RKLB 100 20 MAR 26 55 CALL @23.00,-0.09,-1.30,\"4,600.00\",\"152,759.85\"",
      "12/23/25,09:31:01,TRD,=\"5278319395\",SOLD -2 RKLB 100 20 MAR 26 55 CALL @23.00,-0.09,-1.30,\"4,600.00\",\"157,358.46\"",
      "Account Trade History",
    ].join("\n");

    const parsed = parseCashBalanceRows(csv);

    expect(parsed.tradeReferences).toHaveLength(2);
    expect(parsed.tradeReferences.map((entry) => entry.refNumber)).toEqual(["5278319313", "5278319395"]);
    expect(parsed.tradeReferences.every((entry) => entry.symbol === "RKLB")).toBe(true);
    expect(parsed.tradeReferences.every((entry) => entry.side === "SELL")).toBe(true);
    expect(parsed.tradeReferences.every((entry) => entry.quantity === 2)).toBe(true);
  });

  it("stops before Forex Statements and preserves the statement-enriched cash snapshot", () => {
    const csv = readFileSync("fixtures/2026-04-10-AccountStatement-54.csv", "utf8");

    const cashRows = parseCashBalanceRows(csv);
    const parsed = parseThinkorswimTradeHistory(csv);
    const matchingRawSnapshots = cashRows.snapshots.filter((snapshot) => snapshot.snapshotDate.toISOString().startsWith("2026-04-10"));
    const matchingSnapshots = parsed.snapshots.filter((snapshot) => snapshot.snapshotDate.toISOString().startsWith("2026-04-10"));

    expect(cashRows.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "CASH_BALANCE_SKIPPED_FUTURES_SECTION" }),
      ]),
    );
    expect(matchingRawSnapshots).toHaveLength(1);
    expect(matchingRawSnapshots[0]?.balance).toBe(42776.36);
    expect(matchingSnapshots).toHaveLength(1);
    expect(matchingSnapshots[0]).toMatchObject({
      balance: 42776.36,
      totalCash: 42879.69,
      brokerNetLiquidationValue: 90658.69,
    });
  });
});
