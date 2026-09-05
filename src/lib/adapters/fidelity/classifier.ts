import type { ActionClassification } from "./types";

export function classifyAction(rawAction: string): ActionClassification {
  const normalized = rawAction.toUpperCase();

  if (normalized.startsWith("BUY CANCEL") || normalized.startsWith("SELL CANCEL") || normalized.includes("CXL DESCRIPTION CANCELLED TRADE")) {
    return { kind: "CANCELLED" };
  }

  if (normalized.includes("YOU BOUGHT OPENING TRANSACTION")) {
    return { kind: "EXECUTION", side: "BUY", openClose: "OPEN", assetClass: "OPTION" };
  }

  if (normalized.includes("YOU BOUGHT CLOSING TRANSACTION")) {
    return { kind: "EXECUTION", side: "BUY", openClose: "CLOSE", assetClass: "OPTION" };
  }

  if (normalized.includes("YOU SOLD OPENING TRANSACTION")) {
    return { kind: "EXECUTION", side: "SELL", openClose: "OPEN", assetClass: "OPTION" };
  }

  if (normalized.includes("YOU SOLD CLOSING TRANSACTION")) {
    return { kind: "EXECUTION", side: "SELL", openClose: "CLOSE", assetClass: "OPTION" };
  }

  if (normalized.includes("ASSIGNED AS OF")) {
    return { kind: "EXECUTION", side: "BUY", openClose: "CLOSE", assetClass: "OPTION" };
  }

  if (normalized.includes("YOU BOUGHT ASSIGNED")) {
    return { kind: "EXECUTION", side: "BUY", openClose: null, assetClass: "EQUITY" };
  }

  if (normalized.includes("YOU BOUGHT PROSPECTUS UNDER SEPARATE COVER EXCHANGE")) {
    return { kind: "CASH_EVENT", cashEventType: "MONEY_MARKET_EXCHANGE_IN" };
  }

  // "YOU BOUGHT PROSPECTUS UNDER SEPARATE COVER" covers any security bought under a
  // prospectus (money-market sweeps, but also IPO/prospectus equity purchases), so it
  // falls through to the generic YOU BOUGHT equity rule; money-market symbols are
  // converted to MONEY_MARKET_BUY cash events by normalizeMoneyMarketClassification.

  if (normalized.includes("YOU SOLD EXCHANGE")) {
    return { kind: "CASH_EVENT", cashEventType: "MONEY_MARKET_EXCHANGE_OUT" };
  }

  if (normalized.includes("DIVIDEND RECEIVED")) {
    return { kind: "CASH_EVENT", cashEventType: "DIVIDEND" };
  }

  if (normalized.includes("REINVESTMENT")) {
    return { kind: "CASH_EVENT", cashEventType: "REINVESTMENT" };
  }

  if (normalized.includes("REDEMPTION FROM CORE ACCOUNT")) {
    return { kind: "CASH_EVENT", cashEventType: "MONEY_MARKET_REDEEM" };
  }

  if (normalized.includes("TRANSFERRED FROM")) {
    return { kind: "CASH_EVENT", cashEventType: "TRANSFER_IN" };
  }

  // Outbound wires (2026-08-26/27: the corporate Schwab funding left this
  // account) and Fidelity's signed wire adjustments. Both carry the exported
  // sign and count as external capital flows; dropping them overstated cash by
  // $100,000 (#351).
  if (normalized.includes("WIRE TRANSFER TO BANK")) {
    return { kind: "CASH_EVENT", cashEventType: "TRANSFER_OUT" };
  }

  if (normalized.includes("ADJUST WIRE TRANSFER")) {
    return { kind: "CASH_EVENT", cashEventType: "TRANSFER_ADJUSTMENT" };
  }

  if (normalized.includes("TRANSFER OF ASSETS ACAT RECEIVE")) {
    return { kind: "CASH_EVENT", cashEventType: "ACAT_RECEIVE" };
  }

  if (normalized.includes("TRANSFER OF ASSETS ACAT RES.CREDIT")) {
    return { kind: "CASH_EVENT", cashEventType: "ACAT_CREDIT" };
  }

  // Cash<->margin account-type journals arrive as a +/- pair that nets to zero.
  // They are internal bookkeeping, not cash flow; persisting them (instead of
  // skipping them as UNKNOWN) lets diagnostics assert the pair nets out (#369).
  if (normalized.includes("JOURNALED JNL VS A/C TYPES")) {
    return { kind: "CASH_EVENT", cashEventType: "INTERNAL_JOURNAL" };
  }

  if (normalized.includes("YOU BOUGHT")) {
    return { kind: "EXECUTION", side: "BUY", openClose: null, assetClass: "EQUITY" };
  }

  if (normalized.includes("YOU SOLD")) {
    return { kind: "EXECUTION", side: "SELL", openClose: null, assetClass: "EQUITY" };
  }

  return { kind: "UNKNOWN" };
}
