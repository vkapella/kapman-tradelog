import type { LotExcursionDirection } from "./compute-lot-excursion";
import type { LotExcursionMark } from "./compute-lot-excursion";

export interface MatchedLotPriceBasisInput {
  direction: LotExcursionDirection;
  assetClass: string;
  quantity: number;
  realizedPnl: number;
  persistedEntryPrice: number | null;
  persistedClosePrice: number | null;
  closeEventType: string | null;
  closeStrike: number | null;
  multiplier?: number | null;
  isClosed: boolean;
}

export interface MatchedLotPriceBasis {
  entryPrice: number | null;
  closePrice: number | null;
}

export interface SplitPriceAdjustment {
  accountId: string;
  symbol: string;
  effectiveDate: Date;
  from: number;
  to: number;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) ? value : null;
}

/**
 * Reconstruct the effective prices used by FIFO matching. Persisted executions remain raw,
 * while matched-lot P&L may reflect splits or execution overrides applied during rebuilding.
 */
export function resolveMatchedLotPriceBasis(input: MatchedLotPriceBasisInput): MatchedLotPriceBasis {
  const persistedEntryPrice = finiteOrNull(input.persistedEntryPrice);
  if (!input.isClosed) {
    return { entryPrice: persistedEntryPrice, closePrice: null };
  }

  const persistedClosePrice = finiteOrNull(input.persistedClosePrice);
  const strikeClosePrice = (input.closeEventType === "ASSIGNMENT" || input.closeEventType === "EXERCISE")
    ? finiteOrNull(input.closeStrike)
    : null;
  // FIFO treats any remaining null close price as zero when computing realized P&L.
  const closePrice = persistedClosePrice ?? strikeClosePrice ?? 0;
  const quantity = Math.abs(input.quantity);
  const multiplier = input.multiplier && Number.isFinite(input.multiplier) && input.multiplier > 0
    ? input.multiplier
    : input.assetClass === "OPTION" ? 100 : 1;
  const units = quantity * multiplier;

  if (units === 0 || !Number.isFinite(input.realizedPnl)) {
    return { entryPrice: persistedEntryPrice, closePrice };
  }

  const pnlPerUnit = input.realizedPnl / units;
  const impliedEntryPrice = input.direction === "LONG"
    ? closePrice - pnlPerUnit
    : closePrice + pnlPerUnit;

  return {
    entryPrice: Number.isFinite(impliedEntryPrice) && impliedEntryPrice >= 0
      ? impliedEntryPrice
      : persistedEntryPrice,
    closePrice,
  };
}

/** Normalize provider bars into the post-split price basis used by rebuilt matched lots. */
export function normalizeHistoricalMarksForSplits(
  marks: Map<string, LotExcursionMark>,
  accountId: string,
  symbol: string,
  adjustments: SplitPriceAdjustment[],
): Map<string, LotExcursionMark> {
  const relevant = adjustments.filter((adjustment) =>
    adjustment.accountId === accountId
    && adjustment.symbol.toUpperCase() === symbol.toUpperCase()
    && adjustment.from > 0
    && adjustment.to > 0,
  );
  if (relevant.length === 0) {
    return marks;
  }

  return new Map(Array.from(marks.entries()).map(([key, mark]) => {
    const markDate = new Date(`${key}T00:00:00.000Z`).getTime();
    const priceScale = relevant.reduce((scale, adjustment) => {
      return markDate < adjustment.effectiveDate.getTime()
        ? scale * (adjustment.from / adjustment.to)
        : scale;
    }, 1);
    return [key, { high: mark.high * priceScale, low: mark.low * priceScale }];
  }));
}
