import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  HEALTH_COPY,
  describeMonitoring,
  SchedulerStatusBody,
  formatDuration,
  formatLag,
  formatTimestamp,
  freshnessTone,
} from "./scheduler-status-panel";
import type { SchedulerFreshnessRecord, SchedulerHealth, SchedulerStatusResponse } from "@/types/api";

describe("formatDuration", () => {
  it("renders sub-second, second, and minute scales", () => {
    expect(formatDuration(240)).toBe("240ms");
    expect(formatDuration(4000)).toBe("4s");
    expect(formatDuration(65000)).toBe("1m 5s");
    expect(formatDuration(120000)).toBe("2m");
  });

  it("renders a placeholder when duration is unknown", () => {
    expect(formatDuration(null)).toBe("—");
  });
});

describe("formatLag", () => {
  it("distinguishes current, singular, plural, and missing data", () => {
    expect(formatLag(0)).toBe("current");
    expect(formatLag(1)).toBe("1 day behind");
    expect(formatLag(30)).toBe("30 days behind");
    expect(formatLag(null)).toBe("no data");
  });
});

describe("formatTimestamp", () => {
  it("renders an ISO instant as a readable UTC stamp", () => {
    expect(formatTimestamp("2026-07-19T02:04:00.000Z")).toBe("2026-07-19 02:04:00 UTC");
    expect(formatTimestamp(null)).toBe("—");
  });
});

describe("freshnessTone", () => {
  function record(state: SchedulerFreshnessRecord["state"]): SchedulerFreshnessRecord {
    return { key: "equityMarks", label: "Equity marks", latestDate: null, lagDays: null, state };
  }

  it("uses distinct tones for current, stale, and missing sources", () => {
    expect(freshnessTone(record("CURRENT"))).toBe("text-pos");
    expect(freshnessTone(record("STALE"))).toBe("text-warn");
    expect(freshnessTone(record("MISSING"))).toBe("text-neg");
  });
});

describe("HEALTH_COPY", () => {
  it("offers a next action for every state that needs operator attention", () => {
    const needsAction: SchedulerHealth[] = ["RUNNING", "STALE", "FAILED", "NEVER_RUN"];
    for (const health of needsAction) {
      expect(HEALTH_COPY[health].nextAction, `${health} should tell the operator what to do`).toBeTruthy();
    }
    expect(HEALTH_COPY.HEALTHY.nextAction).toBeNull();
  });
});

function statusPayload(overrides: Partial<SchedulerStatusResponse> = {}): SchedulerStatusResponse {
  return {
    jobName: "daily-market-data",
    checkedAt: "2026-08-16T12:00:00.000Z",
    health: "HEALTHY",
    lastRun: {
      id: "run-1",
      trigger: "SCHEDULED",
      status: "SUCCEEDED",
      startedAt: "2026-08-16T02:00:00.000Z",
      finishedAt: "2026-08-16T02:04:00.000Z",
      durationMs: 240000,
      requestedStartDate: null,
      requestedEndDate: null,
      effectiveStartDate: "2026-08-11",
      effectiveEndDate: "2026-08-14",
      eligibleEndDate: "2026-08-14",
      commonMarkDate: "2026-08-14",
      stages: [
        { key: "equity", label: "Equity marks", status: "SUCCEEDED", rowCount: 8 },
        { key: "option", label: "Option marks", status: "SUCCEEDED", rowCount: 12 },
        { key: "values", label: "Account values", status: "SUCCEEDED", rowCount: 3 },
        { key: "excursion", label: "Lot excursions", status: "SKIPPED", rowCount: null },
      ],
      latestEquityMarkDate: "2026-08-14",
      latestOptionMarkDate: "2026-08-14",
      latestValueSnapshotDate: "2026-08-14",
      unpricedPositionCount: 0,
      unpricedExcursionDays: 0,
      errorMessage: null,
    },
    lastHealthyRun: null,
    freshness: [
      { key: "equityMarks", label: "Equity marks", latestDate: "2026-08-14", lagDays: 2, state: "CURRENT" },
      { key: "optionMarks", label: "Option marks", latestDate: "2026-08-14", lagDays: 2, state: "CURRENT" },
      { key: "accountValues", label: "Account values", latestDate: "2026-08-14", lagDays: 2, state: "CURRENT" },
    ],
    freshnessToleranceDays: 4,
    retentionDays: 90,
    alertsConfigured: false,
    heartbeatConfigured: false,
    activeLeaseExpiresAt: null,
    ...overrides,
  };
}

/** Strip the SSR text-boundary comments so assertions read as visible copy. */
function render(props: Parameters<typeof SchedulerStatusBody>[0]): string {
  return renderToString(React.createElement(SchedulerStatusBody, props)).replaceAll("<!-- -->", "");
}

describe("SchedulerStatusBody", () => {
  it("renders a loading placeholder while status is in flight", () => {
    const markup = render({ data: null, loading: true, error: null });

    expect(markup).toContain("Scheduled pipeline");
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain("Data freshness");
  });

  it("renders an error message without any status detail", () => {
    const markup = render({ data: null, loading: false, error: "Unable to load scheduler status." });

    expect(markup).toContain("Unable to load scheduler status.");
    expect(markup).not.toContain("Data freshness");
  });

  it("renders the empty state with a seeding next action when nothing has run", () => {
    const markup = render({
      data: statusPayload({ health: "NEVER_RUN", lastRun: null, lastHealthyRun: null }),
      loading: false,
      error: null,
    });

    expect(markup).toContain("No runs recorded");
    expect(markup).toContain("Next:");
    expect(markup).toContain("Never");
  });

  it("renders the populated healthy state with stages and no next action", () => {
    const markup = render({ data: statusPayload(), loading: false, error: null });

    expect(markup).toContain("Healthy");
    expect(markup).toContain("Data freshness");
    expect(markup).toContain("Lot excursions");
    expect(markup).toContain("8 rows");
    expect(markup).toContain("no rows");
    expect(markup).not.toContain("Next:");
  });

  it("renders the stale state with lag per source and a recovery action", () => {
    const markup = render({
      data: statusPayload({
        health: "STALE",
        freshness: [
          { key: "equityMarks", label: "Equity marks", latestDate: "2026-07-17", lagDays: 30, state: "STALE" },
          { key: "optionMarks", label: "Option marks", latestDate: "2026-07-16", lagDays: 31, state: "STALE" },
          { key: "accountValues", label: "Account values", latestDate: null, lagDays: null, state: "MISSING" },
        ],
      }),
      loading: false,
      error: null,
    });

    expect(markup).toContain("Stale data");
    expect(markup).toContain("30 days behind");
    expect(markup).toContain("no data");
    expect(markup).toContain("Next:");
  });

  it("renders the failed state with the sanitized message only", () => {
    const payload = statusPayload({ health: "FAILED" });
    const markup = render({
      data: {
        ...payload,
        lastRun: payload.lastRun ? { ...payload.lastRun, status: "FAILED", errorMessage: "provider unavailable" } : null,
      },
      loading: false,
      error: null,
    });

    expect(markup).toContain("Last run failed");
    expect(markup).toContain("Failure detail");
    expect(markup).toContain("provider unavailable");
  });

  it("reports how long history is kept", () => {
    expect(render({ data: statusPayload(), loading: false, error: null })).toContain("90 days");
  });

  it("labels the healthy-run card rather than calling it successful", () => {
    // A NOOP run is healthy; "Last successful run" beside a NOOP read as a
    // contradiction, and as "Never" whenever the last run was a NOOP.
    const markup = render({ data: statusPayload(), loading: false, error: null });

    expect(markup).toContain("Last healthy run");
    expect(markup).not.toContain("Last successful run");
  });

  it("warns in the panel when nothing is monitoring the pipeline", () => {
    const markup = render({ data: statusPayload(), loading: false, error: null });

    expect(markup).toContain("No heartbeat monitor or external alerts are configured");
    expect(markup).toContain("text-warn");
  });

  it("stops warning once a heartbeat monitor is configured", () => {
    const markup = render({
      data: statusPayload({ heartbeatConfigured: true }),
      loading: false,
      error: null,
    });

    expect(markup).toContain("Heartbeat monitor is configured");
    expect(markup).not.toContain("No heartbeat monitor");
  });
});

describe("describeMonitoring", () => {
  it("names both monitors when both are configured", () => {
    expect(describeMonitoring({ heartbeatConfigured: true, alertsConfigured: true }))
      .toBe("Heartbeat monitor and external alerts are configured.");
  });

  it("flags alerts-only as leaving the silent-failure case uncovered", () => {
    // Webhook alerts run inside the pipeline, so they cannot fire when it never runs.
    expect(describeMonitoring({ heartbeatConfigured: false, alertsConfigured: true }))
      .toContain("nothing will report a pipeline that stops running entirely");
  });

  it("states plainly when nothing is configured", () => {
    expect(describeMonitoring({ heartbeatConfigured: false, alertsConfigured: false }))
      .toContain("will not report itself");
  });
});
