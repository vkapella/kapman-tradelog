import { describe, expect, it } from "vitest";
import { buildCorporateStatementCsv } from "@/lib/adapters/thinkorswim/corporate-statement.fixture";
import { parseAccountMetadataFromCsv } from "./parse-account-metadata";

describe("parseAccountMetadataFromCsv", () => {
  it("parses account id and paper money metadata", () => {
    const csv = [
      "This document was exported from the paperMoney platform.",
      "",
      "Account Statement for D-68011053 (margin) since 8/15/25 through 4/6/26",
    ].join("\n");

    const result = parseAccountMetadataFromCsv(csv);

    expect(result.accountId).toBe("D-68011053");
    expect(result.paperMoney).toBe(true);
    expect(result.broker).toBe("SCHWAB_THINKORSWIM");
  });

  // #327: a live business account is the same thinkorswim statement with a
  // "(Corporate)" account type and no paperMoney banner.
  it("parses the corporate statement layout as a live thinkorswim account", () => {
    const result = parseAccountMetadataFromCsv(buildCorporateStatementCsv());

    expect(result).toEqual({
      accountId: "12345678SCHW",
      label: "corporate 12345678SCHW",
      broker: "SCHWAB_THINKORSWIM",
      paperMoney: false,
    });
  });

  it("does not flag paper money from a word in the statement body", () => {
    const csv = [
      "Account Statement for 12345678SCHW (Corporate) since 7/29/26 through 8/27/26",
      "",
      "Account Trade History",
      ",Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type",
      ",8/26/26 10:00:00,STOCK,BUY,+100,TO OPEN,PAPERCO,,,ETF,10.00,10.00,LMT",
    ].join("\n");

    expect(parseAccountMetadataFromCsv(csv).paperMoney).toBe(false);
  });
});
