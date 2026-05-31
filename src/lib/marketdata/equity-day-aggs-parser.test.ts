import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseEquityDayAggsCsv } from "./equity-day-aggs-parser";

function unzipCsvFromFixture(csvText: string): string {
  const zipped = gzipSync(Buffer.from(csvText, "utf8"));
  return gunzipSync(zipped).toString("utf8");
}

describe("parseEquityDayAggsCsv", () => {
  it("filters to requested symbols and deduplicates by ticker", () => {
    const csv = unzipCsvFromFixture([
      "ticker,o,h,l,c,v,window_start",
      "AAPL,180,183,179,181,1000,1704326400000000000",
      "MSFT,370,372,365,369,2000,1704326400000000000",
      "AAPL,181,184,180,182,1100,1704326400000000000",
      "AAPL,181,184,180,,1100,1704326400000000000",
    ].join("\n"));

    const result = parseEquityDayAggsCsv(csv, ["aapl", "tsla"]);

    expect(result.rows).toEqual([
      {
        symbol: "AAPL",
        open: 181,
        high: 184,
        low: 180,
        close: 182,
        volume: 1100,
      },
    ]);
    expect(result.invalidRowCount).toBe(1);
    expect(result.duplicateSymbolCount).toBe(1);
    expect(result.missingSymbols).toEqual(["TSLA"]);
  });

  it("supports long-form columns and treats invalid volume as null", () => {
    const csv = unzipCsvFromFixture([
      "ticker,open,high,low,close,volume",
      "QQQ,400.1,401.2,398.5,399.8,not-a-number",
      "IWM, 200.5 , 201.5 , 199.5 , 200.8 , 50000",
    ].join("\n"));

    const result = parseEquityDayAggsCsv(csv, ["QQQ", "IWM"]);

    expect(result.rows).toEqual([
      {
        symbol: "IWM",
        open: 200.5,
        high: 201.5,
        low: 199.5,
        close: 200.8,
        volume: 50000,
      },
      {
        symbol: "QQQ",
        open: 400.1,
        high: 401.2,
        low: 398.5,
        close: 399.8,
        volume: null,
      },
    ]);
    expect(result.invalidRowCount).toBe(0);
    expect(result.duplicateSymbolCount).toBe(0);
    expect(result.missingSymbols).toEqual([]);
  });
});
