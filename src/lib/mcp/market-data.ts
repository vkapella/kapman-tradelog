import type { EquityQuoteRecord, OptionQuoteRecord } from "@/types/api";
import { callMcpTool, McpUnavailableError } from "@/lib/mcp/client";

type OptionContractMap = Record<string, Record<string, Array<Record<string, unknown>>>>;
type OptionContractType = "CALL" | "PUT";

interface OptionQuoteBatchLeg {
  underlyingSymbol: string;
  strike: number;
  expirationDate: string;
  optionType: string;
}

interface NormalizedOptionQuoteBatchLeg {
  underlyingSymbol: string;
  strike: number;
  expirationDate: string;
  optionType: OptionContractType;
  instrumentKey: string;
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

function buildOptionInstrumentKey(underlyingSymbol: string, optionType: OptionContractType, strike: number, expirationDate: string): string {
  return `${underlyingSymbol}|${optionType}|${strike}|${expirationDate}`;
}

function normalizeOptionBatchLeg(leg: OptionQuoteBatchLeg): NormalizedOptionQuoteBatchLeg | null {
  const underlyingSymbol = leg.underlyingSymbol.trim().toUpperCase();
  const expirationDate = leg.expirationDate.trim().slice(0, 10);
  const optionType = leg.optionType.trim().toUpperCase();
  const strike = Number(leg.strike);

  if (!underlyingSymbol || !expirationDate || !Number.isFinite(strike) || (optionType !== "CALL" && optionType !== "PUT")) {
    return null;
  }

  return {
    underlyingSymbol,
    strike,
    expirationDate,
    optionType,
    instrumentKey: buildOptionInstrumentKey(underlyingSymbol, optionType, strike, expirationDate),
  };
}

function getSymbolCandidates(symbol: string): string[] {
  return symbol === "VIX" ? ["VIX", "$VIX"] : [symbol];
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

async function getOptionContractsForSymbol(
  symbol: string,
  contractType: OptionContractType,
  contracts: Array<Pick<NormalizedOptionQuoteBatchLeg, "expirationDate" | "strike">>,
): Promise<OptionContractMap | null> {
  const sortedDates = Array.from(new Set(contracts.map((contract) => contract.expirationDate))).sort((left, right) => left.localeCompare(right));
  const fromDate = sortedDates[0];
  const toDate = sortedDates[sortedDates.length - 1];
  const symbolCandidates = getSymbolCandidates(symbol);

  for (let index = 0; index < symbolCandidates.length; index += 1) {
    const symbolCandidate = symbolCandidates[index];
    const hasMoreCandidates = index < symbolCandidates.length - 1;

    let chainResult: unknown;
    try {
      chainResult = await callMcpTool<unknown>("get_option_chain", {
        symbol: symbolCandidate,
        contract_type: contractType,
        strike_count: 50,
        include_quotes: true,
        from_date: fromDate,
        to_date: toDate,
      });
    } catch (error) {
      if (error instanceof McpUnavailableError && hasMoreCandidates) {
        continue;
      }

      if (error instanceof McpUnavailableError) {
        return null;
      }

      throw error;
    }

    const expMap = pickOptionExpMap(chainResult, contractType);
    if (expMap && contracts.some((contract) => getOptionContract(expMap, contract.expirationDate, contract.strike))) {
      return expMap;
    }
  }

  return null;
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
    const expMap = await getOptionContractsForSymbol(symbol, contractType, [{ expirationDate: expDate, strike }]);
    if (!expMap) {
      return null;
    }

    const contract = getOptionContract(expMap, expDate, strike);
    const mappedQuote = contract ? mapOptionContract(contract) : null;
    if (!mappedQuote) {
      return null;
    }

    return mappedQuote;
  } catch (error) {
    if (error instanceof McpUnavailableError) {
      return null;
    }

    throw error;
  }
}

export async function getOptionQuotesBatch(legs: OptionQuoteBatchLeg[]): Promise<Map<string, number | null>> {
  const quotes = new Map<string, number | null>();
  const groupedLegs = new Map<string, NormalizedOptionQuoteBatchLeg[]>();

  for (const leg of legs) {
    const normalized = normalizeOptionBatchLeg(leg);
    if (!normalized) {
      continue;
    }

    quotes.set(normalized.instrumentKey, null);
    const groupKey = `${normalized.underlyingSymbol}|${normalized.optionType}`;
    const group = groupedLegs.get(groupKey) ?? [];
    group.push(normalized);
    groupedLegs.set(groupKey, group);
  }

  await Promise.all(
    Array.from(groupedLegs.values()).map(async (group) => {
      const [firstLeg] = group;
      const expMap = await getOptionContractsForSymbol(
        firstLeg.underlyingSymbol,
        firstLeg.optionType,
        group,
      );

      if (!expMap) {
        return;
      }

      for (const leg of group) {
        const contract = getOptionContract(expMap, leg.expirationDate, leg.strike);
        const quote = contract ? mapOptionContract(contract) : null;
        quotes.set(leg.instrumentKey, quote?.mark ?? null);
      }
    }),
  );

  return quotes;
}
