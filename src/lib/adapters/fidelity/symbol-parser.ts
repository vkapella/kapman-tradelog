import type { OptionDetails } from "./types";

const FIDELITY_OPTION_SYMBOL_REGEX = /^-([A-Z]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d+(?:\.\d+)?)$/;

export function parseOptionSymbol(symbol: string): OptionDetails | null {
  if (!symbol) {
    return null;
  }

  const match = symbol.match(FIDELITY_OPTION_SYMBOL_REGEX);
  if (!match) {
    return null;
  }

  const year = 2000 + Number(match[2]);
  const month = Number(match[3]);
  const day = Number(match[4]);
  const optionType = match[5] === "C" ? "CALL" : "PUT";

  const expirationDate = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;

  return {
    underlyingTicker: match[1],
    expirationDate,
    optionType,
    strikePrice: Number.parseFloat(match[6]),
  };
}
