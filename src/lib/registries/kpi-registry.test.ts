import { describe, expect, it } from "vitest";
import { getReturnOnCapitalHelpText } from "@/lib/registries/kpi-registry";
import type { OverviewSummaryResponse } from "@/types/api";

function buildSummary(overrides: Partial<OverviewSummaryResponse["returnOnCapital"]>): OverviewSummaryResponse {
  return {
    netPnl: "0.00",
    executionCount: 0,
    matchedLotCount: 0,
    setupCount: 0,
    averageHoldDays: "0.00",
    winRate: null,
    totalReturnPct: null,
    returnOnCapitalPct: null,
    returnOnCapital: {
      beginningValue: null,
      endingValue: null,
      netExternalContributions: "0.00",
      positiveExternalContributions: "0.00",
      withdrawals: "0.00",
      returnDollars: null,
      capitalBase: null,
      accountCount: 1,
      missingBeginningValueAccountIds: [],
      missingEndingValueAccountIds: [],
      endingValueSource: "daily_account_snapshot",
      ...overrides,
    },
    profitFactor: null,
    expectancy: null,
    maxDrawdown: null,
    startingCapital: "0.00",
    currentNlv: "0.00",
    snapshotCount: 0,
    importQuality: {
      totalImports: 0,
      committedImports: 0,
      failedImports: 0,
      parsedRows: 0,
      skippedRows: 0,
    },
    snapshotSeries: [],
    accountBalances: [],
  };
}

describe("getReturnOnCapitalHelpText", () => {
  it("includes missing account IDs when coverage is incomplete", () => {
    const summary = buildSummary({
      missingBeginningValueAccountIds: ["ACC-1"],
      missingEndingValueAccountIds: ["ACC-2"],
      endingValueSource: "unavailable",
    });
    const helpText = getReturnOnCapitalHelpText(summary);

    expect(helpText.interpretation).toContain("ACC-1");
    expect(helpText.interpretation).toContain("ACC-2");
  });

  it("includes snapshot fallback message when ending source is daily snapshot", () => {
    const summary = buildSummary({
      endingValueSource: "daily_account_snapshot",
    });
    const helpText = getReturnOnCapitalHelpText(summary);

    expect(helpText.interpretation).toContain("quote-backed position NLV was unavailable");
  });
});
