import { PipelineAlertLifecycle, PipelineRunStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FRESHNESS_LAG_DAYS,
  dispatchPipelineAlerts,
  evaluatePipelineAlerts,
  lagInDays,
  resolveAlertConfig,
  shouldSendAlert,
  shouldSendRecovery,
  type PipelineAlert,
  type PipelineAlertConfig,
  type PipelineAlertStateRecord,
} from "./pipeline-alerts";

function day(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function config(overrides: Partial<PipelineAlertConfig> = {}): PipelineAlertConfig {
  return {
    webhookUrl: "https://alerts.example.com/hook",
    freshnessLagDays: DEFAULT_FRESHNESS_LAG_DAYS,
    lockContentionThreshold: 3,
    repeatMinutes: 720,
    timeoutMs: 10_000,
    ...overrides,
  };
}

function freshFreshness() {
  return {
    latestEquityMarkDate: day("2026-08-14"),
    latestOptionMarkDate: day("2026-08-14"),
    latestValueSnapshotDate: day("2026-08-14"),
  };
}

describe("resolveAlertConfig", () => {
  it("returns null when no webhook is configured", () => {
    expect(resolveAlertConfig({})).toBeNull();
    expect(resolveAlertConfig({ PIPELINE_ALERT_WEBHOOK_URL: "   " })).toBeNull();
  });

  it("applies defaults and overrides for optional tuning values", () => {
    expect(resolveAlertConfig({ PIPELINE_ALERT_WEBHOOK_URL: "https://hook" })).toEqual(expect.objectContaining({
      webhookUrl: "https://hook",
      freshnessLagDays: DEFAULT_FRESHNESS_LAG_DAYS,
      lockContentionThreshold: 3,
    }));
    expect(resolveAlertConfig({
      PIPELINE_ALERT_WEBHOOK_URL: "https://hook",
      PIPELINE_ALERT_FRESHNESS_LAG_DAYS: "10",
    })?.freshnessLagDays).toBe(10);
  });

  it("falls back to the default when a tuning value is not a positive integer", () => {
    expect(resolveAlertConfig({
      PIPELINE_ALERT_WEBHOOK_URL: "https://hook",
      PIPELINE_ALERT_FRESHNESS_LAG_DAYS: "-3",
    })?.freshnessLagDays).toBe(DEFAULT_FRESHNESS_LAG_DAYS);
  });
});

describe("lagInDays", () => {
  it("counts whole UTC days between the latest data and now", () => {
    expect(lagInDays(day("2026-07-17"), new Date("2026-08-16T23:00:00.000Z"))).toBe(30);
  });

  it("returns null when there is no data at all", () => {
    expect(lagInDays(null, new Date("2026-08-16T00:00:00.000Z"))).toBeNull();
  });
});

describe("evaluatePipelineAlerts", () => {
  const now = new Date("2026-08-16T02:00:00.000Z");

  it("fires a critical alert for a failed run", () => {
    const result = evaluatePipelineAlerts({
      now,
      runStatus: PipelineRunStatus.FAILED,
      errorMessage: "provider unavailable",
      freshness: freshFreshness(),
      config: config(),
    });

    expect(result.firing).toContainEqual(expect.objectContaining({
      key: "run-failed",
      severity: "critical",
      detail: "provider unavailable",
    }));
  });

  it("fires on freshness lag beyond tolerance and reports each source", () => {
    const result = evaluatePipelineAlerts({
      now,
      runStatus: PipelineRunStatus.SUCCEEDED,
      freshness: {
        latestEquityMarkDate: day("2026-07-17"),
        latestOptionMarkDate: day("2026-07-16"),
        latestValueSnapshotDate: day("2026-07-17"),
      },
      config: config(),
    });

    const alert = result.firing.find((entry) => entry.key === "freshness-lag");
    expect(alert).toBeDefined();
    expect(alert?.detail).toContain("Equity marks: 2026-07-17");
    expect(alert?.detail).toContain("Option marks: 2026-07-16");
    expect(result.resolved).not.toContain("freshness-lag");
  });

  it("treats a source with no data at all as a freshness failure", () => {
    const result = evaluatePipelineAlerts({
      now,
      runStatus: PipelineRunStatus.SUCCEEDED,
      freshness: { ...freshFreshness(), latestValueSnapshotDate: null },
      config: config(),
    });

    expect(result.firing.map((entry) => entry.key)).toContain("freshness-lag");
  });

  it("resolves failure and freshness once a run succeeds with current data", () => {
    const result = evaluatePipelineAlerts({
      now,
      runStatus: PipelineRunStatus.SUCCEEDED,
      freshness: freshFreshness(),
      config: config(),
    });

    expect(result.firing).toEqual([]);
    expect(result.resolved).toEqual(expect.arrayContaining(["run-failed", "freshness-lag", "lock-contention"]));
  });

  it("fires on lock contention only at or beyond the threshold", () => {
    const base = { now, runStatus: PipelineRunStatus.SKIPPED_LOCKED, freshness: freshFreshness(), config: config() };

    expect(evaluatePipelineAlerts({ ...base, consecutiveLockedCount: 2 }).firing.map((a) => a.key))
      .not.toContain("lock-contention");
    expect(evaluatePipelineAlerts({ ...base, consecutiveLockedCount: 3 }).firing.map((a) => a.key))
      .toContain("lock-contention");
  });

  it("fires when an abandoned run was recovered", () => {
    const result = evaluatePipelineAlerts({
      now,
      runStatus: PipelineRunStatus.SUCCEEDED,
      recoveredAbandonedCount: 2,
      freshness: freshFreshness(),
      config: config(),
    });

    expect(result.firing).toContainEqual(expect.objectContaining({ key: "run-abandoned" }));
    expect(result.resolved).not.toContain("run-abandoned");
  });
});

describe("shouldSendAlert", () => {
  const alert: PipelineAlert = {
    key: "run-failed",
    severity: "critical",
    title: "t",
    detail: "d",
    signature: "sig-1",
  };
  const now = new Date("2026-08-16T12:00:00.000Z");

  function state(overrides: Partial<PipelineAlertStateRecord> = {}): PipelineAlertStateRecord {
    return {
      alertKey: "run-failed",
      state: PipelineAlertLifecycle.FIRING,
      signature: "sig-1",
      lastSentAt: new Date("2026-08-16T11:00:00.000Z"),
      ...overrides,
    };
  }

  it("sends the first time an alert is seen", () => {
    expect(shouldSendAlert(undefined, alert, now, 720)).toBe(true);
  });

  it("suppresses an identical alert inside the repeat window", () => {
    expect(shouldSendAlert(state(), alert, now, 720)).toBe(false);
  });

  it("resends the same alert once the repeat window elapses", () => {
    expect(shouldSendAlert(state({ lastSentAt: new Date("2026-08-15T00:00:00.000Z") }), alert, now, 720)).toBe(true);
  });

  it("sends immediately when the condition materially changed", () => {
    expect(shouldSendAlert(state({ signature: "sig-0" }), alert, now, 720)).toBe(true);
  });

  it("sends again after the alert had been resolved", () => {
    expect(shouldSendAlert(state({ state: PipelineAlertLifecycle.RESOLVED }), alert, now, 720)).toBe(true);
  });
});

describe("shouldSendRecovery", () => {
  it("only notifies recovery for an alert that was actually firing", () => {
    expect(shouldSendRecovery(undefined)).toBe(false);
    expect(shouldSendRecovery({
      alertKey: "run-failed",
      state: PipelineAlertLifecycle.RESOLVED,
      signature: null,
      lastSentAt: new Date(),
    })).toBe(false);
    expect(shouldSendRecovery({
      alertKey: "run-failed",
      state: PipelineAlertLifecycle.FIRING,
      signature: null,
      lastSentAt: new Date(),
    })).toBe(true);
  });
});

describe("dispatchPipelineAlerts", () => {
  const now = new Date("2026-08-16T12:00:00.000Z");

  function stateStore(records: PipelineAlertStateRecord[] = []) {
    return {
      load: vi.fn().mockResolvedValue(records),
      markFiring: vi.fn().mockResolvedValue(undefined),
      markResolved: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("sends a firing alert and records its state", async () => {
    const store = stateStore();
    const transport = { send: vi.fn().mockResolvedValue(undefined) };

    const result = await dispatchPipelineAlerts({
      jobName: "daily-market-data",
      now,
      evaluation: {
        firing: [{ key: "run-failed", severity: "critical", title: "t", detail: "d", signature: "sig" }],
        resolved: [],
      },
      config: config(),
      stateStore: store,
      transport,
    });

    expect(result).toEqual({ sent: 1, recovered: 0 });
    expect(transport.send).toHaveBeenCalledWith(expect.objectContaining({ event: "firing", key: "run-failed" }));
    expect(store.markFiring).toHaveBeenCalled();
  });

  it("does not resend a duplicate alert inside the repeat window", async () => {
    const store = stateStore([{
      alertKey: "run-failed",
      state: PipelineAlertLifecycle.FIRING,
      signature: "sig",
      lastSentAt: new Date("2026-08-16T11:00:00.000Z"),
    }]);
    const transport = { send: vi.fn().mockResolvedValue(undefined) };

    const result = await dispatchPipelineAlerts({
      jobName: "daily-market-data",
      now,
      evaluation: {
        firing: [{ key: "run-failed", severity: "critical", title: "t", detail: "d", signature: "sig" }],
        resolved: [],
      },
      config: config(),
      stateStore: store,
      transport,
    });

    expect(result.sent).toBe(0);
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("sends one recovery notice for an alert that was firing", async () => {
    const store = stateStore([{
      alertKey: "freshness-lag",
      state: PipelineAlertLifecycle.FIRING,
      signature: "lag:30",
      lastSentAt: new Date("2026-08-15T00:00:00.000Z"),
    }]);
    const transport = { send: vi.fn().mockResolvedValue(undefined) };

    const result = await dispatchPipelineAlerts({
      jobName: "daily-market-data",
      now,
      evaluation: { firing: [], resolved: ["freshness-lag", "run-failed"] },
      config: config(),
      stateStore: store,
      transport,
    });

    expect(result.recovered).toBe(1);
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(transport.send).toHaveBeenCalledWith(expect.objectContaining({ event: "resolved", key: "freshness-lag" }));
    expect(store.markResolved).toHaveBeenCalledWith("daily-market-data", "freshness-lag", now);
  });

  it("never resolves a key that is firing in the same evaluation", async () => {
    const store = stateStore([{
      alertKey: "freshness-lag",
      state: PipelineAlertLifecycle.FIRING,
      signature: "lag:30",
      lastSentAt: new Date("2026-08-15T00:00:00.000Z"),
    }]);
    const transport = { send: vi.fn().mockResolvedValue(undefined) };

    await dispatchPipelineAlerts({
      jobName: "daily-market-data",
      now,
      evaluation: {
        firing: [{ key: "freshness-lag", severity: "critical", title: "t", detail: "d", signature: "lag:31" }],
        resolved: ["freshness-lag"],
      },
      config: config(),
      stateStore: store,
      transport,
    });

    expect(store.markResolved).not.toHaveBeenCalled();
  });

  it("keeps the pipeline healthy when alert delivery fails", async () => {
    const store = stateStore();
    const transport = { send: vi.fn().mockRejectedValue(new Error("webhook down")) };
    const logger = { log: vi.fn(), warn: vi.fn() };

    const result = await dispatchPipelineAlerts({
      jobName: "daily-market-data",
      now,
      evaluation: {
        firing: [{ key: "run-failed", severity: "critical", title: "t", detail: "d", signature: "sig" }],
        resolved: [],
      },
      config: config(),
      stateStore: store,
      transport,
      logger,
    });

    expect(result.sent).toBe(0);
    expect(store.markFiring).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});
