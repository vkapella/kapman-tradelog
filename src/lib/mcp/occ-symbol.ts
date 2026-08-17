/**
 * Schwab OCC-21 option symbols.
 *
 * Layout: 6-character root, left-justified and space-padded, then YYMMDD, then
 * C or P, then the strike multiplied by 1000 and zero-padded to 8 digits.
 *
 *   SPY   271217C00650000
 *   ^^^^^^ root      ^^^^^^^^ strike x 1000
 *
 * Quoting by this exact symbol replaces scanning an option chain window, which
 * silently missed strikes far from the underlying price.
 */

const ROOT_WIDTH = 6;
const STRIKE_WIDTH = 8;
const STRIKE_MULTIPLIER = 1000;

export type OptionContractType = "CALL" | "PUT";

export interface OccSymbolInput {
  underlyingSymbol: string;
  expirationDate: string;
  optionType: OptionContractType;
  strike: number;
}

function formatExpiration(expirationDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(expirationDate.trim());
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  return `${year.slice(2)}${month}${day}`;
}

function formatStrike(strike: number): string | null {
  if (!Number.isFinite(strike) || strike <= 0) {
    return null;
  }

  // Round rather than truncate: 172.5 * 1000 is 172499.99... in binary floating point.
  const thousandths = Math.round(strike * STRIKE_MULTIPLIER);
  const formatted = String(thousandths);
  return formatted.length > STRIKE_WIDTH ? null : formatted.padStart(STRIKE_WIDTH, "0");
}

/**
 * Build the OCC-21 symbol, or null when any component is unusable. Returning
 * null keeps a malformed leg from being sent as a lookalike symbol that would
 * quote some other contract.
 */
export function buildOccOptionSymbol(input: OccSymbolInput): string | null {
  const root = input.underlyingSymbol.trim().toUpperCase();
  if (!root || root.length > ROOT_WIDTH || !/^[A-Z0-9.]+$/.test(root)) {
    return null;
  }

  const expiration = formatExpiration(input.expirationDate);
  if (!expiration) {
    return null;
  }

  const optionType = input.optionType.trim().toUpperCase();
  if (optionType !== "CALL" && optionType !== "PUT") {
    return null;
  }

  const strike = formatStrike(input.strike);
  if (!strike) {
    return null;
  }

  return `${root.padEnd(ROOT_WIDTH, " ")}${expiration}${optionType === "CALL" ? "C" : "P"}${strike}`;
}
