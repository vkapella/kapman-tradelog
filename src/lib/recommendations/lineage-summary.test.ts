import { describe, expect, it } from "vitest";
import {
  buildLineageSummaries,
  formatDispositionBreakdown,
  latestPass1Summary,
  type LineageGroupRow,
} from "@/lib/recommendations/lineage-summary";

const morningRun: LineageGroupRow[] = [
  { lineageId: "VS-20260823-1422-01", pass: "PASS1", disposition: "ELIGIBLE", rowCount: 11, maxAsOf: "2026-08-23T00:00:00.000Z" },
  { lineageId: "VS-20260823-1422-01", pass: "PASS1", disposition: "WAIT", rowCount: 60, maxAsOf: "2026-08-23T00:00:00.000Z" },
];

const eveningRun: LineageGroupRow[] = [
  { lineageId: "VS-20260823-1753-01", pass: "PASS1", disposition: "NO_TRADE", rowCount: 2, maxAsOf: "2026-08-23T00:00:00.000Z" },
  { lineageId: "VS-20260823-1753-01", pass: "PASS1", disposition: "WAIT", rowCount: 1, maxAsOf: "2026-08-23T00:00:00.000Z" },
];

const olderPass2Run: LineageGroupRow[] = [
  { lineageId: "VS-20260820-0900-01", pass: "PASS2", disposition: "VALIDATED", rowCount: 4, maxAsOf: "2026-08-20T00:00:00.000Z" },
  { lineageId: "VS-20260820-0900-01", pass: "PASS2", disposition: "FLAGGED", rowCount: 1, maxAsOf: "2026-08-20T00:00:00.000Z" },
];

describe("buildLineageSummaries", () => {
  it("aggregates counts per lineage across pass/disposition groups", () => {
    const [summary] = buildLineageSummaries(morningRun);

    expect(summary.lineageId).toBe("VS-20260823-1422-01");
    expect(summary.rowCount).toBe(71);
    expect(summary.passes).toEqual({ PASS1: 71 });
    expect(summary.dispositions).toEqual({ ELIGIBLE: 11, WAIT: 60 });
    expect(summary.asOf).toBe("2026-08-23T00:00:00.000Z");
  });

  it("orders runs newest first, breaking same-day ties by lineage id", () => {
    const summaries = buildLineageSummaries([...olderPass2Run, ...morningRun, ...eveningRun]);

    expect(summaries.map((summary) => summary.lineageId)).toEqual([
      "VS-20260823-1753-01",
      "VS-20260823-1422-01",
      "VS-20260820-0900-01",
    ]);
  });

  it("accepts Date values and sorts lineages with no asOf last", () => {
    const summaries = buildLineageSummaries([
      { lineageId: "VS-20260101-0001-01", pass: "PASS1", disposition: "WAIT", rowCount: 1, maxAsOf: null },
      { lineageId: "VS-20260823-1422-01", pass: "PASS1", disposition: "WAIT", rowCount: 1, maxAsOf: new Date("2026-08-23T00:00:00.000Z") },
    ]);

    expect(summaries.map((summary) => summary.lineageId)).toEqual(["VS-20260823-1422-01", "VS-20260101-0001-01"]);
    expect(summaries[1].asOf).toBeNull();
  });
});

describe("formatDispositionBreakdown", () => {
  it("lists non-zero dispositions in canonical order", () => {
    expect(formatDispositionBreakdown({ WAIT: 60, ELIGIBLE: 11 })).toBe("11 ELIGIBLE · 60 WAIT");
    expect(formatDispositionBreakdown({ WAIT: 1, NO_TRADE: 2 })).toBe("2 NO_TRADE · 1 WAIT");
  });

  it("omits zero counts and keeps unknown dispositions visible", () => {
    expect(formatDispositionBreakdown({ ELIGIBLE: 0, WAIT: 3, SOMETHING_NEW: 2 })).toBe("3 WAIT · 2 SOMETHING_NEW");
  });

  it("renders an em dash placeholder when nothing is countable", () => {
    expect(formatDispositionBreakdown({})).toBe("—");
  });
});

describe("latestPass1Summary", () => {
  it("returns the newest run containing PASS1 rows", () => {
    const summaries = buildLineageSummaries([...olderPass2Run, ...morningRun, ...eveningRun]);
    expect(latestPass1Summary(summaries)?.lineageId).toBe("VS-20260823-1753-01");
  });

  it("skips runs that are PASS2-only", () => {
    const summaries = buildLineageSummaries(olderPass2Run);
    expect(latestPass1Summary(summaries)).toBeNull();
  });
});
