import { beforeEach, describe, expect, it, vi } from "vitest";

const refreshMocks = vi.hoisted(() => ({
  backfillValueSnapshots: vi.fn(),
  backfillLotExcursions: vi.fn(),
}));

vi.mock("@/lib/analysis/backfill-value-snapshots", () => ({
  backfillValueSnapshots: refreshMocks.backfillValueSnapshots,
}));

vi.mock("@/lib/analysis/backfill-lot-excursions", () => ({
  backfillLotExcursions: refreshMocks.backfillLotExcursions,
}));

describe("refreshDerivedAnalysisForAccounts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    refreshMocks.backfillValueSnapshots.mockResolvedValue({ snapshotsUpserted: 3 });
    refreshMocks.backfillLotExcursions.mockResolvedValue({ excursionsUpserted: 2 });
  });

  it("refreshes value snapshots before lot excursions for normalized accounts", async () => {
    const logger = { log: vi.fn(), warn: vi.fn() };
    const { refreshDerivedAnalysisForAccounts } = await import("./refresh-derived-analysis");

    const summary = await refreshDerivedAnalysisForAccounts({
      accountIds: [" acct-b ", "acct-a", "acct-b", ""],
      logger,
    });

    expect(refreshMocks.backfillValueSnapshots).toHaveBeenCalledWith({
      accountIds: ["acct-a", "acct-b"],
      logger,
    });
    expect(refreshMocks.backfillLotExcursions).toHaveBeenCalledWith({
      accountIds: ["acct-a", "acct-b"],
      logger,
    });
    expect(refreshMocks.backfillValueSnapshots.mock.invocationCallOrder[0]).toBeLessThan(
      refreshMocks.backfillLotExcursions.mock.invocationCallOrder[0],
    );
    expect(summary).toEqual({
      valueSnapshots: { snapshotsUpserted: 3 },
      lotExcursions: { excursionsUpserted: 2 },
    });
  });

  it("rejects empty account scope", async () => {
    const { refreshDerivedAnalysisForAccounts } = await import("./refresh-derived-analysis");

    await expect(refreshDerivedAnalysisForAccounts({ accountIds: [" "] })).rejects.toThrow(
      "Cannot refresh derived analysis without at least one account id.",
    );
    expect(refreshMocks.backfillValueSnapshots).not.toHaveBeenCalled();
    expect(refreshMocks.backfillLotExcursions).not.toHaveBeenCalled();
  });
});
