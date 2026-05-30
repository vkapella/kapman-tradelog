import { describe, expect, it } from "vitest";
import { summarizeWinLossFlatRows } from "@/components/widgets/WinLossFlatWidget";
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
