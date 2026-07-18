import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { PrismaScheduledPipelineStore, resolveLatestCompleteValueSnapshotDate } from "./scheduled-pipeline-store";

function day(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

describe("resolveLatestCompleteValueSnapshotDate", () => {
  it("uses the oldest latest date when one account is current and two are stale", () => {
    expect(resolveLatestCompleteValueSnapshotDate(
      ["fidelity", "margin-1", "margin-2"],
      [
        { accountId: "fidelity", _max: { snapshotDate: day("2026-07-16") } },
        { accountId: "margin-1", _max: { snapshotDate: day("2026-06-12") } },
        { accountId: "margin-2", _max: { snapshotDate: day("2026-06-12") } },
      ],
    )).toEqual(day("2026-06-12"));
  });

  it("returns null when an active account has no value snapshots", () => {
    expect(resolveLatestCompleteValueSnapshotDate(
      ["fidelity", "margin-1"],
      [{ accountId: "fidelity", _max: { snapshotDate: day("2026-07-16") } }],
    )).toBeNull();
  });
});

describe("PrismaScheduledPipelineStore", () => {
  it("claims an expired lease after losing the create race", async () => {
    const create = vi.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError("unique", {
      code: "P2002",
      clientVersion: "5.14.0",
    }));
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const store = new PrismaScheduledPipelineStore({
      scheduledJobLease: {
        create,
        updateMany,
      },
    } as never);
    const now = new Date("2026-07-18T00:00:00.000Z");
    const expiresAt = new Date("2026-07-18T01:00:00.000Z");

    await expect(store.acquireLease("new-owner", now, expiresAt)).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        jobName: "daily-market-data",
        leaseExpiresAt: { lte: now },
      },
      data: {
        leaseOwner: "new-owner",
        leaseExpiresAt: expiresAt,
      },
    });
  });

  it("does not release a lease owned by another run", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const store = new PrismaScheduledPipelineStore({
      scheduledJobLease: { deleteMany },
    } as never);

    await store.releaseLease("my-owner");
    expect(deleteMany).toHaveBeenCalledWith({
      where: { jobName: "daily-market-data", leaseOwner: "my-owner" },
    });
  });

  it("reports portfolio snapshot progress from the stalest active account", async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce({ id: "equity-execution" })
      .mockResolvedValueOnce({ id: "option-execution" });
    const historicalFindFirst = vi.fn()
      .mockResolvedValueOnce({ markDate: day("2024-06-10") })
      .mockResolvedValueOnce({ markDate: day("2024-06-10") })
      .mockResolvedValueOnce({ markDate: day("2026-07-16") })
      .mockResolvedValueOnce({ markDate: day("2026-07-16") });
    const groupBy = vi.fn().mockResolvedValue([
      { accountId: "fidelity", _max: { snapshotDate: day("2026-07-16") } },
      { accountId: "margin-1", _max: { snapshotDate: day("2026-06-12") } },
      { accountId: "margin-2", _max: { snapshotDate: day("2026-06-12") } },
    ]);
    const store = new PrismaScheduledPipelineStore({
      execution: { findFirst },
      account: {
        findMany: vi.fn().mockResolvedValue([
          { id: "fidelity" },
          { id: "margin-1" },
          { id: "margin-2" },
        ]),
      },
      historicalMark: { findFirst: historicalFindFirst },
      accountValueSnapshot: { groupBy },
    } as never);

    await expect(store.loadProgress()).resolves.toEqual({
      hasEquityExecutions: true,
      hasOptionExecutions: true,
      earliestEquityMarkDate: day("2024-06-10"),
      earliestOptionMarkDate: day("2024-06-10"),
      latestEquityMarkDate: day("2026-07-16"),
      latestOptionMarkDate: day("2026-07-16"),
      latestValueSnapshotDate: day("2026-06-12"),
    });
    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { accountId: { in: ["fidelity", "margin-1", "margin-2"] } },
    }));
  });
});
