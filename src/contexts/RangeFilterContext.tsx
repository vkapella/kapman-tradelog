"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useProfileContextOptional } from "@/contexts/ProfileContext";
import type { ProfileRange, RangePreset } from "@/types/api";

export type { RangePreset };

export interface RangeFilterState {
  preset: RangePreset;
  startDate: string | null;
  endDate: string | null;
}

export interface RangeFilterContextValue {
  range: RangeFilterState;
  isHydrated: boolean;
  setPreset(preset: Exclude<RangePreset, "custom">): void;
  setCustomRange(startDate: string, endDate: string): void;
  displayText: string;
  applyRangeToSearchParams(params: URLSearchParams): void;
}

export const KAPMAN_START_DATE = "2025-09-02";
const ALL_TIME_RANGE: RangeFilterState = { preset: "all", startDate: null, endDate: null };

function toIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function computePresetRange(preset: Exclude<RangePreset, "custom">): RangeFilterState {
  if (preset === "kapman-start") {
    return {
      preset,
      startDate: KAPMAN_START_DATE,
      endDate: toIsoDate(new Date()),
    };
  }

  if (preset === "all") {
    return ALL_TIME_RANGE;
  }

  const today = new Date();
  const endDate = toIsoDate(today);
  const start = new Date(today);

  if (preset === "ytd") {
    return {
      preset,
      startDate: `${today.getFullYear()}-01-01`,
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

function getDefaultRange(): RangeFilterState {
  return computePresetRange("kapman-start");
}

/**
 * Profile canonical form -> runtime state: non-custom presets expand to the
 * computed daily window at use time (a "Kapman Start" saved today still
 * resolves to today's window tomorrow); custom carries its stored dates.
 */
function fromCanonicalRange(range: ProfileRange): RangeFilterState {
  if (range.preset === "custom" && range.startDate && range.endDate) {
    return { preset: "custom", startDate: range.startDate, endDate: range.endDate };
  }
  if (range.preset === "custom") {
    return getDefaultRange();
  }
  return computePresetRange(range.preset);
}

/** Runtime state -> canonical persisted form: non-custom stores null dates. */
function toCanonicalRange(state: RangeFilterState): ProfileRange {
  if (state.preset === "custom") {
    return { preset: "custom", startDate: state.startDate, endDate: state.endDate };
  }
  return { preset: state.preset, startDate: null, endDate: null };
}

function getDisplayText(preset: RangePreset): string {
  if (preset === "kapman-start") return "Kapman Start";
  if (preset === "all") return "All Time";
  if (preset === "ytd") return "YTD";
  if (preset === "1yr") return "1 yr";
  if (preset === "3yr") return "3 yr";
  if (preset === "30d") return "30d";
  if (preset === "7d") return "7d";
  return "Custom";
}

export const RangeFilterContext = React.createContext<RangeFilterContextValue>({
  range: getDefaultRange(),
  isHydrated: true,
  setPreset: () => {
    throw new Error("RangeFilterContext is not mounted.");
  },
  setCustomRange: () => {
    throw new Error("RangeFilterContext is not mounted.");
  },
  displayText: "Kapman Start",
  applyRangeToSearchParams: () => {
    throw new Error("RangeFilterContext is not mounted.");
  },
});

// Range persistence moved to the per-user profile (#344): the provider seeds
// from the profile's canonical range (the hydration barrier guarantees it is
// resolved before this mounts) and reports canonical form upward on every
// user change. The legacy kapman_range_filter localStorage key is gone.
export function RangeFilterProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const profile = useProfileContextOptional();
  const [range, setRange] = useState<RangeFilterState>(() =>
    profile ? fromCanonicalRange(profile.range) : getDefaultRange(),
  );

  // Re-seed only when the profile re-hydrates (initial load or reset) — never
  // on ordinary profile.range updates, which echo this provider's own reports.
  const hydrationGeneration = profile?.hydrationGeneration ?? 0;
  useEffect(() => {
    if (!profile) {
      return;
    }
    setRange(fromCanonicalRange(profile.range));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrationGeneration]);

  const reportRange = profile?.reportRange;

  const setPreset = useCallback(
    (preset: Exclude<RangePreset, "custom">) => {
      const next = computePresetRange(preset);
      setRange(next);
      reportRange?.(toCanonicalRange(next));
    },
    [reportRange],
  );

  const setCustomRange = useCallback(
    (startDate: string, endDate: string) => {
      const next: RangeFilterState = { preset: "custom", startDate, endDate };
      setRange(next);
      reportRange?.(toCanonicalRange(next));
    },
    [reportRange],
  );

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
      isHydrated: true,
      setPreset,
      setCustomRange,
      displayText: getDisplayText(range.preset),
      applyRangeToSearchParams,
    }),
    [range, setPreset, setCustomRange, applyRangeToSearchParams],
  );

  return <RangeFilterContext.Provider value={value}>{children}</RangeFilterContext.Provider>;
}
