import React from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RANGE_PRESETS } from "@/components/range-selector";
import { computePresetRange, KAPMAN_START_DATE, RangeFilterContext, RangeFilterProvider } from "./RangeFilterContext";

function ContextReader() {
  return (
    <RangeFilterContext.Consumer>
      {(value) => <span>{value.displayText}</span>}
    </RangeFilterContext.Consumer>
  );
}

describe("RangeFilterProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("mounts and provides default Kapman Start label", () => {
    const html = renderToString(
      <RangeFilterProvider>
        <ContextReader />
      </RangeFilterProvider>,
    );

    expect(html).toContain("Kapman Start");
  });

  it("computes Kapman Start from September 2, 2025 through the current date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-29T14:30:00.000Z"));

    expect(computePresetRange("kapman-start")).toEqual({
      preset: "kapman-start",
      startDate: KAPMAN_START_DATE,
      endDate: "2026-05-29",
    });
  });

  it("lists Kapman Start first before All Time", () => {
    expect(RANGE_PRESETS.slice(0, 2)).toEqual([
      { value: "kapman-start", label: "Kapman Start" },
      { value: "all", label: "All Time" },
    ]);
  });
});
