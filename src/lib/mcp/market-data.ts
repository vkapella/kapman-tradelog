import type { EquityQuoteRecord, OptionQuoteRecord } from "@/types/api";
import { callMcpTool, McpUnavailableError } from "@/lib/mcp/client";

type OptionContractMap = Record<string, Record<string, Array<Record<string, unknown>>>>;

export interface OptionQuoteRequest {
  symbol: string;
  strike: number;
  expDate: string;
  contractType: "CALL" | "PUT";
}

function numberOrZero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseEquityQuote(payload: unknown): EquityQuoteRecord {
  const quoteSource = typeof payload === "object" && payload !== null && "quote" in payload ? (payload as { quote?: unknown }).quote : payload;
  const quote = (quoteSource ?? {}) as Record<string, unknown>;

  return {
    mark: numberOrZero(quote.mark ?? quote.markPrice ?? quote.lastPrice ?? quote.closePrice),
    bid: numberOrZero(quote.bidPrice ?? quote.bid),
    ask: numberOrZero(quote.askPrice ?? quote.ask),
    last: numberOrZero(quote.lastPrice ?? quote.last),
    netChange: numberOrZero(quote.netChange ?? quote.netChangePct),
    netPctChange: numberOrZero(quote.netPercentChangeInDouble ?? quote.netPctChange),
  };
}

function pickQuoteMap(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const mapCandidate = payload as Record<string, unknown>;
  const nestedQuotes = mapCandidate.quotes;
  if (nestedQuotes && typeof nestedQuotes === "object") {
    return nestedQuotes as Record<string, unknown>;
  }

  return mapCandidate;
}

function getOptionContract(map: OptionContractMap, expDate: string, strike: number): Record<string, unknown> | null {
  for (const [expKey, strikeMap] of Object.entries(map)) {
    if (!expKey.startsWith(expDate + ":")) {
      continue;
    }

    for (const [strikeKey, contracts] of Object.entries(strikeMap)) {
      const strikeNumber = Number(strikeKey);
      if (Number.isFinite(strikeNumber) && Math.abs(strikeNumber - strike) < 0.0001 && contracts.length > 0) {
        return contracts[0];
      }
    }
  }

  return null;
}

function pickOptionExpMap(payload: unknown, contractType: "CALL" | "PUT"): OptionContractMap | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const mapCandidate = payload as Record<string, unknown>;
  const optionRoot =
    mapCandidate.optionChain && typeof mapCandidate.optionChain === "object"
      ? (mapCandidate.optionChain as Record<string, unknown>)
      : mapCandidate;
  const expMap = contractType === "CALL" ? optionRoot.callExpDateMap : optionRoot.putExpDateMap;
  return expMap && typeof expMap === "object" ? (expMap as OptionContractMap) : null;
}

function mapOptionContract(contract: Record<string, unknown>): OptionQuoteRecord | null {
  const mark = numberOrNull(contract.mark) ?? numberOrNull(contract.markChange) ?? numberOrNull(contract.last);
  const bid = numberOrNull(contract.bid);
  const ask = numberOrNull(contract.ask);
  const delta = numberOrNull(contract.delta);
  const theta = numberOrNull(contract.theta);
  const iv = numberOrNull(contract.volatility);
  const dte = numberOrNull(contract.daysToExpiration);

  if (mark === null || bid === null || ask === null || delta === null || theta === null || iv === null || dte === null) {
    return null;
  }

  return {
    mark,
    bid,
    ask,
    delta,
    theta,
    iv,
    dte,
    inTheMoney: Boolean(contract.inTheMoney),
  };
}

function buildOptionQuoteRequestKey(request: OptionQuoteRequest): string {
  return [request.symbol, String(request.strike), request.expDate, request.contractType].join("|");
}

function mapGroupedOptionQuotes(expMap: OptionContractMap, requests: OptionQuoteRequest[]): Record<string, OptionQuoteRecord | null> | null {
  const entries = requests.map((request) => {
    const contract = getOptionContract(expMap, request.expDate, request.strike);
    return [buildOptionQuoteRequestKey(request), contract ? mapOptionContract(contract) : null] as const;
  });

  return entries.some(([, quote]) => quote !== null) ? Object.fromEntries(entries) : null;
}

export async function getEquityQuotes(symbols: string[]): Promise<Record<string, EquityQuoteRecord> | null> {
  try {
    const result = await callMcpTool<unknown>("get_quotes", {
      symbols: symbols.join(","),
    });

    const quoteMap = pickQuoteMap(result);
    const responsePayload: Record<string, EquityQuoteRecord> = {};

    for (const symbol of symbols) {
      const quotePayload = quoteMap[symbol] ?? quoteMap[symbol.toLowerCase()];
      if (quotePayload) {
        responsePayload[symbol] = parseEquityQuote(quotePayload);
      }
    }

    return responsePayload;
  } catch (error) {
    if (error instanceof McpUnavailableError) {
      return null;
    }

    throw error;
  }
}

export async function getOptionQuote(
  symbol: string,
  strike: number,
  expDate: string,
  contractType: "CALL" | "PUT",
): Promise<OptionQuoteRecord | null> {
  try {
    const quoteMap = await getOptionQuotes([{ symbol, strike, expDate, contractType }]);
    if (quoteMap === null) {
      return null;
    }

    return quoteMap[buildOptionQuoteRequestKey({ symbol, strike, expDate, contractType })] ?? null;
  } catch (error) {
    if (error instanceof McpUnavailableError) {
      return null;
    }

    throw error;
  }
}

export async function getOptionQuotes(requests: OptionQuoteRequest[]): Promise<Record<string, OptionQuoteRecord | null> | null> {
  if (requests.length === 0) {
    return {};
  }

  try {
    const groupedRequests = new Map<string, OptionQuoteRequest[]>();

    for (const request of requests) {
      const groupKey = [request.symbol, request.contractType].join("|");
      const existing = groupedRequests.get(groupKey);
      if (existing) {
        existing.push(request);
      } else {
        groupedRequests.set(groupKey, [request]);
      }
    }

    const quoteEntries = await Promise.all(
      Array.from(groupedRequests.values()).map(async (group) => {
        const [firstRequest] = group;
        const symbolCandidates = firstRequest.symbol === "VIX" ? ["VIX", "$VIX"] : [firstRequest.symbol];
        const sortedExpDates = group.map((request) => request.expDate).sort((left, right) => left.localeCompare(right));
        const fromDate = sortedExpDates[0];
        const toDate = sortedExpDates[sortedExpDates.length - 1];

        for (let index = 0; index < symbolCandidates.length; index += 1) {
          const symbolCandidate = symbolCandidates[index];
          const hasMoreCandidates = index < symbolCandidates.length - 1;

          let chainResult: unknown;
          try {
            chainResult = await callMcpTool<unknown>("get_option_chain", {
              symbol: symbolCandidate,
              contract_type: firstRequest.contractType,
              strike_count: 200,
              include_quotes: true,
              from_date: fromDate,
              to_date: toDate,
            });
          } catch (error) {
            if (error instanceof McpUnavailableError && hasMoreCandidates) {
              continue;
            }

            throw error;
          }

          const expMap = pickOptionExpMap(chainResult, firstRequest.contractType);
          if (!expMap) {
            continue;
          }

          const mappedQuotes = mapGroupedOptionQuotes(expMap, group);
          if (mappedQuotes) {
            return Object.entries(mappedQuotes).map(([cacheKey, quote]) => [cacheKey, quote] as const);
          }
        }

        return group.map((request) => [buildOptionQuoteRequestKey(request), null] as const);
      }),
    );

    return Object.fromEntries(quoteEntries.flat());
  } catch (error) {
    if (error instanceof McpUnavailableError) {
      return null;
    }

    throw error;
  }
}
