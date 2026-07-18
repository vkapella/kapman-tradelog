import { describe, expect, it, vi } from "vitest";
import type { ScheduledPipelineProgress, ScheduledPipelineStore } from "./scheduled-pipeline-store";
import {
  resolveCommonMarkDate,
  resolveEligibleEndDate,
  resolveIncrementalRange,
  runScheduledMarketDataPipeline,
  sanitizePipelineError,
} from "./scheduled-pipeline";

function day(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function progress(overrides: Partial<ScheduledPipelineProgress> = {}): ScheduledPipelineProgress {
  return {
    hasEquityExecutions: true,
    hasOptionExecutions: true,
    earliestEquityMarkDate: day("2026-01-02"),
    earliestOptionMarkDate: day("2026-01-02"),
    latestEquityMarkDate: day("2026-07-10"),
    latestOptionMarkDate: day("2026-07-10"),
    latestValueSnapshotDate: day("2026-07-10"),
    ...overrides,
  };
}

function storeWithProgress(rows: ScheduledPipelineProgress[], acquired = true): ScheduledPipelineStore {
  return {
    acquireLease: vi.fn().mockResolvedValue(acquired),
    releaseLease: vi.fn().mockResolvedValue(undefined),
    loadProgress: vi.fn().mockImplementation(async () => rows.shift() ?? progress()),
    loadActiveLease: vi.fn().mockResolvedValue(null),
  };
}

function equitySummary() {
  return {
    startDate: "2026-07-11",
    endDate: "2026-07-16",
    symbolsRequested: 2,
    datesProcessed: 4,
    datesSkippedMissing: 0,
    rowsUpserted: 8,
    symbolsMissing: [],
  };
}

function optionSummary() {
  return {
    source: "s3" as const,
    startDate: "2026-07-11",
    endDate: "2026-07-16",
    historicalAccessStartDate: "2024-07-19",
    contractsRequested: 2,
    datesProcessed: 4,
    datesSkippedMissing: 0,
    rowsUpserted: 8,
    contractsMissing: [],
    invalidRowCount: 0,
    duplicateContractCount: 0,
  };
}

describe("scheduled market-data date planning", () => {
  it("applies the UTC publication lag", () => {
    expect(resolveEligibleEndDate(new Date("2026-07-18T01:00:00.000Z"), 2)).toEqual(day("2026-07-16"));
  });

  it("starts one day after the latest persisted source date", () => {
    expect(resolveIncrementalRange({
      latestDate: day("2026-07-10"),
      eligibleEndDate: day("2026-07-16"),
    })).toEqual({ startDate: day("2026-07-11"), endDate: day("2026-07-16") });
  });

  it("returns null when a source is already current", () => {
    expect(resolveIncrementalRange({
      latestDate: day("2026-07-16"),
      eligibleEndDate: day("2026-07-16"),
    })).toBeNull();
  });

  it("uses the older required source as the common mark date", () => {
    expect(resolveCommonMarkDate(progress({
      latestEquityMarkDate: day("2026-07-16"),
      latestOptionMarkDate: day("2026-07-15"),
    }))).toEqual(day("2026-07-15"));
  });
});

describe("runScheduledMarketDataPipeline", () => {
  it("runs all stages in order for a multi-day catch-up", async () => {
    const calls: string[] = [];
    const store = storeWithProgress([
      progress(),
      progress({
        latestEquityMarkDate: day("2026-07-15"),
        latestOptionMarkDate: day("2026-07-15"),
      }),
      progress({
        latestEquityMarkDate: day("2026-07-15"),
        latestOptionMarkDate: day("2026-07-15"),
        latestValueSnapshotDate: day("2026-07-15"),
      }),
    ]);
    const ingestEquity = vi.fn(async () => { calls.push("equity"); return equitySummary(); });
    const ingestOptions = vi.fn(async () => { calls.push("options"); return optionSummary(); });
    const backfillValues = vi.fn(async () => {
      calls.push("values");
      return { accountCount: 1, startDate: "2026-07-11", endDate: "2026-07-15", tradingDayCount: 3, snapshotsUpserted: 3, unpricedPositionCount: 0 };
    });
    const backfillExcursions = vi.fn(async () => {
      calls.push("excursions");
      return { lotCount: 2, excursionsUpserted: 2, pricedDays: 6, unpricedDays: 0, noMarkLotCount: 0 };
    });

    const result = await runScheduledMarketDataPipeline({
      now: new Date("2026-07-18T01:00:00.000Z"),
      store,
      ingestEquity,
      ingestOptions,
      backfillValues,
      backfillExcursions,
      logger: { log: vi.fn(), warn: vi.fn() },
      owner: "run-1",
    });

    expect(result.status).toBe("SUCCEEDED");
    expect(result.commonMarkDate).toBe("2026-07-15");
    expect(calls).toEqual(["equity", "options", "values", "excursions"]);
    expect(backfillValues).toHaveBeenCalledWith(expect.objectContaining({
      startDate: day("2026-07-11"),
      endDate: day("2026-07-15"),
    }));
    expect(backfillExcursions).toHaveBeenCalledWith(expect.objectContaining({
      includeOpen: true,
      endDate: day("2026-07-15"),
    }));
    expect(store.releaseLease).toHaveBeenCalledWith("run-1");
  });

  it("backfills from the earliest mark on a first run", async () => {
    const store = storeWithProgress([
      progress({
        earliestEquityMarkDate: null,
        earliestOptionMarkDate: null,
        latestEquityMarkDate: null,
        latestOptionMarkDate: null,
        latestValueSnapshotDate: null,
      }),
      progress({ latestValueSnapshotDate: null }),
      progress(),
    ]);
    const backfillValues = vi.fn(async () => ({
      accountCount: 1,
      startDate: "2026-01-02",
      endDate: "2026-07-10",
      tradingDayCount: 100,
      snapshotsUpserted: 100,
      unpricedPositionCount: 0,
    }));

    await runScheduledMarketDataPipeline({
      now: new Date("2026-07-18T01:00:00.000Z"),
      store,
      ingestEquity: vi.fn(async () => ({ ...equitySummary(), startDate: "2026-01-02" })),
      ingestOptions: vi.fn(async () => ({ ...optionSummary(), startDate: "2026-01-02" })),
      backfillValues,
      backfillExcursions: vi.fn(async () => ({ lotCount: 0, excursionsUpserted: 0, pricedDays: 0, unpricedDays: 0, noMarkLotCount: 0 })),
      logger: { log: vi.fn(), warn: vi.fn() },
    });

    expect(backfillValues).toHaveBeenCalledWith(expect.objectContaining({ startDate: day("2026-01-02") }));
  });

  it("returns a successful no-op when all sources and values are current", async () => {
    const current = progress({
      latestEquityMarkDate: day("2026-07-16"),
      latestOptionMarkDate: day("2026-07-16"),
      latestValueSnapshotDate: day("2026-07-16"),
    });
    const store = storeWithProgress([current, current]);
    const backfillValues = vi.fn();

    const result = await runScheduledMarketDataPipeline({
      now: new Date("2026-07-18T01:00:00.000Z"),
      store,
      backfillValues,
      logger: { log: vi.fn(), warn: vi.fn() },
    });

    expect(result.status).toBe("NOOP");
    expect(backfillValues).not.toHaveBeenCalled();
  });

  it("keeps a bounded recovery backfill within its explicit end date", async () => {
    const current = progress({
      latestEquityMarkDate: day("2026-07-16"),
      latestOptionMarkDate: day("2026-07-16"),
      latestValueSnapshotDate: day("2026-07-09"),
    });
    const final = progress({
      latestEquityMarkDate: day("2026-07-16"),
      latestOptionMarkDate: day("2026-07-16"),
      latestValueSnapshotDate: day("2026-07-10"),
    });
    const store = storeWithProgress([current, current, final]);
    const backfillValues = vi.fn(async () => ({
      accountCount: 1,
      startDate: "2026-07-01",
      endDate: "2026-07-10",
      tradingDayCount: 7,
      snapshotsUpserted: 7,
      unpricedPositionCount: 0,
    }));

    const result = await runScheduledMarketDataPipeline({
      now: new Date("2026-07-18T01:00:00.000Z"),
      startDate: day("2026-07-01"),
      endDate: day("2026-07-10"),
      store,
      ingestEquity: vi.fn(async () => ({ ...equitySummary(), startDate: "2026-07-01", endDate: "2026-07-10" })),
      ingestOptions: vi.fn(async () => ({ ...optionSummary(), startDate: "2026-07-01", endDate: "2026-07-10" })),
      backfillValues,
      backfillExcursions: vi.fn(async () => ({ lotCount: 0, excursionsUpserted: 0, pricedDays: 0, unpricedDays: 0, noMarkLotCount: 0 })),
      logger: { log: vi.fn(), warn: vi.fn() },
    });

    expect(result.commonMarkDate).toBe("2026-07-10");
    expect(backfillValues).toHaveBeenCalledWith(expect.objectContaining({ endDate: day("2026-07-10") }));
  });

  it("skips without reading progress when another owner holds the lease", async () => {
    const store = storeWithProgress([], false);
    const result = await runScheduledMarketDataPipeline({ store, now: new Date("2026-07-18T01:00:00.000Z") });

    expect(result.status).toBe("SKIPPED_LOCKED");
    expect(store.loadProgress).not.toHaveBeenCalled();
    expect(store.releaseLease).not.toHaveBeenCalled();
  });

  it("stops downstream stages and releases the lease after ingestion failure", async () => {
    const store = storeWithProgress([progress()]);
    const ingestOptions = vi.fn();
    const backfillValues = vi.fn();

    await expect(runScheduledMarketDataPipeline({
      store,
      now: new Date("2026-07-18T01:00:00.000Z"),
      owner: "failed-run",
      ingestEquity: vi.fn().mockRejectedValue(new Error("provider unavailable")),
      ingestOptions,
      backfillValues,
      logger: { log: vi.fn(), warn: vi.fn() },
    })).rejects.toThrow("provider unavailable");

    expect(ingestOptions).not.toHaveBeenCalled();
    expect(backfillValues).not.toHaveBeenCalled();
    expect(store.releaseLease).toHaveBeenCalledWith("failed-run");
  });
});

describe("sanitizePipelineError", () => {
  it("redacts configured credentials", () => {
    expect(sanitizePipelineError(
      new Error("request failed using secret-value"),
      { AWS_SECRET_ACCESS_KEY: "secret-value" },
    )).toBe("request failed using [REDACTED]");
  });
});
