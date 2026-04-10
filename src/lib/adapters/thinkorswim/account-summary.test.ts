import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseThinkorswimAccountSummary } from "./account-summary";

describe("parseThinkorswimAccountSummary", () => {
  it("parses statement date, total cash, and net liquidating value from real fixture formats", () => {
    const fixture = readFileSync("fixtures/2026-04-06-AccountStatement-2.csv", "utf8");
    const parsed = parseThinkorswimAccountSummary(fixture);

    expect(parsed.statementDate?.toISOString().slice(0, 10)).toBe("2026-04-06");
    expect(parsed.totalCash).toBe(91350.65);
    expect(parsed.netLiquidatingValue).toBe(90458.65);
  });

  it("parses Total Cash when present directly in Account Summary rows", () => {
    const csv = [
      "Account Statement for D-12345678 (margin) since 4/1/26 through 4/9/26",
      "",
      "Account Summary",
      "Net Liquidating Value,\"$90,653.36\"",
      "Total Cash,\"$42,776.36\"",
      "Stock Buying Power,\"$120,000.00\"",
    ].join("\n");

    const parsed = parseThinkorswimAccountSummary(csv);

    expect(parsed.statementDate?.toISOString().slice(0, 10)).toBe("2026-04-09");
    expect(parsed.totalCash).toBe(42776.36);
    expect(parsed.netLiquidatingValue).toBe(90653.36);
  });
});
