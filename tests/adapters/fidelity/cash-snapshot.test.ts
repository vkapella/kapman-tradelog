import { describe, expect, it } from "vitest";
import { fidelityAdapter } from "@/lib/adapters/fidelity";
import type { UploadedFile } from "@/lib/adapters/types";

const HEADER =
  "Run Date,Action,Symbol,Description,Type,Price ($),Quantity,Commission ($),Fees ($),Accrued Interest ($),Amount ($),Cash Balance ($),Settlement Date";

function makeFile(rows: string[]): UploadedFile {
  return {
    name: "History_for_Account_X19467537-10.csv",
    mimeType: "text/csv",
    size: 0,
    content: ["History for Account X19467537", "Generated for tests", HEADER, ...rows].join("\n"),
  };
}

describe("Fidelity cash snapshots", () => {
  it("builds an import snapshot from the first row settlement cash plus computed money-market holdings", () => {
    const file = makeFile([
      '04/10/2026,"REDEMPTION FROM CORE ACCOUNT FIMM TREASURY ONLY PORTFOLIO: CL I (FSIXX) (Cash)",FSIXX,"FIMM TREASURY ONLY PORTFOLIO: CL I",Cash,1,-100,,,,100,500,',
      '04/09/2026,"YOU BOUGHT PROSPECTUS UNDER SEPARATE COVER EXCHANGE FIMM TREASURY ONLY PORTFOLIO: CL I (FSIXX) (Cash)",FSIXX,"FIMM TREASURY ONLY PORTFOLIO: CL I",Cash,1,200,,,,-200,400,04/09/2026',
      '04/09/2026,"YOU SOLD EXCHANGE FIMM TREASURY PORTFOLIO: CL I (FISXX) (Cash)",FISXX,"FIMM TREASURY PORTFOLIO: CL I",Cash,1,-200,,,,200,600,04/09/2026',
      '03/31/2026,"REINVESTMENT FIMM TREASURY ONLY PORTFOLIO: CL I (FSIXX) (Cash)",FSIXX,"FIMM TREASURY ONLY PORTFOLIO: CL I",Cash,1,10,,,,-10,100,',
      '03/31/2026,"DIVIDEND RECEIVED FIMM TREASURY ONLY PORTFOLIO: CL I (FSIXX) (Cash)",FSIXX,"FIMM TREASURY ONLY PORTFOLIO: CL I",Cash,,0.000,,,,10,100,',
      '03/01/2026,"REDEMPTION FROM CORE ACCOUNT FIMM TREASURY PORTFOLIO: CL I (FISXX) (Cash)",FISXX,"FIMM TREASURY PORTFOLIO: CL I",Cash,1,-50,,,,50,100,',
      '02/01/2026,"YOU BOUGHT PROSPECTUS UNDER SEPARATE COVER FIMM TREASURY PORTFOLIO: CL I (FISXX) (Cash)",FISXX,"FIMM TREASURY PORTFOLIO: CL I",Cash,1,150,,,,-150,50,02/01/2026',
    ]);

    const parsed = fidelityAdapter.parse(file);

    expect(parsed.snapshots).toEqual([
      {
        snapshotDate: new Date("2026-04-10T00:00:00.000Z"),
        balance: 500,
        totalCash: 600,
      },
    ]);

    const cashEvents = parsed.cashEvents.map((event) => ({
      rowType: event.rowType,
      symbol: event.symbol,
      amount: event.amount,
    }));
    expect(cashEvents).toContainEqual({
      rowType: "MONEY_MARKET_EXCHANGE_OUT",
      symbol: "FISXX",
      amount: 200,
    });
    expect(cashEvents).toContainEqual({
      rowType: "MONEY_MARKET_EXCHANGE_IN",
      symbol: "FSIXX",
      amount: -200,
    });
    expect(cashEvents.filter((event) => event.rowType === "MONEY_MARKET_DIVIDEND")).toHaveLength(2);
  });
});
