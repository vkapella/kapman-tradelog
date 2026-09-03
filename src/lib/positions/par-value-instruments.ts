import type { ExecutionRecord } from "@/types/api";
import { fallbackInstrumentKey } from "@/lib/positions/compute-open-positions";

/**
 * Money-market funds (Schwab SNSXX and friends) are bought and sold at a
 * constant $1.00 NAV. thinkorswim reports the sweep as a Trade History row
 * with Spread=FUND and Type=FUND, so it lands as an EQUITY execution, but no
 * quote or historical-mark source prices a money-market fund. Without this
 * rule the value engine subtracts the purchase from cash and then values the
 * holding at 0, so a fully swept account shows a $0 NLV (#348).
 *
 * The fund stays a visible position (the KB portfolio export expects it);
 * only its mark is fixed at par.
 */
export const PAR_VALUE_MARK = 1;

function rawString(raw: unknown, key: string): string | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const value = (raw as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim().toUpperCase() : null;
}

/** thinkorswim marks money-market sweeps as Spread=FUND / Type=FUND. */
export function isParValueExecution(execution: Pick<ExecutionRecord, "rawRowJson">): boolean {
  return rawString(execution.rawRowJson, "spread") === "FUND" || rawString(execution.rawRowJson, "type") === "FUND";
}

/** Instrument keys (as computeOpenPositions derives them) that are priced at par. */
export function collectParValueInstrumentKeys(executions: ExecutionRecord[]): Set<string> {
  const keys = new Set<string>();
  for (const execution of executions) {
    if (isParValueExecution(execution)) {
      keys.add(execution.instrumentKey ?? fallbackInstrumentKey(execution));
    }
  }
  return keys;
}
