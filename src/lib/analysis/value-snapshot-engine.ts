import type { OpenPosition } from "@/types/api";

export interface HistoricalMarkValue {
  close: number;
}

export type HistoricalMarksByInstrument = Map<string, Map<string, HistoricalMarkValue>>;

export interface AccountValueForDateInput {
  holdings: OpenPosition[];
  marksByKey: HistoricalMarksByInstrument;
  cashValue: number;
  brokerNlv?: number | null;
  snapshotDate: Date;
  fallbackCalendarDays?: number;
}

export interface AccountValueForDateResult {
  cashValue: number;
  equityValue: number;
  optionValue: number;
  totalValue: number;
  brokerNlv: number | null;
  reconcileDelta: number | null;
  unpricedPositionCount: number;
  source: "RECONSTRUCTED";
}

const DEFAULT_FALLBACK_CALENDAR_DAYS = 10;

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function findMarkForDate(
  marksForInstrument: Map<string, HistoricalMarkValue> | undefined,
  targetDate: Date,
  fallbackCalendarDays: number,
): HistoricalMarkValue | null {
  if (!marksForInstrument) {
    return null;
  }

  const targetKey = dateKey(targetDate);
  const exact = marksForInstrument.get(targetKey);
  if (exact) {
    return exact;
  }

  const targetTime = targetDate.getTime();
  const fallbackWindowMs = fallbackCalendarDays * 24 * 60 * 60 * 1000;
  let bestKey: string | null = null;
  let bestMark: HistoricalMarkValue | null = null;

  for (const [markDateKey, mark] of Array.from(marksForInstrument.entries())) {
    if (markDateKey > targetKey) {
      continue;
    }

    const markTime = new Date(`${markDateKey}T00:00:00.000Z`).getTime();
    if (!Number.isFinite(markTime) || targetTime - markTime > fallbackWindowMs) {
      continue;
    }

    if (bestKey === null || markDateKey > bestKey) {
      bestKey = markDateKey;
      bestMark = mark;
    }
  }

  return bestMark;
}

function marketValueForHolding(holding: OpenPosition, mark: HistoricalMarkValue): number {
  const multiplier = holding.assetClass === "OPTION" ? 100 : 1;
  return mark.close * holding.netQty * multiplier;
}

export function computeAccountValueForDate(input: AccountValueForDateInput): AccountValueForDateResult {
  const fallbackCalendarDays = input.fallbackCalendarDays ?? DEFAULT_FALLBACK_CALENDAR_DAYS;
  let equityValue = 0;
  let optionValue = 0;
  let unpricedPositionCount = 0;

  for (const holding of input.holdings) {
    const mark = findMarkForDate(input.marksByKey.get(holding.instrumentKey), input.snapshotDate, fallbackCalendarDays);
    if (!mark) {
      unpricedPositionCount += 1;
      continue;
    }

    const marketValue = marketValueForHolding(holding, mark);
    if (holding.assetClass === "OPTION") {
      optionValue += marketValue;
    } else {
      equityValue += marketValue;
    }
  }

  const totalValue = input.cashValue + equityValue + optionValue;
  const brokerNlv = input.brokerNlv ?? null;

  return {
    cashValue: input.cashValue,
    equityValue,
    optionValue,
    totalValue,
    brokerNlv,
    reconcileDelta: brokerNlv === null ? null : brokerNlv - totalValue,
    unpricedPositionCount,
    source: "RECONSTRUCTED",
  };
}
