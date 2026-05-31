import { describe, expect, it } from "vitest";
import { resolvePolygonHistoricalAccessStartDate } from "./ingest-option-marks";

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

describe("resolvePolygonHistoricalAccessStartDate", () => {
  it("defaults to the first day after the two-year rolling boundary", () => {
    const result = resolvePolygonHistoricalAccessStartDate(new Date("2026-05-31T12:00:00.000Z"), {});

    expect(dateOnly(result)).toBe("2024-06-01");
  });

  it("uses an explicit configured access start date when provided", () => {
    const result = resolvePolygonHistoricalAccessStartDate(new Date("2026-05-31T12:00:00.000Z"), {
      POLYGON_HISTORICAL_MARKS_START_DATE: "2025-01-15",
    });

    expect(dateOnly(result)).toBe("2025-01-15");
  });

  it("supports a configurable lookback window", () => {
    const result = resolvePolygonHistoricalAccessStartDate(new Date("2026-05-31T12:00:00.000Z"), {
      POLYGON_HISTORICAL_LOOKBACK_YEARS: "1",
    });

    expect(dateOnly(result)).toBe("2025-06-01");
  });

  it("rejects malformed configuration", () => {
    expect(() =>
      resolvePolygonHistoricalAccessStartDate(new Date("2026-05-31T12:00:00.000Z"), {
        POLYGON_HISTORICAL_MARKS_START_DATE: "05/31/2024",
      }),
    ).toThrow(/POLYGON_HISTORICAL_MARKS_START_DATE/);

    expect(() =>
      resolvePolygonHistoricalAccessStartDate(new Date("2026-05-31T12:00:00.000Z"), {
        POLYGON_HISTORICAL_LOOKBACK_YEARS: "0",
      }),
    ).toThrow(/POLYGON_HISTORICAL_LOOKBACK_YEARS/);
  });
});
