"use client";

import { useEffect, useState } from "react";
import { WidgetCard } from "@/components/widgets/WidgetCard";

interface StreakPayload {
  currentStreak: number;
  currentStreakType: "WIN" | "LOSS" | null;
  longestWinStreak: number;
  longestLossStreak: number;
}

interface ResponsePayload {
  data?: StreakPayload;
  currentStreak?: number;
  currentStreakType?: "WIN" | "LOSS" | null;
  longestWinStreak?: number;
  longestLossStreak?: number;
}

export function StreakWidget() {
  const [data, setData] = useState<StreakPayload | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      const response = await fetch("/api/overview/streaks", { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as ResponsePayload;
      const streak = payload.data
        ? payload.data
        : {
            currentStreak: payload.currentStreak ?? 0,
            currentStreakType: payload.currentStreakType ?? null,
            longestWinStreak: payload.longestWinStreak ?? 0,
            longestLossStreak: payload.longestLossStreak ?? 0,
          };

      if (!cancelled) {
        setData(streak);
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const headline = data
    ? data.currentStreakType === "WIN"
      ? data.currentStreak + "W"
      : data.currentStreakType === "LOSS"
        ? data.currentStreak + "L"
        : "0"
    : "—";

  return (
    <WidgetCard title="Win / Loss Streak">
      <p className={data?.currentStreakType === "WIN" ? "text-3xl font-bold text-accent-2" : "text-3xl font-bold text-red-300"}>{headline}</p>
      <p className="mt-2 text-xs text-muted">Longest win streak: {data?.longestWinStreak ?? 0}</p>
      <p className="text-xs text-muted">Longest loss streak: {data?.longestLossStreak ?? 0}</p>
    </WidgetCard>
  );
}
