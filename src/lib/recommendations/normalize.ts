/**
 * Pure normalizers for journal recommendation rows.
 *
 * The kapman-journal pass1/pass2 logs are LLM-authored markdown whose table
 * shapes drift run to run ("Long Call" vs "long_call" vs "LONG_CALL",
 * "$16.60–$16.90" vs "~$6.70 debit" vs "net debit $6.20–$7.40"). Every
 * normalizer here returns null when it cannot parse — a null is reported by
 * the caller and stays null in the database. Nothing is ever guessed.
 */

export type NormalizedStructure =
  | "LONG_CALL"
  | "LONG_PUT"
  | "CALL_DEBIT_SPREAD"
  | "PUT_DEBIT_SPREAD"
  | "CSP"
  | "LEAP_LONG_CALL"
  | "LEAP_SHORT_PUT"
  | "VERTICAL_SPREAD"
  | "NONE";

const STRUCTURE_ALIASES: Record<string, NormalizedStructure> = {
  long_call: "LONG_CALL",
  "long call": "LONG_CALL",
  long_put: "LONG_PUT",
  "long put": "LONG_PUT",
  call_debit_spread: "CALL_DEBIT_SPREAD",
  "call debit spread": "CALL_DEBIT_SPREAD",
  put_debit_spread: "PUT_DEBIT_SPREAD",
  "put debit spread": "PUT_DEBIT_SPREAD",
  csp: "CSP",
  "cash-secured put": "CSP",
  "cash secured put": "CSP",
  leap_long_call: "LEAP_LONG_CALL",
  "leap long call": "LEAP_LONG_CALL",
  "leap (long call)": "LEAP_LONG_CALL",
  leap_short_put: "LEAP_SHORT_PUT",
  "leap short put": "LEAP_SHORT_PUT",
  "leap (short put)": "LEAP_SHORT_PUT",
  // "vertical_spread" appears in the 2026-08-03 run without naming call/put.
  // It normalizes to the honest, less-specific value — never inferred to a side.
  vertical_spread: "VERTICAL_SPREAD",
  "vertical spread": "VERTICAL_SPREAD",
  none: "NONE",
  "—": "NONE",
  "-": "NONE",
};

export function normalizeStructure(rawValue: string | null | undefined): NormalizedStructure | null {
  if (!rawValue) return null;
  const key = rawValue.trim().toLowerCase();
  return STRUCTURE_ALIASES[key] ?? null;
}

export type NormalizedDisposition =
  | "ELIGIBLE"
  | "NO_TRADE"
  | "WAIT"
  | "VALIDATED"
  | "FLAGGED"
  | "REJECTED";

const DISPOSITION_ALIASES: Record<string, NormalizedDisposition> = {
  eligible: "ELIGIBLE",
  no_trade: "NO_TRADE",
  "no trade": "NO_TRADE",
  wait: "WAIT",
  validated: "VALIDATED",
  flagged: "FLAGGED",
  rejected: "REJECTED",
};

export function normalizeDisposition(rawValue: string | null | undefined): NormalizedDisposition | null {
  if (!rawValue) return null;
  // Tolerate markdown emphasis and state-transition suffixes: a cell like
  // "**Validated → Executed**" carries the disposition as its first element.
  const cleaned = rawValue.replace(/\*/g, "").trim();
  const first = cleaned.split("→")[0].trim().toLowerCase();
  return DISPOSITION_ALIASES[first] ?? null;
}

export function optionTypeFromStructure(structure: NormalizedStructure | null): "CALL" | "PUT" | null {
  switch (structure) {
    case "LONG_CALL":
    case "CALL_DEBIT_SPREAD":
    case "LEAP_LONG_CALL":
      return "CALL";
    case "LONG_PUT":
    case "PUT_DEBIT_SPREAD":
    case "CSP":
    case "LEAP_SHORT_PUT":
      return "PUT";
    default:
      return null;
  }
}

export interface ParsedStrikes {
  strike: number;
  strikeShort: number | null;
  /** Option type carried by the strike text itself (e.g. "250C/270C"), if any. */
  optionType: "CALL" | "PUT" | null;
}

/**
 * Observed forms: "280", "250C/270C", "160/175", "60C/70C", "16".
 */
export function parseStrikes(rawValue: string | null | undefined): ParsedStrikes | null {
  if (!rawValue) return null;
  const text = rawValue.trim();
  const spread = text.match(/^\$?(\d+(?:\.\d+)?)\s*([CP])?\s*\/\s*\$?(\d+(?:\.\d+)?)\s*([CP])?$/i);
  if (spread) {
    const letter = (spread[2] ?? spread[4] ?? "").toUpperCase();
    return {
      strike: Number(spread[1]),
      strikeShort: Number(spread[3]),
      optionType: letter === "C" ? "CALL" : letter === "P" ? "PUT" : null,
    };
  }
  const single = text.match(/^\$?(\d+(?:\.\d+)?)\s*([CP])?$/i);
  if (single) {
    const letter = (single[2] ?? "").toUpperCase();
    return {
      strike: Number(single[1]),
      strikeShort: null,
      optionType: letter === "C" ? "CALL" : letter === "P" ? "PUT" : null,
    };
  }
  return null;
}

export interface ParsedEntryRange {
  low: number;
  high: number;
}

/**
 * Observed forms: "$16.60–$16.90", "$3.60–$6.00 (wide)", "~$6.70 debit",
 * "net debit $6.20–$7.40". A single point value yields low === high.
 * Both en-dash and hyphen appear as range separators.
 */
export function parseEntryRange(rawValue: string | null | undefined): ParsedEntryRange | null {
  if (!rawValue) return null;
  const range = rawValue.match(/(\d+(?:\.\d+)?)\s*[–—-]\s*\$?(\d+(?:\.\d+)?)/);
  if (range) {
    const low = Number(range[1]);
    const high = Number(range[2]);
    if (low > high) return null;
    return { low, high };
  }
  const point = rawValue.match(/(\d+(?:\.\d+)?)/);
  if (!point) return null;
  const value = Number(point[1]);
  return { low: value, high: value };
}

/**
 * Observed forms: "2026-11-20 (105d)", "2026-10-16".
 */
export function parseExpiration(rawValue: string | null | undefined): string | null {
  if (!rawValue) return null;
  const match = rawValue.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}
