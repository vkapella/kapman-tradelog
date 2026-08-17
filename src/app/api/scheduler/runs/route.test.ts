import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiListResponse, SchedulerRunRecord } from "@/types/api";

const schedulerRunsMocks = vi.hoisted(() => ({
  scheduledPipelineRun: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: schedulerRunsMocks }));

function day(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-1",
    jobName: "daily-market-data",
    trigger: "SCHEDULED",
    status: "FAILED",
    leaseOwner: "secret-owner-uuid",
    leaseExpiresAt: null,
    startedAt: new Date("2026-07-19T02:00:00.000Z"),
    finishedAt: new Date("2026-07-19T02:01:00.000Z"),
    durationMs: 60000,
    requestedStartDate: null,
    requestedEndDate: null,
    effectiveStartDate: null,
    effectiveEndDate: null,
    eligibleEndDate: day("2026-07-17"),
    commonMarkDate: null,
    equityStatus: "PENDING",
    equityRowCount: null,
    optionStatus: "PENDING",
    optionRowCount: null,
    valuesStatus: "PENDING",
    valuesRowCount: null,
    excursionStatus: "PENDING",
    excursionRowCount: null,
    latestEquityMarkDate: null,
    latestOptionMarkDate: null,
    latestValueSnapshotDate: null,
    unpricedPositionCount: null,
    unpricedExcursionDays: null,
    errorMessage: "provider unavailable",
    createdAt: new Date("2026-07-19T02:00:00.000Z"),
    updatedAt: new Date("2026-07-19T02:01:00.000Z"),
    ...overrides,
  };
}

async function callRoute(url: string): Promise<ApiListResponse<SchedulerRunRecord>> {
  const { GET } = await import("./route");
  const response = await GET(new Request(url));
  return (await response.json()) as ApiListResponse<SchedulerRunRecord>;
}

describe("GET /api/scheduler/runs", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns paginated run history with list meta", async () => {
    schedulerRunsMocks.scheduledPipelineRun.findMany.mockResolvedValue([runRow()]);
    schedulerRunsMocks.scheduledPipelineRun.count.mockResolvedValue(31);

    const body = await callRoute("http://localhost/api/scheduler/runs?page=2&pageSize=10");

    expect(body.meta).toEqual({ total: 31, page: 2, pageSize: 10 });
    expect(body.data[0]).toEqual(expect.objectContaining({
      id: "run-1",
      status: "FAILED",
      errorMessage: "provider unavailable",
    }));
    expect(schedulerRunsMocks.scheduledPipelineRun.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10,
      take: 10,
      orderBy: { startedAt: "desc" },
    }));
  });

  it("caps an oversized page size", async () => {
    schedulerRunsMocks.scheduledPipelineRun.findMany.mockResolvedValue([]);
    schedulerRunsMocks.scheduledPipelineRun.count.mockResolvedValue(0);

    const body = await callRoute("http://localhost/api/scheduler/runs?pageSize=5000");

    expect(body.meta.pageSize).toBe(100);
    expect(schedulerRunsMocks.scheduledPipelineRun.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  });

  it("returns an empty list rather than failing when there is no history", async () => {
    schedulerRunsMocks.scheduledPipelineRun.findMany.mockResolvedValue([]);
    schedulerRunsMocks.scheduledPipelineRun.count.mockResolvedValue(0);

    const body = await callRoute("http://localhost/api/scheduler/runs");

    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
  });

  it("does not leak the lease owner", async () => {
    schedulerRunsMocks.scheduledPipelineRun.findMany.mockResolvedValue([runRow()]);
    schedulerRunsMocks.scheduledPipelineRun.count.mockResolvedValue(1);

    const body = await callRoute("http://localhost/api/scheduler/runs");

    expect(JSON.stringify(body)).not.toContain("secret-owner-uuid");
  });
});
