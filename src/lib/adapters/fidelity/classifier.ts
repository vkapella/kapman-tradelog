import type { ActionClassification } from "./types";

export function classifyAction(rawAction: string): ActionClassification {
  const normalized = rawAction.toUpperCase();

  if (normalized.includes("BUY CANCEL") || normalized.includes("CXL DESCRIPTION CANCELLED TRADE")) {
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

  if (normalized.includes("YOU BOUGHT PROSPECTUS UNDER SEPARATE COVER")) {
    return { kind: "CASH_EVENT", cashEventType: "MONEY_MARKET_BUY" };
  }

  if (normalized.includes("DIVIDEND RECEIVED")) {
    return { kind: "CASH_EVENT", cashEventType: "DIVIDEND" };
  }

  if (normalized.includes("REINVESTMENT")) {
    return { kind: "CASH_EVENT", cashEventType: "REINVESTMENT" };
  }

  if (normalized.includes("REDEMPTION FROM CORE ACCOUNT")) {
    return { kind: "CASH_EVENT", cashEventType: "REDEMPTION" };
  }

  if (normalized.includes("TRANSFERRED FROM")) {
    return { kind: "CASH_EVENT", cashEventType: "TRANSFER_IN" };
  }

  if (normalized.includes("TRANSFER OF ASSETS ACAT RECEIVE")) {
    return { kind: "CASH_EVENT", cashEventType: "ACAT_RECEIVE" };
  }

  if (normalized.includes("TRANSFER OF ASSETS ACAT RES.CREDIT")) {
    return { kind: "CASH_EVENT", cashEventType: "ACAT_CREDIT" };
  }

  if (normalized.includes("YOU BOUGHT")) {
    return { kind: "EXECUTION", side: "BUY", openClose: null, assetClass: "EQUITY" };
  }

  if (normalized.includes("YOU SOLD")) {
    return { kind: "EXECUTION", side: "SELL", openClose: null, assetClass: "EQUITY" };
  }

  return { kind: "UNKNOWN" };
}
