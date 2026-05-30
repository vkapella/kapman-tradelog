"use client";

import Link from "next/link";
import { useContext, useEffect, useMemo, useState } from "react";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { RangeFilterContext } from "@/contexts/RangeFilterContext";
import { fetchAllPages } from "@/lib/api/fetch-all-pages";
import { applyAccountIdsToSearchParams, isAccountInScope } from "@/lib/api/account-scope";
import { formatCurrency, safeNumber } from "@/components/widgets/utils";
import type { MatchedLotRecord } from "@/types/api";

interface CalendarDay {
  date: string;
  pnl: number;
  count: number;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toMonthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function normalizeUtcMidnight(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toMonthDate(month: string): Date {
  return new Date(`${month}-01T00:00:00.000Z`);
}

function addMonths(month: string, delta: number): string {
  const date = toMonthDate(month);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return toMonthKey(date);
}

function createDateRange(start: Date, end: Date): string[] {
  const result: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    result.push(toDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return result;
}

function resolveHeatLevel(value: number, maxAbs: number): number {
  if (value === 0 || maxAbs <= 0) {
    return 0;
  }

  const ratio = Math.min(1, Math.abs(value) / maxAbs);
  if (ratio < 0.25) {
    return 1;
  }
  if (ratio < 0.5) {
    return 2;
  }
  if (ratio < 0.75) {
    return 3;
  }
  return 4;
}

export function DailyPnlCalendarWidget() {
  const { selectedAccounts } = useAccountFilterContext();
  const { range, applyRangeToSearchParams } = useContext(RangeFilterContext);
  const [rows, setRows] = useState<MatchedLotRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(toMonthKey(new Date()));

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      setLoading(true);
      setError(null);

      try {
        const query = new URLSearchParams();
        applyAccountIdsToSearchParams(query, selectedAccounts);
        applyRangeToSearchParams(query);
        const payload = await fetchAllPages<MatchedLotRecord>("/api/matched-lots", query);
        if (!cancelled) {
          setRows(payload.data);
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setError("Unable to load daily matched-lot P&L.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadRows();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts, range.startDate, range.endDate, applyRangeToSearchParams]);

  const calendarDays = useMemo(() => {
    const grouped = new Map<string, CalendarDay>();

    for (const row of rows) {
      if (!row.closeTradeDate || !isAccountInScope(selectedAccounts, row.accountId)) {
        continue;
      }

      const date = row.closeTradeDate.slice(0, 10);
      const current = grouped.get(date) ?? { date, pnl: 0, count: 0 };
      current.pnl += safeNumber(row.realizedPnl);
      current.count += 1;
      grouped.set(date, current);
    }

    if (grouped.size === 0) {
      return [] as CalendarDay[];
    }

    const sortedKeys = Array.from(grouped.keys()).sort((left, right) => left.localeCompare(right));
    const firstDate = normalizeUtcMidnight(sortedKeys[0]);
    const lastDate = normalizeUtcMidnight(sortedKeys[sortedKeys.length - 1]);
    const dateKeys = createDateRange(firstDate, lastDate);

    return dateKeys.map((dateKey) => grouped.get(dateKey) ?? { date: dateKey, pnl: 0, count: 0 });
  }, [rows, selectedAccounts]);

  const maxAbsPnl = useMemo(() => {
    return Math.max(1, ...calendarDays.map((day) => Math.abs(day.pnl)));
  }, [calendarDays]);

  const availableMonths = useMemo(() => {
    return Array.from(new Set(calendarDays.map((day) => day.date.slice(0, 7)))).sort((left, right) => left.localeCompare(right));
  }, [calendarDays]);

  useEffect(() => {
    if (calendarDays.length === 0) {
      return;
    }

    const currentMonth = toMonthKey(new Date());
    const hasCurrentMonthData = availableMonths.includes(currentMonth);
    const defaultMonth = hasCurrentMonthData ? currentMonth : availableMonths[availableMonths.length - 1]!;

    setSelectedMonth((current) => (availableMonths.includes(current) ? current : defaultMonth));
  }, [calendarDays, availableMonths]);

  const monthDays = useMemo(() => {
    const monthStart = toMonthDate(selectedMonth);
    const monthEnd = new Date(monthStart);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
    monthEnd.setUTCDate(0);

    const monthDateKeys = createDateRange(monthStart, monthEnd);
    const dayByDate = new Map(calendarDays.map((day) => [day.date, day]));
    const firstDayOffset = monthStart.getUTCDay();
    const cells: Array<CalendarDay | null> = [];

    for (let index = 0; index < firstDayOffset; index += 1) {
      cells.push(null);
    }

    for (const dateKey of monthDateKeys) {
      cells.push(dayByDate.get(dateKey) ?? { date: dateKey, pnl: 0, count: 0 });
    }

    return cells;
  }, [calendarDays, selectedMonth]);

  const monthLabel = useMemo(() => {
    const monthDate = toMonthDate(selectedMonth);
    return monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  }, [selectedMonth]);

  return (
    <WidgetCard title="Daily P&L Calendar">
      {loading ? <p className="text-xs text-text-2">Loading daily P&amp;L…</p> : null}
      {error ? <p className="text-xs text-neg">{error}</p> : null}

      {!loading && !error && calendarDays.length === 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-text-2">No closed matched lots found for this scope.</p>
          <Link href="/imports" className="text-xs text-accent underline">
            Go to Imports &amp; Connections
          </Link>
        </div>
      ) : null}

      {!loading && !error && calendarDays.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setSelectedMonth((current) => addMonths(current, -1))}
                className="rounded border border-border bg-surface-2 px-2 py-1 text-xs text-text"
              >
                {"<"}
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setSelectedMonth((current) => addMonths(current, 1))}
                className="rounded border border-border bg-surface-2 px-2 py-1 text-xs text-text"
              >
                {">"}
              </button>
            </div>
            <p className="text-xs text-text">{monthLabel}</p>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="rounded border border-border bg-surface-2 px-2 py-1 text-xs text-text"
            />
          </div>
          <div className="grid grid-cols-7 gap-1 text-[10px] text-text-3">
            {WEEKDAY_LABELS.map((label) => (
              <p key={label} className="px-1 text-center">
                {label}
              </p>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((day, dayIndex) => {
              if (!day) {
                return <div key={`blank-${String(dayIndex)}`} className="rounded border border-transparent px-1 py-1 text-center text-[10px]" />;
              }

              const level = resolveHeatLevel(day.pnl, maxAbsPnl);
              const toneClassName =
                level === 0
                  ? "bg-surface-2 text-text-3"
                  : day.pnl > 0
                    ? level >= 3
                      ? "bg-pos text-bg"
                      : "bg-[color:color-mix(in_srgb,var(--pos)_50%,var(--surface-2))] text-text"
                    : level >= 3
                      ? "bg-neg text-bg"
                      : "bg-[color:color-mix(in_srgb,var(--neg)_50%,var(--surface-2))] text-text";

              return (
                <Link
                  key={day.date}
                  href={`/trade-records?tab=matched-lots&date_from=${day.date}&date_to=${day.date}`}
                  title={`${day.date} · ${formatCurrency(day.pnl)} · ${day.count} lot${day.count === 1 ? "" : "s"}`}
                  className={`rounded border border-border px-1 py-1 text-center text-[10px] ${toneClassName}`}
                >
                  <div>{day.date.slice(8, 10)}</div>
                </Link>
              );
            })}
          </div>
          <p className="text-[10px] text-text-3">Click a day to open matched lots closed on that date.</p>
        </div>
      ) : null}
    </WidgetCard>
  );
}
