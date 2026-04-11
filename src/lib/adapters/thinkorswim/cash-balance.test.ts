import { describe, expect, it } from "vitest";
import { parseCashBalanceRows, parseCashBalanceSnapshots } from "./cash-balance";

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
});
