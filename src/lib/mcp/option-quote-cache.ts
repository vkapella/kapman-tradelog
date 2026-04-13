import type { OptionQuoteRecord, OptionQuoteResponse, OptionQuoteContractRequest, QuoteUnavailableResponse } from "@/types/api";
import { getOptionQuote } from "@/lib/mcp/market-data";

interface NormalizedOptionQuoteContract {
  symbol: string;
  strike: number;
  expDate: string;
  contractType: "CALL" | "PUT";
}

interface OptionQuoteCacheEntry {
  expiresAtMs: number;
  value: OptionQuoteRecord;
}

const OPTION_QUOTE_TTL_MS = 30_000;
const optionQuoteCache = new Map<string, OptionQuoteCacheEntry>();

export function unavailableOptionQuote(): QuoteUnavailableResponse {
  return { error: "unavailable" };
}

export function normalizeOptionQuoteContract(
  contract: Pick<OptionQuoteContractRequest, "symbol" | "strike" | "expDate" | "contractType">,
): NormalizedOptionQuoteContract | null {
  const symbol = contract.symbol.trim().toUpperCase();
  const expDate = contract.expDate.trim();
  const strike = Number(contract.strike.trim());
  const contractType = contract.contractType.trim().toUpperCase();

  if (!symbol || !expDate || !Number.isFinite(strike) || (contractType !== "CALL" && contractType !== "PUT")) {
    return null;
  }

  return {
    symbol,
    strike,
    expDate,
    contractType,
  };
}

export function buildOptionQuoteCacheKey(contract: NormalizedOptionQuoteContract): string {
  return [contract.symbol, String(contract.strike), contract.expDate, contract.contractType].join("|");
}

export async function getCachedOptionQuote(
  contract: Pick<OptionQuoteContractRequest, "symbol" | "strike" | "expDate" | "contractType">,
  forceRefresh = false,
): Promise<OptionQuoteResponse> {
  const normalized = normalizeOptionQuoteContract(contract);
  if (!normalized) {
    return unavailableOptionQuote();
  }

  const now = Date.now();
  const cacheKey = buildOptionQuoteCacheKey(normalized);
  const cached = optionQuoteCache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAtMs > now) {
    return cached.value;
  }

  try {
    const responsePayload = await getOptionQuote(
      normalized.symbol,
      normalized.strike,
      normalized.expDate,
      normalized.contractType,
    );

    if (responsePayload === null) {
      return cached?.value ?? unavailableOptionQuote();
    }

    optionQuoteCache.set(cacheKey, {
      value: responsePayload,
      expiresAtMs: now + OPTION_QUOTE_TTL_MS,
    });

    return responsePayload;
  } catch {
    return cached?.value ?? unavailableOptionQuote();
  }
}
