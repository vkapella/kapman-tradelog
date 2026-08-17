import type { ScheduledPipelineRun } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildFreshnessRecords,
  resolveSchedulerHealth,
  toFreshnessState,
  toSchedulerRunRecord,
} from "./scheduler-status";

function day(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function runRow(overrides: Partial<ScheduledPipelineRun> = {}): ScheduledPipelineRun {
  return {
    id: "run-1",
    jobName: "daily-market-data",
    trigger: "SCHEDULED",
    status: "SUCCEEDED",
    leaseOwner: "owner-1",
    leaseExpiresAt: day("2026-07-18"),
    startedAt: new Date("2026-07-18T02:00:00.000Z"),
    finishedAt: new Date("2026-07-18T02:04:00.000Z"),
    durationMs: 240000,
    requestedStartDate: null,
    requestedEndDate: null,
    effectiveStartDate: day("2026-07-11"),
    effectiveEndDate: day("2026-07-16"),
    eligibleEndDate: day("2026-07-16"),
    commonMarkDate: day("2026-07-16"),
    equityStatus: "SUCCEEDED",
    equityRowCount: 8,
    optionStatus: "SUCCEEDED",
    optionRowCount: 12,
    valuesStatus: "SKIPPED",
    valuesRowCount: null,
    excursionStatus: "SUCCEEDED",
    excursionRowCount: 4,
    latestEquityMarkDate: day("2026-07-16"),
    latestOptionMarkDate: day("2026-07-16"),
    latestValueSnapshotDate: day("2026-07-16"),
    unpricedPositionCount: 0,
    unpricedExcursionDays: 0,
    errorMessage: null,
    createdAt: new Date("2026-07-18T02:00:00.000Z"),
    updatedAt: new Date("2026-07-18T02:04:00.000Z"),
    ...overrides,
  } as ScheduledPipelineRun;
}

describe("toSchedulerRunRecord", () => {
  it("renders date-only fields without a time component", () => {
    const record = toSchedulerRunRecord(runRow());

    expect(record.commonMarkDate).toBe("2026-07-16");
    expect(record.effectiveStartDate).toBe("2026-07-11");
    expect(record.startedAt).toBe("2026-07-18T02:00:00.000Z");
  });

  it("exposes every stage with its label and row count", () => {
    const record = toSchedulerRunRecord(runRow());

    expect(record.stages).toEqual([
      { key: "equity", label: "Equity marks", status: "SUCCEEDED", rowCount: 8 },
      { key: "option", label: "Option marks", status: "SUCCEEDED", rowCount: 12 },
      { key: "values", label: "Account values", status: "SKIPPED", rowCount: null },
      { key: "excursion", label: "Lot excursions", status: "SUCCEEDED", rowCount: 4 },
    ]);
  });

  it("never leaks the lease owner or database bookkeeping columns", () => {
    const record = toSchedulerRunRecord(runRow()) as unknown as Record<string, unknown>;

    expect(record).not.toHaveProperty("leaseOwner");
    expect(record).not.toHaveProperty("jobName");
    expect(record).not.toHaveProperty("createdAt");
  });
});

describe("toFreshnessState", () => {
  const now = new Date("2026-08-16T12:00:00.000Z");

  it("reports MISSING when a source has no data", () => {
    expect(toFreshnessState(null, now, 4)).toBe("MISSING");
  });

  it("reports CURRENT at exactly the tolerance boundary", () => {
    expect(toFreshnessState(day("2026-08-12"), now, 4)).toBe("CURRENT");
  });

  it("reports STALE one day beyond tolerance", () => {
    expect(toFreshnessState(day("2026-08-11"), now, 4)).toBe("STALE");
  });
});

describe("buildFreshnessRecords", () => {
  it("reports lag per source in a stable order", () => {
    const records = buildFreshnessRecords(
      {
        equityMarks: day("2026-07-17"),
        optionMarks: day("2026-07-16"),
        accountValues: null,
      },
      new Date("2026-08-16T12:00:00.000Z"),
      4,
    );

    expect(records.map((entry) => entry.key)).toEqual(["equityMarks", "optionMarks", "accountValues"]);
    expect(records[0]).toEqual(expect.objectContaining({ lagDays: 30, state: "STALE" }));
    expect(records[2]).toEqual(expect.objectContaining({ latestDate: null, lagDays: null, state: "MISSING" }));
  });
});

describe("resolveSchedulerHealth", () => {
  const current = buildFreshnessRecords(
    {
      equityMarks: day("2026-08-15"),
      optionMarks: day("2026-08-15"),
      accountValues: day("2026-08-15"),
    },
    new Date("2026-08-16T12:00:00.000Z"),
    4,
  );
  const stale = buildFreshnessRecords(
    {
      equityMarks: day("2026-07-17"),
      optionMarks: day("2026-07-16"),
      accountValues: day("2026-07-17"),
    },
    new Date("2026-08-16T12:00:00.000Z"),
    4,
  );

  it("reports NEVER_RUN with no history", () => {
    expect(resolveSchedulerHealth(null, current)).toBe("NEVER_RUN");
  });

  it("reports HEALTHY when the last run succeeded and data is current", () => {
    expect(resolveSchedulerHealth({ status: "SUCCEEDED" }, current)).toBe("HEALTHY");
  });

  it("reports STALE when a succeeded run is followed by the scheduler going silent", () => {
    expect(resolveSchedulerHealth({ status: "SUCCEEDED" }, stale)).toBe("STALE");
  });

  it("reports FAILED for a failed or abandoned last run with current data", () => {
    expect(resolveSchedulerHealth({ status: "FAILED" }, current)).toBe("FAILED");
    expect(resolveSchedulerHealth({ status: "ABANDONED" }, current)).toBe("FAILED");
  });

  it("reports RUNNING while a run is in flight", () => {
    expect(resolveSchedulerHealth({ status: "RUNNING" }, current)).toBe("RUNNING");
  });
});
