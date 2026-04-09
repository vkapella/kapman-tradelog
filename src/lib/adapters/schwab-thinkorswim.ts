import { parseThinkorswimTradeHistory } from "./thinkorswim/trade-history";
import type { BrokerAdapter, DetectionResult, ParseResult, UploadedFile } from "./types";

function detectThinkorswim(file: UploadedFile): DetectionResult {
  const containsAccountStatement = file.content.includes("Account Statement for ");
  const containsTradeHistory = file.content.includes("Account Trade History");
  const matched = containsAccountStatement && containsTradeHistory;

  return {
    matched,
    confidence: matched ? 1 : 0,
    brokerId: "schwab_thinkorswim",
    formatVersion: matched ? "tos-account-statement-v1" : "unknown",
    reason: matched ? "Matched thinkorswim section markers." : "Missing thinkorswim section markers.",
    warnings: [],
  };
}

function parseThinkorswim(file: UploadedFile): ParseResult {
  return parseThinkorswimTradeHistory(file.content);
}

export const schwabThinkorswimAdapter: BrokerAdapter = {
  id: "schwab_thinkorswim",
  displayName: "Schwab thinkorswim",
  status: "active",
  detect: detectThinkorswim,
  parse: parseThinkorswim,
  coverage() {
    return {
      equities: true,
      options: true,
      multiLeg: true,
      snapshots: true,
      feesFromCashBalance: true,
      notes: "MVP active adapter for thinkorswim account statement CSV exports.",
    };
  },
};
