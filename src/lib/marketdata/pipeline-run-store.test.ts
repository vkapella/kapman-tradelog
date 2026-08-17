import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_RUN_RETENTION_DAYS,
  PipelineRunStatus,
  PipelineRunTrigger,
  PipelineStageStatus,
  PrismaPipelineRunStore,
  isAbandonedRun,
  stageResult,
} from "./pipeline-run-store";

function at(value: string): Date {
  return new Date(value);
}

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    status: PipelineRunStatus.RUNNING,
    startedAt: at("2026-07-18T02:00:00.000Z"),
    leaseExpiresAt: at("2026-07-18T03:00:00.000Z"),
    ...overrides,
  } as never;
}

describe("stageResult", () => {
  it("marks a stage that never ran as SKIPPED with no row count", () => {
    expect(stageResult(null)).toEqual({ status: PipelineStageStatus.SKIPPED, rowCount: null });
  });

  it("takes the row count from the summary when the stage ran", () => {
    expect(stageResult({ rowsUpserted: 42 })).toEqual({
      status: PipelineStageStatus.SUCCEEDED,
      rowCount: 42,
    });
  });

  it("prefers an explicit row count over the summary field", () => {
    expect(stageResult({ rowsUpserted: 42 }, 7)).toEqual({
      status: PipelineStageStatus.SUCCEEDED,
      rowCount: 7,
    });
  });
});

describe("isAbandonedRun", () => {
  const graceMs = 6 * 60 * 60 * 1000;

  it("treats a RUNNING row past its lease expiry as abandoned", () => {
    expect(isAbandonedRun(runRow(), at("2026-07-18T03:00:01.000Z"), graceMs)).toBe(true);
  });

  it("leaves a RUNNING row inside its lease alone", () => {
    expect(isAbandonedRun(runRow(), at("2026-07-18T02:30:00.000Z"), graceMs)).toBe(false);
  });

  it("falls back to the grace window when the lease expiry is missing", () => {
    const row = runRow({ leaseExpiresAt: null });
    expect(isAbandonedRun(row, at("2026-07-18T07:59:00.000Z"), graceMs)).toBe(false);
    expect(isAbandonedRun(row, at("2026-07-18T08:01:00.000Z"), graceMs)).toBe(true);
  });

  it("never reclassifies an already finalized run", () => {
    const row = runRow({ status: PipelineRunStatus.FAILED });
    expect(isAbandonedRun(row, at("2027-01-01T00:00:00.000Z"), graceMs)).toBe(false);
  });
});

describe("PrismaPipelineRunStore", () => {
  it("writes a RUNNING row before work begins and returns its id", async () => {
    const create = vi.fn().mockResolvedValue({ id: "run-1" });
    const store = new PrismaPipelineRunStore({ scheduledPipelineRun: { create } } as never);

    const runId = await store.startRun({
      jobName: "daily-market-data",
      trigger: PipelineRunTrigger.SCHEDULED,
      leaseOwner: "owner-1",
      leaseExpiresAt: at("2026-07-18T03:00:00.000Z"),
      startedAt: at("2026-07-18T02:00:00.000Z"),
      eligibleEndDate: at("2026-07-16T00:00:00.000Z"),
    });

    expect(runId).toBe("run-1");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        jobName: "daily-market-data",
        status: PipelineRunStatus.RUNNING,
        leaseOwner: "owner-1",
      }),
    }));
  });

  it("computes duration from the persisted start time when finalizing", async () => {
    const findUnique = vi.fn().mockResolvedValue({ startedAt: at("2026-07-18T02:00:00.000Z") });
    const update = vi.fn().mockResolvedValue({});
    const store = new PrismaPipelineRunStore({
      scheduledPipelineRun: { findUnique, update },
    } as never);

    await store.finalizeRun({
      runId: "run-1",
      status: PipelineRunStatus.SUCCEEDED,
      finishedAt: at("2026-07-18T02:05:00.000Z"),
      equity: { status: PipelineStageStatus.SUCCEEDED, rowCount: 8 },
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "run-1" },
      data: expect.objectContaining({
        status: PipelineRunStatus.SUCCEEDED,
        durationMs: 5 * 60 * 1000,
        equityStatus: PipelineStageStatus.SUCCEEDED,
        equityRowCount: 8,
      }),
    }));
  });

  it("leaves stage columns untouched when a stage result is not supplied", async () => {
    const findUnique = vi.fn().mockResolvedValue({ startedAt: at("2026-07-18T02:00:00.000Z") });
    const update = vi.fn().mockResolvedValue({});
    const store = new PrismaPipelineRunStore({
      scheduledPipelineRun: { findUnique, update },
    } as never);

    await store.finalizeRun({
      runId: "run-1",
      status: PipelineRunStatus.SKIPPED_LOCKED,
      finishedAt: at("2026-07-18T02:00:01.000Z"),
    });

    const data = update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty("equityStatus");
    expect(data).not.toHaveProperty("valuesStatus");
  });

  it("recovers abandoned runs by lease expiry or start-time grace window", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const store = new PrismaPipelineRunStore({
      scheduledPipelineRun: { updateMany },
    } as never);
    const now = at("2026-08-16T00:00:00.000Z");

    await expect(store.recoverAbandonedRuns("daily-market-data", now)).resolves.toBe(2);

    const where = updateMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.status).toBe(PipelineRunStatus.RUNNING);
    expect(where.OR).toEqual([
      { leaseExpiresAt: { lte: now } },
      { leaseExpiresAt: null, startedAt: { lte: at("2026-08-15T18:00:00.000Z") } },
    ]);
    expect(updateMany.mock.calls[0][0].data).toEqual(expect.objectContaining({
      status: PipelineRunStatus.ABANDONED,
      finishedAt: now,
    }));
  });

  it("prunes only finalized runs older than the retention window", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 5 });
    const store = new PrismaPipelineRunStore({
      scheduledPipelineRun: { deleteMany },
    } as never);

    await expect(
      store.pruneRuns("daily-market-data", at("2026-08-16T00:00:00.000Z"), DEFAULT_RUN_RETENTION_DAYS),
    ).resolves.toBe(5);

    const where = deleteMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.startedAt).toEqual({ lt: at("2026-05-18T00:00:00.000Z") });
    expect(where.status).toEqual({ in: expect.not.arrayContaining([PipelineRunStatus.RUNNING]) });
  });

  it("does not prune when retention is disabled", async () => {
    const deleteMany = vi.fn();
    const store = new PrismaPipelineRunStore({
      scheduledPipelineRun: { deleteMany },
    } as never);

    await expect(store.pruneRuns("daily-market-data", at("2026-08-16T00:00:00.000Z"), 0)).resolves.toBe(0);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("pages run history newest first", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(31);
    const store = new PrismaPipelineRunStore({
      scheduledPipelineRun: { findMany, count },
    } as never);

    await expect(store.listRuns({ jobName: "daily-market-data", page: 3, pageSize: 10 }))
      .resolves.toEqual({ rows: [], total: 31 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: { startedAt: "desc" },
      skip: 20,
      take: 10,
    }));
  });
});

describe("PrismaPipelineRunStore.latestHealthyRun", () => {
  it("counts a NOOP as healthy alongside SUCCEEDED", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const store = new PrismaPipelineRunStore({ scheduledPipelineRun: { findFirst } } as never);

    await store.latestHealthyRun("daily-market-data");

    const where = findFirst.mock.calls[0][0].where as { status: { in: string[] } };
    expect(where.status.in).toEqual([PipelineRunStatus.SUCCEEDED, PipelineRunStatus.NOOP]);
    expect(findFirst.mock.calls[0][0].orderBy).toEqual({ startedAt: "desc" });
  });

  it("excludes failed, abandoned, locked, and in-flight runs", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const store = new PrismaPipelineRunStore({ scheduledPipelineRun: { findFirst } } as never);

    await store.latestHealthyRun("daily-market-data");

    const where = findFirst.mock.calls[0][0].where as { status: { in: string[] } };
    for (const excluded of [
      PipelineRunStatus.FAILED,
      PipelineRunStatus.ABANDONED,
      PipelineRunStatus.SKIPPED_LOCKED,
      PipelineRunStatus.RUNNING,
    ]) {
      expect(where.status.in).not.toContain(excluded);
    }
  });
});
