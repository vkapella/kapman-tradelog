export type CanonicalOptionType = "CALL" | "PUT";

export interface CanonicalOptionInstrument {
  instrumentKey: string;
  underlying: string;
  optionType: CanonicalOptionType;
  strike: string;
  expirationDate: string;
}

export interface OccTickerParseResult extends CanonicalOptionInstrument {
  occTicker: string;
}

const OCC_TICKER_PATTERN = /^O:(.+)(\d{6})([CP])(\d{8})$/i;
const CANONICAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DECIMAL_STRIKE_PATTERN = /^(\d+)(?:\.(\d+))?$/;

function assertValidDateOnly(value: string): void {
  const match = value.match(CANONICAL_DATE_PATTERN);
  if (!match) {
    throw new Error(`Invalid option expiration date: ${value}. Expected YYYY-MM-DD.`);
  }

  const [, year, month, day] = match;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    throw new Error(`Invalid option expiration date: ${value}.`);
  }
}

function normalizeUnderlying(value: string): string {
  const underlying = value.trim().toUpperCase();
  if (underlying.length === 0) {
    throw new Error("Option underlying symbol is required.");
  }
  if (underlying.includes("|")) {
    throw new Error(`Invalid option underlying symbol: ${value}.`);
  }
  return underlying;
}

export function normalizeCanonicalStrike(value: string | number): string {
  const raw = typeof value === "number" ? value.toString() : value.trim();
  if (raw.length === 0) {
    throw new Error("Option strike is required.");
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`Invalid option strike: ${String(value)}.`);
  }

  const match = raw.match(DECIMAL_STRIKE_PATTERN);
  if (!match) {
    throw new Error(`Invalid option strike: ${raw}.`);
  }

  const wholePart = match[1].replace(/^0+(?=\d)/, "");
  const fractionalRaw = match[2] ?? "";
  const fractionalTrimmed = fractionalRaw.replace(/0+$/, "");

  if (fractionalTrimmed.length > 3) {
    throw new Error(`Invalid option strike precision: ${raw}. OCC tickers support up to 3 decimals.`);
  }

  return fractionalTrimmed.length === 0 ? wholePart : `${wholePart}.${fractionalTrimmed}`;
}

function strikeToOccDigits(strike: string): string {
  const normalized = normalizeCanonicalStrike(strike);
  const [wholePart, fractionalPart = ""] = normalized.split(".");
  const strikeInteger = Number(wholePart) * 1000 + Number(fractionalPart.padEnd(3, "0"));

  if (!Number.isSafeInteger(strikeInteger) || strikeInteger < 0) {
    throw new Error(`Invalid option strike: ${strike}.`);
  }

  const digits = String(strikeInteger).padStart(8, "0");
  if (digits.length > 8) {
    throw new Error(`Option strike is too large for OCC format: ${strike}.`);
  }

  return digits;
}

function strikeFromOccDigits(value: string): string {
  if (!/^\d{8}$/.test(value)) {
    throw new Error(`Invalid OCC strike digits: ${value}.`);
  }

  const strikeInteger = Number(value);
  const wholePart = Math.floor(strikeInteger / 1000);
  const fractionalPart = strikeInteger % 1000;

  if (fractionalPart === 0) {
    return String(wholePart);
  }

  return `${wholePart}.${String(fractionalPart).padStart(3, "0").replace(/0+$/, "")}`;
}

function expirationFromOccDate(value: string): string {
  const yearTwoDigits = Number(value.slice(0, 2));
  const fullYear = yearTwoDigits >= 70 ? 1900 + yearTwoDigits : 2000 + yearTwoDigits;
  const month = value.slice(2, 4);
  const day = value.slice(4, 6);
  const expirationDate = `${fullYear}-${month}-${day}`;
  assertValidDateOnly(expirationDate);
  return expirationDate;
}

export function parseCanonicalOptionInstrumentKey(instrumentKey: string): CanonicalOptionInstrument {
  const parts = instrumentKey.split("|");
  if (parts.length !== 4) {
    throw new Error(`Invalid canonical option instrument key: ${instrumentKey}.`);
  }

  const underlying = normalizeUnderlying(parts[0]);
  const optionTypeRaw = parts[1].trim().toUpperCase();
  if (optionTypeRaw !== "CALL" && optionTypeRaw !== "PUT") {
    throw new Error(`Invalid option type in instrument key: ${parts[1]}.`);
  }

  const strike = normalizeCanonicalStrike(parts[2]);
  const expirationDate = parts[3].trim();
  assertValidDateOnly(expirationDate);

  return {
    instrumentKey: `${underlying}|${optionTypeRaw}|${strike}|${expirationDate}`,
    underlying,
    optionType: optionTypeRaw,
    strike,
    expirationDate,
  };
}

export function canonicalToOcc(instrumentKey: string): string {
  const parsed = parseCanonicalOptionInstrumentKey(instrumentKey);
  const [, yearSuffix, month, day] = parsed.expirationDate.match(CANONICAL_DATE_PATTERN) ?? [];
  if (!yearSuffix || !month || !day) {
    throw new Error(`Invalid option expiration date: ${parsed.expirationDate}.`);
  }

  const yearTwoDigits = yearSuffix.slice(-2);
  const optionTypeCode = parsed.optionType === "CALL" ? "C" : "P";
  return `O:${parsed.underlying}${yearTwoDigits}${month}${day}${optionTypeCode}${strikeToOccDigits(parsed.strike)}`;
}

export function occToCanonical(occ: string): OccTickerParseResult {
  const normalized = occ.trim().toUpperCase().replace(/\s+/g, "");
  const match = normalized.match(OCC_TICKER_PATTERN);
  if (!match) {
    throw new Error(`Invalid OCC option ticker: ${occ}.`);
  }

  const underlying = normalizeUnderlying(match[1]);
  const expirationDate = expirationFromOccDate(match[2]);
  const optionType: CanonicalOptionType = match[3] === "C" ? "CALL" : "PUT";
  const strike = strikeFromOccDigits(match[4]);
  const instrumentKey = `${underlying}|${optionType}|${strike}|${expirationDate}`;

  return {
    occTicker: canonicalToOcc(instrumentKey),
    instrumentKey,
    underlying,
    optionType,
    strike,
    expirationDate,
  };
}
