import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { PrismaScheduledPipelineStore } from "./scheduled-pipeline-store";

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
});
