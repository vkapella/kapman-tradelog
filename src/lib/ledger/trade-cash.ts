import type { Prisma } from "@prisma/client";
import { isCashNeutralTransferReceive } from "@/lib/ledger/cash-row-classification";

/**
 * Brokers whose adapter stores the settled, fee-inclusive cash amount of the
 * row in `Execution.netAmount` (Fidelity's Amount column). thinkorswim
 * trade-history rows store a per-unit net price there instead, so they stay
 * on quantity × price and report no fee (#372).
 */
export const SETTLED_NET_AMOUNT_BROKERS: ReadonlySet<string> = new Set<string>(["FIDELITY"]);

export interface TradeCashExecutionLike {
  assetClass: string;
  side: string | null;
  quantity: Prisma.Decimal | string | number;
  price: Prisma.Decimal | string | number | null;
  broker?: string | null;
  netAmount?: Prisma.Decimal | string | number | null;
  rawRowJson?: Prisma.JsonValue | null;
}

function isTrade(execution: TradeCashExecutionLike): execution is TradeCashExecutionLike & { side: "BUY" | "SELL" } {
  return (execution.side === "BUY" || execution.side === "SELL") && !isCashNeutralTransferReceive(execution.rawRowJson);
}

/** quantity × price × multiplier, unsigned; null when the row cannot be priced. */
export function grossTradeValue(execution: TradeCashExecutionLike): number | null {
  if (execution.price === null || execution.price === undefined) {
    return null;
  }
  const quantity = Math.abs(Number(execution.quantity));
  const price = Number(execution.price);
  if (!Number.isFinite(quantity) || !Number.isFinite(price)) {
    return null;
  }
  return quantity * price * (execution.assetClass === "OPTION" ? 100 : 1);
}

/** The broker's settled amount, unsigned, when the adapter records one for this broker. */
export function settledNetTradeValue(execution: TradeCashExecutionLike): number | null {
  if (!execution.broker || !SETTLED_NET_AMOUNT_BROKERS.has(execution.broker)) {
    return null;
  }
  if (execution.netAmount === null || execution.netAmount === undefined) {
    return null;
  }
  const net = Math.abs(Number(execution.netAmount));
  return Number.isFinite(net) ? net : null;
}

/**
 * Signed cash effect of one execution: negative for a buy, positive for a sell.
 * Prefers the settled amount (commissions and fees included); otherwise gross.
 * In-kind receives and rows without a trade side are cash-neutral.
 */
export function tradeCashDelta(execution: TradeCashExecutionLike): number {
  if (!isTrade(execution)) {
    return 0;
  }
  const sign = execution.side === "BUY" ? -1 : 1;
  const value = settledNetTradeValue(execution) ?? grossTradeValue(execution);
  return value === null ? 0 : sign * value;
}

/**
 * Commissions and fees embedded in the settled amount: the (unsigned) gap
 * between quantity × price and the broker's net. Positive is a cost. Zero when
 * the broker records no settled amount, so matched-lot realized P&L (which is
 * price-based) and the value engine's cash agree only once this term is added
 * back in the reconciliation identity (#372).
 */
export function tradingFee(execution: TradeCashExecutionLike): number {
  if (!isTrade(execution)) {
    return 0;
  }
  const net = settledNetTradeValue(execution);
  const gross = grossTradeValue(execution);
  if (net === null || gross === null) {
    return 0;
  }
  // A buy costs more than gross, a sell yields less than gross; both are a fee.
  return execution.side === "BUY" ? net - gross : gross - net;
}
