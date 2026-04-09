import { describe, expect, it } from "vitest";
import { parseCashBalanceSnapshots } from "./cash-balance";

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
});
