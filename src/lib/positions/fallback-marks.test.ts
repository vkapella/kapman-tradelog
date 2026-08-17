import { describe, expect, it, vi } from "vitest";
import {
  MAX_FALLBACK_MARK_AGE_DAYS,
  isMarkWithinFallbackWindow,
  loadFallbackMarks,
  selectFallbackMarks,
} from "./fallback-marks";

function day(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

const now = new Date("2026-08-17T14:30:00.000Z");

describe("isMarkWithinFallbackWindow", () => {
  it("accepts today and the edge of the window", () => {
    expect(isMarkWithinFallbackWindow(day("2026-08-17"), now)).toBe(true);
    expect(isMarkWithinFallbackWindow(day("2026-08-07"), now)).toBe(true);
  });

  it("rejects a close older than the window", () => {
    expect(isMarkWithinFallbackWindow(day("2026-08-06"), now)).toBe(false);
    expect(isMarkWithinFallbackWindow(day("2026-05-01"), now)).toBe(false);
  });

  it("rejects a future-dated mark", () => {
    expect(isMarkWithinFallbackWindow(day("2026-08-18"), now)).toBe(false);
  });

  it("compares whole UTC days, ignoring intraday time", () => {
    expect(isMarkWithinFallbackWindow(day("2026-08-14"), new Date("2026-08-17T00:00:01.000Z"))).toBe(true);
  });
});

describe("selectFallbackMarks", () => {
  it("takes the newest eligible close per instrument", () => {
    const selected = selectFallbackMarks(
      [
        { instrumentKey: "SPY|CALL|650|2027-12-17", markDate: day("2026-08-14"), close: 175.5 },
        { instrumentKey: "SPY|CALL|650|2027-12-17", markDate: day("2026-08-13"), close: 171.2 },
      ],
      now,
    );

    expect(selected.get("SPY|CALL|650|2027-12-17")).toEqual({ mark: 175.5, markDate: "2026-08-14" });
  });

  it("keys equities by symbol and options by canonical key", () => {
    const selected = selectFallbackMarks(
      [
        { instrumentKey: "MTUM", markDate: day("2026-08-14"), close: 250.25 },
        { instrumentKey: "SPY|CALL|650|2027-12-17", markDate: day("2026-08-14"), close: 175.5 },
      ],
      now,
    );

    expect(selected.get("MTUM")?.mark).toBe(250.25);
    expect(selected.get("SPY|CALL|650|2027-12-17")?.mark).toBe(175.5);
  });

  it("omits an instrument whose only close is beyond the window", () => {
    const selected = selectFallbackMarks(
      [{ instrumentKey: "STALE", markDate: day("2026-05-01"), close: 10 }],
      now,
    );

    expect(selected.has("STALE")).toBe(false);
  });

  it("skips a close that is not a finite number", () => {
    const selected = selectFallbackMarks(
      [
        { instrumentKey: "BAD", markDate: day("2026-08-14"), close: null },
        { instrumentKey: "BAD", markDate: day("2026-08-13"), close: 12.5 },
      ],
      now,
    );

    // Falls through to the next usable close rather than dropping the instrument.
    expect(selected.get("BAD")).toEqual({ mark: 12.5, markDate: "2026-08-13" });
  });

  it("accepts a Prisma Decimal-like close", () => {
    const selected = selectFallbackMarks(
      [{ instrumentKey: "DEC", markDate: day("2026-08-14"), close: { toString: () => "42.75" } }],
      now,
    );

    expect(selected.get("DEC")?.mark).toBe(42.75);
  });
});

describe("loadFallbackMarks", () => {
  it("queries nothing when no instruments need a fallback", async () => {
    const findMany = vi.fn();

    await expect(loadFallbackMarks([], now, { historicalMark: { findMany } } as never)).resolves.toEqual(new Map());
    expect(findMany).not.toHaveBeenCalled();
  });

  it("bounds the query to the recency window and de-duplicates keys", async () => {
    const findMany = vi.fn().mockResolvedValue([]);

    await loadFallbackMarks(["MTUM", "MTUM", ""], now, { historicalMark: { findMany } } as never);

    const where = findMany.mock.calls[0][0].where as Record<string, { in?: string[]; gte?: Date; lte?: Date }>;
    expect(where.instrumentKey.in).toEqual(["MTUM"]);
    expect(where.markDate.gte).toEqual(day("2026-08-07"));
    expect(where.markDate.lte).toEqual(day("2026-08-17"));
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ markDate: "desc" });
  });

  it("returns the selected mark for a requested instrument", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { instrumentKey: "SPY|CALL|650|2027-12-17", markDate: day("2026-08-14"), close: 175.5 },
    ]);

    const result = await loadFallbackMarks(
      ["SPY|CALL|650|2027-12-17"],
      now,
      { historicalMark: { findMany } } as never,
    );

    expect(result.get("SPY|CALL|650|2027-12-17")).toEqual({ mark: 175.5, markDate: "2026-08-14" });
  });

  it("uses a ten-day window by default", () => {
    expect(MAX_FALLBACK_MARK_AGE_DAYS).toBe(10);
  });
});
