import { describe, expect, it } from "vitest";
import { extractAccountIdFromFilename, parseFidelityCsv } from "@/lib/adapters/fidelity/parser";
import { FIXTURE_ACCOUNT_ID, FIXTURE_FILENAME_10, FIXTURE_FILENAME_11, FIXTURE_FILENAME_8, FIXTURE_FILENAME_9, loadFixtureBuffer } from "./fixture-data";

describe("parseFidelityCsv", () => {
  it("strips UTF-8 BOM and returns expected row count per fixture", () => {
    const fixture8 = parseFidelityCsv(loadFixtureBuffer(FIXTURE_FILENAME_8), FIXTURE_FILENAME_8);
    const fixture9 = parseFidelityCsv(loadFixtureBuffer(FIXTURE_FILENAME_9), FIXTURE_FILENAME_9);
    const fixture10 = parseFidelityCsv(loadFixtureBuffer(FIXTURE_FILENAME_10), FIXTURE_FILENAME_10);

    expect(fixture8).toHaveLength(8);
    expect(fixture9).toHaveLength(7);
    expect(fixture10).toHaveLength(8);

    for (const row of fixture8) {
      expect(row.rawAction.startsWith("\uFEFF")).toBe(false);
      expect(row.symbol.startsWith("\uFEFF")).toBe(false);
      expect(row.description.startsWith("\uFEFF")).toBe(false);
    }
  });

  it("extracts account id from fixture filenames", () => {
    expect(extractAccountIdFromFilename(FIXTURE_FILENAME_8)).toBe(FIXTURE_ACCOUNT_ID);
    expect(extractAccountIdFromFilename(FIXTURE_FILENAME_9)).toBe(FIXTURE_ACCOUNT_ID);
    expect(extractAccountIdFromFilename(FIXTURE_FILENAME_10)).toBe(FIXTURE_ACCOUNT_ID);
    expect(extractAccountIdFromFilename("unexpected.csv")).toBeNull();
  });

  it("parses numbers and dates, and strips the leading symbol space", () => {
    const rows = parseFidelityCsv(loadFixtureBuffer(FIXTURE_FILENAME_8), FIXTURE_FILENAME_8);

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

    const rows = parseFidelityCsv(Buffer.from(csv, "utf8"), `History_for_Account_${FIXTURE_ACCOUNT_ID}-11.csv`);
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

  it("stops parsing when Fidelity disclaimer and download footer begin", () => {
    const rows = parseFidelityCsv(loadFixtureBuffer(FIXTURE_FILENAME_11), FIXTURE_FILENAME_11);

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.rawAction !== "")).toBe(true);
    expect(rows[0]?.cashBalance).toBeNull();
    expect(rows[2]?.symbol).toBe("FSIXX");
  });
});
