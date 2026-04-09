import type { Execution } from "@prisma/client";
import type { NormalizedExecution } from "@/lib/adapters/types";

function formatExpirationDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "NA";
}

function formatStrike(value: number | null): string {
  return value === null ? "NA" : String(value);
}

function isOptionLike(assetClass: string, optionType: string | null, expirationDate: Date | null, strike: number | null): boolean {
  if (assetClass === "OPTION") {
    return true;
  }

  return optionType !== null || expirationDate !== null || strike !== null;
}

type InstrumentKeySource = {
  assetClass: string;
  symbol: string;
  underlyingSymbol: string | null;
  optionType: string | null;
  expirationDate: Date | null;
  strike: number | null;
};

export function deriveInstrumentKeyFromNormalizedExecution(
  execution: Pick<NormalizedExecution, "assetClass" | "symbol" | "underlyingSymbol" | "optionType" | "expirationDate" | "strike">,
): string {
  return deriveInstrumentKeyFromValues({
    assetClass: execution.assetClass,
    symbol: execution.symbol,
    underlyingSymbol: execution.underlyingSymbol,
    optionType: execution.optionType,
    expirationDate: execution.expirationDate,
    strike: execution.strike,
  });
}

function deriveInstrumentKeyFromValues(execution: InstrumentKeySource): string {
  if (
    isOptionLike(
      execution.assetClass,
      execution.optionType,
      execution.expirationDate,
      execution.strike,
    )
  ) {
    const underlying = execution.underlyingSymbol ?? execution.symbol;
    const optionType = execution.optionType ?? "NA";
    const expiration = formatExpirationDate(execution.expirationDate);
    const strike = formatStrike(execution.strike);
    return `${underlying}|${optionType}|${strike}|${expiration}`;
  }

  return execution.symbol;
}

export function deriveInstrumentKeyFromPersistedExecution(
  execution: Pick<Execution, "assetClass" | "symbol" | "underlyingSymbol" | "optionType" | "expirationDate" | "strike" | "instrumentKey">,
): string {
  if (execution.instrumentKey && execution.instrumentKey.trim().length > 0) {
    return execution.instrumentKey;
  }

  return deriveInstrumentKeyFromValues({
    assetClass: execution.assetClass,
    symbol: execution.symbol,
    underlyingSymbol: execution.underlyingSymbol,
    optionType: execution.optionType,
    expirationDate: execution.expirationDate,
    strike: execution.strike ? Number(execution.strike) : null,
  });
}
