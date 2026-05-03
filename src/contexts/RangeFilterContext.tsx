"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

export type RangePreset = "all" | "ytd" | "1yr" | "3yr" | "30d" | "7d" | "custom";

export interface RangeFilterState {
  preset: RangePreset;
  startDate: string | null;
  endDate: string | null;
}

export interface RangeFilterContextValue {
  range: RangeFilterState;
  setPreset(preset: Exclude<RangePreset, "custom">): void;
  setCustomRange(startDate: string, endDate: string): void;
  displayText: string;
  applyRangeToSearchParams(params: URLSearchParams): void;
}

const STORAGE_KEY = "kapman_range_filter";
const DEFAULT_RANGE: RangeFilterState = { preset: "all", startDate: null, endDate: null };

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function computePresetRange(preset: Exclude<RangePreset, "custom">): RangeFilterState {
  if (preset === "all") {
    return DEFAULT_RANGE;
  }

  const today = new Date();
  const endDate = toIsoDate(today);
  const start = new Date(today);

  if (preset === "ytd") {
    return {
      preset,
      startDate: `${today.getUTCFullYear()}-01-01`,
      endDate,
    };
  }

  const daysToSubtract = preset === "1yr" ? 365 : preset === "3yr" ? 1095 : preset === "30d" ? 30 : 7;
  start.setDate(start.getDate() - daysToSubtract);

  return {
    preset,
    startDate: toIsoDate(start),
    endDate,
  };
}

function parseStoredRange(raw: string | null): RangeFilterState {
  if (!raw) {
    return DEFAULT_RANGE;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<RangeFilterState>;
    if (!parsed || typeof parsed !== "object") {
      return DEFAULT_RANGE;
    }

    const preset = parsed.preset;
    if (preset !== "all" && preset !== "ytd" && preset !== "1yr" && preset !== "3yr" && preset !== "30d" && preset !== "7d" && preset !== "custom") {
      return DEFAULT_RANGE;
    }

    return {
      preset,
      startDate: typeof parsed.startDate === "string" ? parsed.startDate : null,
      endDate: typeof parsed.endDate === "string" ? parsed.endDate : null,
    };
  } catch {
    return DEFAULT_RANGE;
  }
}

function getDisplayText(preset: RangePreset): string {
  if (preset === "all") return "All Time";
  if (preset === "ytd") return "YTD";
  if (preset === "1yr") return "1 yr";
  if (preset === "3yr") return "3 yr";
  if (preset === "30d") return "30d";
  if (preset === "7d") return "7d";
  return "Custom";
}

export const RangeFilterContext = React.createContext<RangeFilterContextValue>({
  range: DEFAULT_RANGE,
  setPreset: () => {
    throw new Error("RangeFilterContext is not mounted.");
  },
  setCustomRange: () => {
    throw new Error("RangeFilterContext is not mounted.");
  },
  displayText: "All Time",
  applyRangeToSearchParams: () => {
    throw new Error("RangeFilterContext is not mounted.");
  },
});

export function RangeFilterProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [range, setRange] = useState<RangeFilterState>(DEFAULT_RANGE);

  useEffect(() => {
    const restored = parseStoredRange(window.localStorage.getItem(STORAGE_KEY));
    setRange(restored);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(range));
  }, [range]);

  const setPreset = useCallback((preset: Exclude<RangePreset, "custom">) => {
    setRange(computePresetRange(preset));
  }, []);

  const setCustomRange = useCallback((startDate: string, endDate: string) => {
    setRange({
      preset: "custom",
      startDate,
      endDate,
    });
  }, []);

  const applyRangeToSearchParams = useCallback((params: URLSearchParams) => {
    const computedRange = range.preset === "custom" ? range : computePresetRange(range.preset);
    if (computedRange.preset === "all") {
      return;
    }

    if (computedRange.startDate && computedRange.endDate) {
      params.set("startDate", computedRange.startDate);
      params.set("endDate", computedRange.endDate);
    }
  }, [range]);

  const value = useMemo<RangeFilterContextValue>(
    () => ({
      range,
      setPreset,
      setCustomRange,
      displayText: getDisplayText(range.preset),
      applyRangeToSearchParams,
    }),
    [range, setPreset, setCustomRange, applyRangeToSearchParams],
  );

  return <RangeFilterContext.Provider value={value}>{children}</RangeFilterContext.Provider>;
}
