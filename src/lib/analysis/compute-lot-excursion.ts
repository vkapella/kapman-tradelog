export type LotExcursionDirection = "LONG" | "SHORT";

export interface LotExcursionMark {
  high: number;
  low: number;
}

export type LotExcursionMarksByDate = Map<string, LotExcursionMark> | Record<string, LotExcursionMark>;

export interface ComputeLotExcursionInput {
  openTradeDate: Date;
  closeTradeDate: Date;
  entryPrice: number;
  closePrice?: number | null;
  quantity: number;
  direction: LotExcursionDirection;
  assetClass: string;
  marksByDate: LotExcursionMarksByDate;
  evaluationDateKeys?: string[];
  multiplier?: number;
}

export interface ComputedLotExcursion {
  mfe: number;
  mae: number;
  mfePct: number | null;
  maePct: number | null;
  mfeDate: string | null;
  maeDate: string | null;
  pricedDays: number;
  unpricedDays: number;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function enumerateCalendarDateKeys(startDate: Date, endDate: Date): string[] {
  const result: string[] = [];
  for (let cursor = startOfUtcDay(startDate); cursor.getTime() <= endDate.getTime(); cursor = addUtcDays(cursor, 1)) {
    result.push(dateKey(cursor));
  }
  return result;
}

function buildWindowDateKeys(input: ComputeLotExcursionInput): string[] {
  const startDate = startOfUtcDay(input.openTradeDate);
  const endDate = startOfUtcDay(input.closeTradeDate);
  const startKey = dateKey(startDate);
  const endKey = dateKey(endDate);

  if (!input.evaluationDateKeys) {
    return enumerateCalendarDateKeys(startDate, endDate);
  }

  return Array.from(new Set([...input.evaluationDateKeys, startKey, endKey]))
    .filter((key) => key >= startKey && key <= endKey)
    .sort();
}

function getMark(marksByDate: LotExcursionMarksByDate, key: string): LotExcursionMark | undefined {
  if (marksByDate instanceof Map) {
    return marksByDate.get(key);
  }

  return marksByDate[key];
}

function isUsableMark(mark: LotExcursionMark | undefined): mark is LotExcursionMark {
  return mark !== undefined
    && Number.isFinite(mark.high)
    && Number.isFinite(mark.low);
}

function getMultiplier(input: Pick<ComputeLotExcursionInput, "assetClass" | "multiplier">): number {
  if (input.multiplier && Number.isFinite(input.multiplier) && input.multiplier > 0) {
    return input.multiplier;
  }

  return input.assetClass === "OPTION" ? 100 : 1;
}

export function computeLotExcursion(input: ComputeLotExcursionInput): ComputedLotExcursion {
  const windowDateKeys = buildWindowDateKeys(input);
  const quantity = Math.abs(input.quantity);
  const multiplier = getMultiplier(input);
  const costBasis = Math.abs(input.entryPrice * quantity * multiplier);
  let mfe: number | null = null;
  let mae: number | null = null;
  let mfeDate: string | null = null;
  let maeDate: string | null = null;
  let pricedDays = 0;
  let unpricedDays = 0;

  function observeRange(high: number, low: number, key: string): void {
    const favorable = input.direction === "LONG"
      ? (high - input.entryPrice) * quantity * multiplier
      : (input.entryPrice - low) * quantity * multiplier;
    const adverse = input.direction === "LONG"
      ? (low - input.entryPrice) * quantity * multiplier
      : (input.entryPrice - high) * quantity * multiplier;

    if (mfe === null || favorable > mfe) {
      mfe = favorable;
      mfeDate = key;
    }

    if (mae === null || adverse < mae) {
      mae = adverse;
      maeDate = key;
    }
  }

  // Executions are observed prices inside the holding window even when provider bars lag.
  // They affect extrema without being counted as complete historical-mark coverage.
  if (Number.isFinite(input.entryPrice)) {
    observeRange(input.entryPrice, input.entryPrice, dateKey(input.openTradeDate));
  }

  for (const key of windowDateKeys) {
    const mark = getMark(input.marksByDate, key);
    if (!isUsableMark(mark)) {
      unpricedDays += 1;
      continue;
    }

    pricedDays += 1;
    observeRange(mark.high, mark.low, key);
  }

  if (input.closePrice !== null && input.closePrice !== undefined && Number.isFinite(input.closePrice)) {
    observeRange(input.closePrice, input.closePrice, dateKey(input.closeTradeDate));
  }

  return {
    mfe: mfe ?? 0,
    mae: mae ?? 0,
    mfePct: costBasis === 0 ? null : (mfe ?? 0) / costBasis,
    maePct: costBasis === 0 ? null : (mae ?? 0) / costBasis,
    mfeDate,
    maeDate,
    pricedDays,
    unpricedDays,
  };
}
