import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SchedulerStatusResponse } from "@/types/api";

const schedulerStatusMocks = vi.hoisted(() => ({
  scheduledPipelineRun: {
    findFirst: vi.fn(),
  },
  execution: { findFirst: vi.fn() },
  account: { findMany: vi.fn() },
  historicalMark: { findFirst: vi.fn() },
  accountValueSnapshot: { groupBy: vi.fn() },
  scheduledJobLease: { findFirst: vi.fn() },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: schedulerStatusMocks }));

function day(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-1",
    jobName: "daily-market-data",
    trigger: "SCHEDULED",
    status: "SUCCEEDED",
    leaseOwner: "secret-owner-uuid",
    leaseExpiresAt: null,
    startedAt: new Date("2026-07-19T02:00:00.000Z"),
    finishedAt: new Date("2026-07-19T02:04:00.000Z"),
    durationMs: 240000,
    requestedStartDate: null,
    requestedEndDate: null,
    effectiveStartDate: day("2026-07-11"),
    effectiveEndDate: day("2026-07-17"),
    eligibleEndDate: day("2026-07-17"),
    commonMarkDate: day("2026-07-17"),
    equityStatus: "SUCCEEDED",
    equityRowCount: 8,
    optionStatus: "SUCCEEDED",
    optionRowCount: 12,
    valuesStatus: "SUCCEEDED",
    valuesRowCount: 3,
    excursionStatus: "SUCCEEDED",
    excursionRowCount: 4,
    latestEquityMarkDate: day("2026-07-17"),
    latestOptionMarkDate: day("2026-07-16"),
    latestValueSnapshotDate: day("2026-07-17"),
    unpricedPositionCount: 0,
    unpricedExcursionDays: 0,
    errorMessage: null,
    createdAt: new Date("2026-07-19T02:00:00.000Z"),
    updatedAt: new Date("2026-07-19T02:04:00.000Z"),
    ...overrides,
  };
}

/** Progress reads used by PrismaScheduledPipelineStore.loadProgress(). */
function stubProgress(options: {
  equityMark: Date | null;
  optionMark: Date | null;
  valueSnapshot: Date | null;
}) {
  schedulerStatusMocks.execution.findFirst.mockResolvedValue({ id: "execution-1" });
  schedulerStatusMocks.account.findMany.mockResolvedValue([{ id: "account-1" }]);
  schedulerStatusMocks.historicalMark.findFirst.mockImplementation(async (args: {
    where: { assetClass: string };
    orderBy: { markDate: "asc" | "desc" };
  }) => {
    if (args.orderBy.markDate === "asc") {
      return { markDate: day("2026-01-02") };
    }
    const markDate = args.where.assetClass === "EQUITY" ? options.equityMark : options.optionMark;
    return markDate ? { markDate } : null;
  });
  schedulerStatusMocks.accountValueSnapshot.groupBy.mockResolvedValue(
    options.valueSnapshot ? [{ accountId: "account-1", _max: { snapshotDate: options.valueSnapshot } }] : [],
  );
  schedulerStatusMocks.scheduledJobLease.findFirst.mockResolvedValue(null);
}

async function callRoute(): Promise<SchedulerStatusResponse> {
  const { GET } = await import("./route");
  const response = await GET();
  const body = (await response.json()) as { data: SchedulerStatusResponse };
  return body.data;
}

describe("GET /api/scheduler/status", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("reports STALE when the scheduler stopped running but its last run succeeded", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T12:00:00.000Z"));
    schedulerStatusMocks.scheduledPipelineRun.findFirst.mockResolvedValue(runRow());
    stubProgress({
      equityMark: day("2026-07-17"),
      optionMark: day("2026-07-16"),
      valueSnapshot: day("2026-07-17"),
    });

    const data = await callRoute();

    expect(data.health).toBe("STALE");
    expect(data.lastRun?.status).toBe("SUCCEEDED");
    expect(data.freshness.find((entry) => entry.key === "equityMarks")).toEqual(expect.objectContaining({
      latestDate: "2026-07-17",
      lagDays: 30,
      state: "STALE",
    }));
  });

  it("reports HEALTHY when every source is inside tolerance", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T12:00:00.000Z"));
    schedulerStatusMocks.scheduledPipelineRun.findFirst.mockResolvedValue(runRow());
    stubProgress({
      equityMark: day("2026-07-17"),
      optionMark: day("2026-07-17"),
      valueSnapshot: day("2026-07-17"),
    });

    const data = await callRoute();

    expect(data.health).toBe("HEALTHY");
    expect(data.freshness.every((entry) => entry.state === "CURRENT")).toBe(true);
  });

  it("reports NEVER_RUN with no history and requires no account selection", async () => {
    schedulerStatusMocks.scheduledPipelineRun.findFirst.mockResolvedValue(null);
    stubProgress({ equityMark: null, optionMark: null, valueSnapshot: null });

    const data = await callRoute();

    expect(data.health).toBe("NEVER_RUN");
    expect(data.lastRun).toBeNull();
    expect(data.lastHealthyRun).toBeNull();
  });

  it("omits the lease owner from the response", async () => {
    schedulerStatusMocks.scheduledPipelineRun.findFirst.mockResolvedValue(runRow());
    stubProgress({ equityMark: day("2026-07-17"), optionMark: day("2026-07-17"), valueSnapshot: day("2026-07-17") });

    const data = await callRoute();

    expect(JSON.stringify(data)).not.toContain("secret-owner-uuid");
  });

  it("reports whether optional alerting is configured", async () => {
    schedulerStatusMocks.scheduledPipelineRun.findFirst.mockResolvedValue(runRow());
    stubProgress({ equityMark: day("2026-07-17"), optionMark: day("2026-07-17"), valueSnapshot: day("2026-07-17") });

    expect((await callRoute()).alertsConfigured).toBe(false);

    vi.stubEnv("PIPELINE_ALERT_WEBHOOK_URL", "https://alerts.example.com/hook");
    expect((await callRoute()).alertsConfigured).toBe(true);
  });

  it("reports whether the heartbeat monitor is configured, independently of alerts", async () => {
    schedulerStatusMocks.scheduledPipelineRun.findFirst.mockResolvedValue(runRow());
    stubProgress({ equityMark: day("2026-07-17"), optionMark: day("2026-07-17"), valueSnapshot: day("2026-07-17") });

    expect((await callRoute()).heartbeatConfigured).toBe(false);

    vi.stubEnv("PIPELINE_HEARTBEAT_URL", "https://hc-ping.com/uuid");
    const data = await callRoute();
    expect(data.heartbeatConfigured).toBe(true);
    expect(data.alertsConfigured).toBe(false);
  });

  it("treats a NOOP run as the last healthy run", async () => {
    // NOOP is the normal weekend result; excluding it reported "Never" on a
    // healthy install, which is what production showed right after deploy.
    schedulerStatusMocks.scheduledPipelineRun.findFirst.mockResolvedValue(runRow({ status: "NOOP" }));
    stubProgress({ equityMark: day("2026-07-17"), optionMark: day("2026-07-17"), valueSnapshot: day("2026-07-17") });

    const data = await callRoute();

    expect(data.lastRun?.status).toBe("NOOP");
    expect(data.lastHealthyRun?.status).toBe("NOOP");
  });
});
