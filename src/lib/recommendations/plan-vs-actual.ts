/**
 * Plan-vs-actual: join a validated Pass 2 recommendation to the imported
 * executions that (may) have taken it, and measure the fill against the
 * validated specification.
 *
 * The join keys are the ones KB_4.0_DESIGN §4 baked in: {ticker, strike,
 * expiration} plus an entry-date window anchored at the recommendation's
 * as_of date. The record exists because its absence has already cost money:
 * on 2026-08-07 an entry filled ~25% above its validated range with nothing
 * at order entry to surface it.
 *
 * Pure functions over plain rows — the route fetches, this file matches.
 */

export interface PlanRecRow {
  recId: string;
  ticker: string;
  structure: string | null;
  disposition: string;
  asOf: Date;
  optionType: string | null;
  strike: number | null;
  strikeShort: number | null;
  expirationDate: Date | null;
  entryRangeLow: number | null;
  entryRangeHigh: number | null;
  sizingBand: string | null;
}

export interface PlanExecRow {
  id: string;
  accountId: string;
  tradeDate: Date;
  underlyingSymbol: string | null;
  optionType: string | null;
  strike: number | null;
  expirationDate: Date | null;
  side: string | null;
  openingClosingEffect: string | null;
  quantity: number;
  price: number | null;
}

export type FillVsRange = "BELOW" | "INSIDE" | "ABOVE" | "NO_RANGE" | "NO_FILL_PRICE";

export interface LegFill {
  strike: number;
  totalQuantity: number;
  weightedAvgPrice: number | null;
  executionIds: string[];
  firstFillDate: string;
}

export interface PlanVsActualRow {
  recId: string;
  ticker: string;
  structure: string | null;
  asOf: string;
  expirationDate: string | null;
  entryRangeLow: number | null;
  entryRangeHigh: number | null;
  sizingBand: string | null;
  taken: boolean;
  /** For spreads: true when only one of the two legs has a matching fill. */
  partialLegs: boolean;
  legs: LegFill[];
  /** Single-leg: weighted avg fill price. Spread: net debit (long avg − short avg). */
  effectivePrice: number | null;
  fillVsRange: FillVsRange | null;
  /** Signed % deviation from the nearest range bound; 0 when inside. */
  rangeDeviationPct: number | null;
  daysToFill: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function sameDate(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

function isOpening(exec: PlanExecRow): boolean {
  if (exec.openingClosingEffect) return exec.openingClosingEffect === "OPENING";
  // Fall back to side only when the effect is genuinely absent from the import.
  return exec.side === "BUY" || exec.side === "SELL";
}

function withinWindow(exec: PlanExecRow, rec: PlanRecRow, windowDays: number): boolean {
  const start = rec.asOf.getTime();
  const end = start + windowDays * DAY_MS;
  const t = exec.tradeDate.getTime();
  return t >= start && t <= end;
}

function legFill(execs: PlanExecRow[], strike: number): LegFill | null {
  if (execs.length === 0) return null;
  const totalQuantity = execs.reduce((sum, e) => sum + Math.abs(e.quantity), 0);
  const priced = execs.filter((e) => e.price !== null);
  const weightedAvgPrice =
    priced.length > 0 && totalQuantity > 0
      ? priced.reduce((sum, e) => sum + Math.abs(e.quantity) * (e.price as number), 0) /
        priced.reduce((sum, e) => sum + Math.abs(e.quantity), 0)
      : null;
  const firstFillDate = execs
    .map((e) => e.tradeDate.toISOString().slice(0, 10))
    .sort()[0];
  return {
    strike,
    totalQuantity,
    weightedAvgPrice,
    executionIds: execs.map((e) => e.id),
    firstFillDate,
  };
}

function rangeVerdict(
  price: number | null,
  low: number | null,
  high: number | null,
): { fillVsRange: FillVsRange; rangeDeviationPct: number | null } {
  if (price === null) return { fillVsRange: "NO_FILL_PRICE", rangeDeviationPct: null };
  if (low === null || high === null) return { fillVsRange: "NO_RANGE", rangeDeviationPct: null };
  if (price < low) return { fillVsRange: "BELOW", rangeDeviationPct: ((price - low) / low) * 100 };
  if (price > high) return { fillVsRange: "ABOVE", rangeDeviationPct: ((price - high) / high) * 100 };
  return { fillVsRange: "INSIDE", rangeDeviationPct: 0 };
}

export function matchRecommendationToExecutions(
  rec: PlanRecRow,
  executions: PlanExecRow[],
  windowDays: number,
): PlanVsActualRow {
  const base = {
    recId: rec.recId,
    ticker: rec.ticker,
    structure: rec.structure,
    asOf: rec.asOf.toISOString().slice(0, 10),
    expirationDate: rec.expirationDate ? rec.expirationDate.toISOString().slice(0, 10) : null,
    entryRangeLow: rec.entryRangeLow,
    entryRangeHigh: rec.entryRangeHigh,
    sizingBand: rec.sizingBand,
  };

  if (rec.strike === null || rec.expirationDate === null) {
    return {
      ...base,
      taken: false,
      partialLegs: false,
      legs: [],
      effectivePrice: null,
      fillVsRange: null,
      rangeDeviationPct: null,
      daysToFill: null,
    };
  }

  const candidates = executions.filter(
    (exec) =>
      exec.underlyingSymbol?.toUpperCase() === rec.ticker.toUpperCase() &&
      sameDate(exec.expirationDate, rec.expirationDate) &&
      (rec.optionType === null || exec.optionType === null || exec.optionType === rec.optionType) &&
      isOpening(exec) &&
      withinWindow(exec, rec, windowDays),
  );

  const longLeg = legFill(
    candidates.filter((exec) => exec.strike === rec.strike),
    rec.strike,
  );
  const shortLeg =
    rec.strikeShort !== null
      ? legFill(
          candidates.filter((exec) => exec.strike === rec.strikeShort),
          rec.strikeShort,
        )
      : null;

  const isSpread = rec.strikeShort !== null;
  const legs = [longLeg, shortLeg].filter((leg): leg is LegFill => leg !== null);

  let taken: boolean;
  let partialLegs = false;
  let effectivePrice: number | null = null;

  if (isSpread) {
    taken = longLeg !== null && shortLeg !== null;
    partialLegs = !taken && (longLeg !== null || shortLeg !== null);
    if (taken && longLeg?.weightedAvgPrice != null && shortLeg?.weightedAvgPrice != null) {
      effectivePrice = longLeg.weightedAvgPrice - shortLeg.weightedAvgPrice;
    }
  } else {
    taken = longLeg !== null;
    effectivePrice = longLeg?.weightedAvgPrice ?? null;
  }

  const verdict = taken
    ? rangeVerdict(effectivePrice, rec.entryRangeLow, rec.entryRangeHigh)
    : { fillVsRange: null, rangeDeviationPct: null };

  const firstFill = legs.length > 0 ? legs.map((leg) => leg.firstFillDate).sort()[0] : null;
  const daysToFill =
    taken && firstFill
      ? Math.round((new Date(`${firstFill}T00:00:00.000Z`).getTime() - rec.asOf.getTime()) / DAY_MS)
      : null;

  return {
    ...base,
    taken,
    partialLegs,
    legs,
    effectivePrice,
    fillVsRange: verdict.fillVsRange,
    rangeDeviationPct:
      verdict.rangeDeviationPct === null ? null : Math.round(verdict.rangeDeviationPct * 100) / 100,
    daysToFill,
  };
}
