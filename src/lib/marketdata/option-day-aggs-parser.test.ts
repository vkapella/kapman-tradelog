import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseOptionDayAggsCsv } from "./option-day-aggs-parser";

function unzipCsvFromFixture(csvText: string): string {
  const zipped = gzipSync(Buffer.from(csvText, "utf8"));
  return gunzipSync(zipped).toString("utf8");
}

describe("parseOptionDayAggsCsv", () => {
  it("maps OCC tickers to canonical keys, filters contracts, and deduplicates", () => {
    const csv = unzipCsvFromFixture([
      "ticker,o,h,l,c,v,window_start",
      "O:SPY260116C00500000,4.1,4.8,3.9,4.5,1200,1768521600000000000",
      "O:QQQ260220P00450000,2.1,2.4,1.8,2.2,800,1771545600000000000",
      "O:SPY260116C00500000,4.2,4.9,4.0,4.6,1250,1768521600000000000",
      "O:BAD,1,1,1,1,100,1768521600000000000",
      "O:TSLA260618P00262500,3.1,3.4,,3.2,700,1781740800000000000",
    ].join("\n"));

    const result = parseOptionDayAggsCsv(csv, ["SPY|CALL|500|2026-01-16", "TSLA|PUT|262.5|2026-06-18"]);

    expect(result.rows).toEqual([
      {
        instrumentKey: "SPY|CALL|500|2026-01-16",
        occTicker: "O:SPY260116C00500000",
        underlying: "SPY",
        open: 4.2,
        high: 4.9,
        low: 4,
        close: 4.6,
        volume: 1250,
      },
    ]);
    expect(result.invalidRowCount).toBe(2);
    expect(result.duplicateContractCount).toBe(1);
    expect(result.missingContracts).toEqual(["TSLA|PUT|262.5|2026-06-18"]);
  });

  it("supports long-form columns and treats invalid volume as null", () => {
    const csv = unzipCsvFromFixture([
      "symbol,open,high,low,close,volume",
      "O:IWM260320C00077500,1.1,1.5,1,1.3,not-a-number",
    ].join("\n"));

    const result = parseOptionDayAggsCsv(csv, ["IWM|CALL|077.5000|2026-03-20"]);

    expect(result.rows).toEqual([
      {
        instrumentKey: "IWM|CALL|77.5|2026-03-20",
        occTicker: "O:IWM260320C00077500",
        underlying: "IWM",
        open: 1.1,
        high: 1.5,
        low: 1,
        close: 1.3,
        volume: null,
      },
    ]);
    expect(result.invalidRowCount).toBe(0);
    expect(result.duplicateContractCount).toBe(0);
    expect(result.missingContracts).toEqual([]);
  });
});
