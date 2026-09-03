import { type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * How stale a daily close may be before it stops standing in for a live quote.
 *
 * The mark pipeline waits out a publication lag (2 days by default) and markets
 * close for long weekends, so the freshest available close is routinely several
 * days old. Beyond this window a price is old enough that reporting the position
 * as unpriced is more honest than valuing it.
 */
export const MAX_FALLBACK_MARK_AGE_DAYS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

export type MarkSource = "LIVE" | "HISTORICAL" | "PAR";

export interface FallbackMark {
  mark: number;
  markDate: string;
}

export interface HistoricalMarkRow {
  instrumentKey: string;
  markDate: Date;
  close: unknown;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function isMarkWithinFallbackWindow(markDate: Date, now: Date, maxAgeDays = MAX_FALLBACK_MARK_AGE_DAYS): boolean {
  const ageDays = (startOfUtcDay(now).getTime() - startOfUtcDay(markDate).getTime()) / DAY_MS;
  return ageDays >= 0 && ageDays <= maxAgeDays;
}

/**
 * Pick the newest eligible close per instrument. Rows are expected newest-first
 * per instrument; the first one inside the window wins.
 */
export function selectFallbackMarks(
  rows: HistoricalMarkRow[],
  now: Date,
  maxAgeDays = MAX_FALLBACK_MARK_AGE_DAYS,
): Map<string, FallbackMark> {
  const selected = new Map<string, FallbackMark>();

  for (const row of rows) {
    if (selected.has(row.instrumentKey) || !isMarkWithinFallbackWindow(row.markDate, now, maxAgeDays)) {
      continue;
    }

    // Number(null) and Number("") are both 0, so an absent close would become a
    // real mark of zero and value the position at nothing. Absent is not zero.
    if (row.close === null || row.close === undefined || row.close === "") {
      continue;
    }

    const close = Number(row.close);
    if (!Number.isFinite(close)) {
      continue;
    }

    selected.set(row.instrumentKey, {
      mark: close,
      markDate: row.markDate.toISOString().slice(0, 10),
    });
  }

  return selected;
}

/**
 * Load standby closes for instruments whose live quote is missing. Returns an
 * empty map when nothing is requested so the caller never needs a special case.
 */
export async function loadFallbackMarks(
  instrumentKeys: string[],
  now: Date,
  prismaClient: Pick<PrismaClient, "historicalMark"> = prisma,
  maxAgeDays = MAX_FALLBACK_MARK_AGE_DAYS,
): Promise<Map<string, FallbackMark>> {
  const uniqueKeys = Array.from(new Set(instrumentKeys.filter((key) => key.length > 0)));
  if (uniqueKeys.length === 0) {
    return new Map();
  }

  const earliest = new Date(startOfUtcDay(now).getTime() - maxAgeDays * DAY_MS);
  const rows = await prismaClient.historicalMark.findMany({
    where: {
      instrumentKey: { in: uniqueKeys },
      markDate: { gte: earliest, lte: startOfUtcDay(now) },
    },
    orderBy: { markDate: "desc" },
    select: { instrumentKey: true, markDate: true, close: true },
  });

  return selectFallbackMarks(rows, now, maxAgeDays);
}
