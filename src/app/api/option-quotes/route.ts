import { detailResponse, errorResponse } from "@/lib/api/responses";
import { buildOptionQuoteCacheKey, getCachedOptionQuote, normalizeOptionQuoteContract, unavailableOptionQuote } from "@/lib/mcp/option-quote-cache";
import type { OptionQuoteResponse, OptionQuotesMap, OptionQuotesRequest } from "@/types/api";

function isOptionQuotesRequest(value: unknown): value is OptionQuotesRequest {
  if (typeof value !== "object" || value === null || !("contracts" in value)) {
    return false;
  }

  const contracts = (value as { contracts?: unknown }).contracts;
  if (!Array.isArray(contracts)) {
    return false;
  }

  return contracts.every((contract) => {
    if (typeof contract !== "object" || contract === null) {
      return false;
    }

    const candidate = contract as Record<string, unknown>;
    return (
      typeof candidate.instrumentKey === "string" &&
      typeof candidate.symbol === "string" &&
      typeof candidate.strike === "string" &&
      typeof candidate.expDate === "string" &&
      typeof candidate.contractType === "string"
    );
  });
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return errorResponse("INVALID_BODY", "Unable to parse option quote batch request.", ["Expected JSON request body."]);
  }

  if (!isOptionQuotesRequest(payload)) {
    return errorResponse("INVALID_BODY", "Unable to parse option quote batch request.", [
      "Expected body shape: { contracts: [{ instrumentKey, symbol, strike, expDate, contractType }] }.",
    ]);
  }

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";
  const pendingQuotes = new Map<string, Promise<OptionQuoteResponse>>();
  const results = await Promise.all(
    payload.contracts.map(async (contract) => {
      const normalized = normalizeOptionQuoteContract(contract);
      const cacheKey = normalized ? buildOptionQuoteCacheKey(normalized) : contract.instrumentKey;

      let quotePromise = pendingQuotes.get(cacheKey);
      if (!quotePromise) {
        quotePromise = normalized ? getCachedOptionQuote(contract, forceRefresh) : Promise.resolve(unavailableOptionQuote());
        pendingQuotes.set(cacheKey, quotePromise);
      }

      const quote = await quotePromise;
      return [contract.instrumentKey, quote] as const;
    }),
  );

  const data: OptionQuotesMap = Object.fromEntries(results);
  return detailResponse(data);
}
