import { describe, expect, it } from "vitest";
import { summarizeWinLossFlatRows, winLossFlatChartData, winRateFromCounts } from "@/lib/metrics/win-loss-flat";
import type { MatchedLotRecord } from "@/types/api";

function buildLot(accountId: string, outcome: MatchedLotRecord["outcome"]): MatchedLotRecord {
  return {
    id: `${accountId}-${outcome}`,
    accountId,
    symbol: "SPY",
    underlyingSymbol: "SPY",
    openTradeDate: "2026-01-01T00:00:00.000Z",
    closeTradeDate: "2026-01-02T00:00:00.000Z",
    openImportId: "import-1",
    closeImportId: "import-1",
    quantity: "1",
    realizedPnl: outcome === "LOSS" ? "-10" : outcome === "WIN" ? "10" : "0",
    holdingDays: 1,
    outcome,
    openExecutionId: "open-1",
    closeExecutionId: "close-1",
  };
}

describe("summarizeWinLossFlatRows", () => {
  it("keeps metrics populated when account selection is empty", () => {
    const rows = [buildLot("acct-1", "WIN"), buildLot("acct-2", "LOSS"), buildLot("acct-3", "FLAT")];

    expect(summarizeWinLossFlatRows(rows, [])).toEqual({ WIN: 1, LOSS: 1, FLAT: 1 });
  });

  it("filters by explicit account selection", () => {
    const rows = [buildLot("acct-1", "WIN"), buildLot("acct-2", "LOSS"), buildLot("acct-2", "FLAT")];

    expect(summarizeWinLossFlatRows(rows, ["acct-2"])).toEqual({ WIN: 0, LOSS: 1, FLAT: 1 });
  });
});

describe("winRateFromCounts", () => {
  it("calculates wins over wins plus losses and excludes flats", () => {
    expect(winRateFromCounts({ WIN: 3, LOSS: 1, FLAT: 6 })).toBe(75);
  });

  it("returns null when only flat outcomes are present", () => {
    expect(winRateFromCounts({ WIN: 0, LOSS: 0, FLAT: 4 })).toBeNull();
  });
});

describe("winLossFlatChartData", () => {
  it("keeps chart labels and colors in shared WIN, LOSS, FLAT order", () => {
    expect(winLossFlatChartData({ WIN: 2, LOSS: 1, FLAT: 3 })).toEqual([
      { name: "WIN", value: 2, color: "var(--pos)" },
      { name: "LOSS", value: 1, color: "var(--neg)" },
      { name: "FLAT", value: 3, color: "var(--text-2)" },
    ]);
  });
});
