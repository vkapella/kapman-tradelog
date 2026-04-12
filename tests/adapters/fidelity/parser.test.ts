import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractAccountIdFromFilename, parseFidelityCsv } from "@/lib/adapters/fidelity/parser";

function loadFixtureBuffer(filename: string): Buffer {
  return readFileSync(`tests/adapters/fidelity/fixtures/${filename}`);
}

describe("parseFidelityCsv", () => {
  it("strips UTF-8 BOM and returns expected row count per fixture", () => {
    const fixture8 = parseFidelityCsv(loadFixtureBuffer("History_for_Account_X19467537-8.csv"), "History_for_Account_X19467537-8.csv");
    const fixture9 = parseFidelityCsv(loadFixtureBuffer("History_for_Account_X19467537-9.csv"), "History_for_Account_X19467537-9.csv");
    const fixture10 = parseFidelityCsv(loadFixtureBuffer("History_for_Account_X19467537-10.csv"), "History_for_Account_X19467537-10.csv");

    expect(fixture8).toHaveLength(297);
    expect(fixture9).toHaveLength(267);
    expect(fixture10).toHaveLength(100);

    for (const row of fixture8) {
      expect(row.rawAction.startsWith("\uFEFF")).toBe(false);
      expect(row.symbol.startsWith("\uFEFF")).toBe(false);
      expect(row.description.startsWith("\uFEFF")).toBe(false);
    }
  });

  it("extracts account id from fixture filenames", () => {
    expect(extractAccountIdFromFilename("History_for_Account_X19467537-8.csv")).toBe("X19467537");
    expect(extractAccountIdFromFilename("History_for_Account_X19467537-9.csv")).toBe("X19467537");
    expect(extractAccountIdFromFilename("History_for_Account_X19467537-10.csv")).toBe("X19467537");
    expect(extractAccountIdFromFilename("unexpected.csv")).toBeNull();
  });

  it("parses numbers and dates, and strips the leading symbol space", () => {
    const rows = parseFidelityCsv(loadFixtureBuffer("History_for_Account_X19467537-8.csv"), "History_for_Account_X19467537-8.csv");

    const ntapRow = rows.find((row) => row.symbol === "-NTAP260220C115");
    expect(ntapRow?.symbol).toBe("-NTAP260220C115");
    expect(ntapRow?.runDate?.toISOString()).toBe("2025-12-23T00:00:00.000Z");
    expect(ntapRow?.settlementDate?.toISOString()).toBe("2025-12-24T00:00:00.000Z");
    expect(ntapRow?.quantity).toBe(-1);
    expect(ntapRow?.price).toBe(3);

    const dividendRow = rows.find((row) => row.rawAction.includes("DIVIDEND RECEIVED FIDELITY GOVERNMENT MONEY MARKET"));
    expect(dividendRow?.price).toBeNull();
    expect(dividendRow?.commission).toBeNull();
    expect(dividendRow?.fees).toBeNull();
    expect(dividendRow?.quantity).toBe(0);
  });

  it("handles escaped quotes and missing columns gracefully", () => {
    const csv = [
      "",
      "",
      "Run Date,Action,Symbol,Description,Type",
      '01/01/2026,"YOU BOUGHT TEST"," -ABC260101C1","desc ""quoted"", text",Shares',
      "",
    ].join("\n");

    const rows = parseFidelityCsv(Buffer.from(csv, "utf8"), "History_for_Account_X19467537-11.csv");
    const row = rows[0];
    if (!row) {
      throw new Error("Expected synthetic row to parse.");
    }

    expect(row.symbol).toBe("-ABC260101C1");
    expect(row.description).toBe('desc "quoted", text');
    expect(row.marginType).toBeNull();
    expect(row.price).toBeNull();
    expect(row.settlementDate).toBeNull();
  });
});
