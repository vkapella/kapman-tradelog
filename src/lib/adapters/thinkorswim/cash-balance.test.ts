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

  // #348: a live Schwab account is funded by JRN/WIN rows, not FND.
  it("persists JRN and WIN funding rows as TRANSFER_IN and keeps other journal rows by broker type", () => {
    const csv = [
      "Cash Balance",
      "DATE,TIME,TYPE,REF #,DESCRIPTION,Misc Fees,Commissions & Fees,AMOUNT,BALANCE",
      "8/26/26,01:00:00,BAL,,Cash balance at the start of business day 26.08 CST,,,,0.00",
      "8/26/26,13:24:59,JRN,=\"129145481101\",FUNDS RECEIVED 100000.0 US$,,,\"100,000.00\",\"100,000.00\"",
      "8/26/26,20:22:37,TRD,=\"129181781548\",BOT 100000.0 SNSXX UPON ,,,\"-100,000.00\",0.00",
      "8/27/26,14:40:12,WIN,=\"129287438901\",WIRED FUNDS RECEIVED 99960.0 US$,,,\"99,960.00\",\"99,960.00\"",
      "8/28/26,09:00:00,JRN,=\"129300000000\",tIP Journal adjustment,,,\"-12.34\",\"99,947.66\"",
      "Account Trade History",
    ].join("\n");

    const parsed = parseCashBalanceRows(csv);

    expect(parsed.cashEvents).toHaveLength(3);
    expect(parsed.cashEvents[0]).toMatchObject({ rowType: "TRANSFER_IN", refNumber: "129145481101", amount: 100000 });
    expect(parsed.cashEvents[1]).toMatchObject({ rowType: "TRANSFER_IN", refNumber: "129287438901", amount: 99960 });
    expect(parsed.cashEvents[2]).toMatchObject({ rowType: "JRN", description: "Journal adjustment", amount: -12.34 });
    expect(parsed.warnings).toEqual([]);
  });

  it("warns, per row type, about cash rows it does not persist instead of dropping them silently", () => {
    const csv = [
      "Cash Balance",
      "DATE,TIME,TYPE,REF #,DESCRIPTION,Misc Fees,Commissions & Fees,AMOUNT,BALANCE",
      "8/29/26,01:00:00,BAL,,Cash balance at the start of business day 29.08 CST,,,,0.00",
      "8/29/26,02:00:00,DOI,=\"129400000001\",INTEREST INCOME,,,\"4.10\",\"4.10\"",
      "8/30/26,02:00:00,DOI,=\"129400000002\",INTEREST INCOME,,,\"4.20\",\"8.30\"",
      "8/30/26,03:00:00,ADJ,=\"129400000003\",COURTESY CREDIT,,,\"25.00\",\"33.30\"",
      ",,,,TOTAL,,,,$33.30",
      "Account Trade History",
    ].join("\n");

    const parsed = parseCashBalanceRows(csv);

    expect(parsed.cashEvents).toEqual([]);
    expect(parsed.warnings).toEqual([
      { code: "CASH_BALANCE_UNHANDLED_ROW_TYPE", message: "Skipped 1 Cash Balance row of type ADJ: not persisted by the thinkorswim parser." },
      { code: "CASH_BALANCE_UNHANDLED_ROW_TYPE", message: "Skipped 2 Cash Balance rows of type DOI: not persisted by the thinkorswim parser." },
    ]);
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

    expect(parsed.cashEvents).toHaveLength(0);
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
