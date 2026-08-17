import type { EquityQuoteRecord, OptionQuoteRecord } from "@/types/api";
import { callMcpTool, McpUnavailableError } from "@/lib/mcp/client";
import { buildOccOptionSymbol } from "@/lib/mcp/occ-symbol";

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
  // Number(null) is 0 and Number("") is 0, so an absent field would otherwise
  // become a real 0 — valuing a position at zero instead of reporting no mark.
  if (value === null || value === undefined || value === "") {
    return null;
  }

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

function daysToExpiration(expirationDate: string, now: Date): number | null {
  const parsed = Date.parse(`${expirationDate.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((parsed - today) / (24 * 60 * 60 * 1000));
}

function resolveInTheMoney(quote: Record<string, unknown>, strike: number, optionType: OptionContractType): boolean {
  const intrinsic = numberOrNull(quote.moneyIntrinsicValue);
  if (intrinsic !== null) {
    return intrinsic > 0;
  }

  const underlyingPrice = numberOrNull(quote.underlyingPrice);
  if (underlyingPrice === null) {
    return false;
  }

  return optionType === "CALL" ? underlyingPrice > strike : underlyingPrice < strike;
}

/**
 * Map one `get_quotes` option payload. Only a usable mark is required; a missing
 * greek nulls that field alone. `markChange` is deliberately never a mark
 * fallback — it is a change, not a price.
 */
export function parseOptionQuote(
  payload: unknown,
  context: { strike: number; optionType: OptionContractType; expirationDate: string },
  now: Date = new Date(),
): OptionQuoteRecord | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const container = payload as Record<string, unknown>;
  const quoteSource = container.quote && typeof container.quote === "object" ? container.quote : container;
  const quote = quoteSource as Record<string, unknown>;

  const mark = numberOrNull(quote.mark) ?? numberOrNull(quote.lastPrice) ?? numberOrNull(quote.closePrice);
  if (mark === null) {
    return null;
  }

  return {
    mark,
    bid: numberOrNull(quote.bidPrice) ?? numberOrNull(quote.bid),
    ask: numberOrNull(quote.askPrice) ?? numberOrNull(quote.ask),
    delta: numberOrNull(quote.delta),
    theta: numberOrNull(quote.theta),
    iv: numberOrNull(quote.volatility),
    dte: daysToExpiration(context.expirationDate, now),
    inTheMoney: resolveInTheMoney(quote, context.strike, context.optionType),
  };
}

function buildOptionQuoteRequestKey(request: OptionQuoteRequest): string {
  return [request.symbol, String(request.strike), request.expDate, request.contractType].join("|");
}

interface OptionQuoteLookup {
  /// Caller-facing key: request key for the single path, instrumentKey for the batch path.
  key: string;
  /// Null when the symbol could not be built; such legs go straight to the chain fallback.
  occSymbol: string | null;
  underlyingSymbol: string;
  strike: number;
  optionType: OptionContractType;
  expirationDate: string;
}

function getSymbolCandidates(symbol: string): string[] {
  return symbol === "VIX" ? ["VIX", "$VIX"] : [symbol];
}

function pickOptionExpMap(payload: unknown, contractType: OptionContractType): OptionContractMap | null {
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

/**
 * Map a contract taken from an option chain. Mirrors parseOptionQuote's rule
 * that only a usable mark is required, so a missing greek cannot discard it.
 */
function parseChainContract(
  contract: Record<string, unknown>,
  context: { strike: number; optionType: OptionContractType; expirationDate: string },
  now: Date = new Date(),
): OptionQuoteRecord | null {
  const mark = numberOrNull(contract.mark) ?? numberOrNull(contract.last) ?? numberOrNull(contract.closePrice);
  if (mark === null) {
    return null;
  }

  return {
    mark,
    bid: numberOrNull(contract.bid),
    ask: numberOrNull(contract.ask),
    delta: numberOrNull(contract.delta),
    theta: numberOrNull(contract.theta),
    iv: numberOrNull(contract.volatility),
    dte: numberOrNull(contract.daysToExpiration) ?? daysToExpiration(context.expirationDate, now),
    inTheMoney: Boolean(contract.inTheMoney),
  };
}

async function fetchOptionChain(
  symbol: string,
  contractType: OptionContractType,
  expirationDates: string[],
): Promise<OptionContractMap | null> {
  const sortedDates = Array.from(new Set(expirationDates)).sort((left, right) => left.localeCompare(right));
  const symbolCandidates = getSymbolCandidates(symbol);

  for (let index = 0; index < symbolCandidates.length; index += 1) {
    const hasMoreCandidates = index < symbolCandidates.length - 1;

    let chainResult: unknown;
    try {
      chainResult = await callMcpTool<unknown>("get_option_chain", {
        symbol: symbolCandidates[index],
        contract_type: contractType,
        strike_count: 50,
        include_quotes: true,
        from_date: sortedDates[0],
        to_date: sortedDates[sortedDates.length - 1],
      });
    } catch (error) {
      if (error instanceof McpUnavailableError) {
        if (hasMoreCandidates) {
          continue;
        }
        return null;
      }

      throw error;
    }

    const expMap = pickOptionExpMap(chainResult, contractType);
    if (expMap && Object.keys(expMap).length > 0) {
      return expMap;
    }
  }

  return null;
}

/**
 * Second pass for contracts the OCC symbol did not resolve.
 *
 * An OCC symbol is built from the underlying, but the option root is not always
 * the underlying: VIX weeklies trade as VIXW, SPX weeklies as SPXW, and
 * corporate actions produce suffixed roots. The chain reports whatever root
 * applies, so it still covers those. It cannot replace the primary path because
 * its strike window is centered on spot and omits strikes far from it.
 */
async function resolveViaChain(lookups: OptionQuoteLookup[]): Promise<Map<string, OptionQuoteRecord>> {
  const resolved = new Map<string, OptionQuoteRecord>();
  const groups = new Map<string, OptionQuoteLookup[]>();

  for (const lookup of lookups) {
    const groupKey = `${lookup.underlyingSymbol}|${lookup.optionType}`;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), lookup]);
  }

  await Promise.all(
    Array.from(groups.values()).map(async (group) => {
      const expMap = await fetchOptionChain(
        group[0].underlyingSymbol,
        group[0].optionType,
        group.map((lookup) => lookup.expirationDate),
      );
      if (!expMap) {
        return;
      }

      for (const lookup of group) {
        const contract = getOptionContract(expMap, lookup.expirationDate, lookup.strike);
        const quote = contract ? parseChainContract(contract, lookup) : null;
        if (quote) {
          resolved.set(lookup.key, quote);
        }
      }
    }),
  );

  return resolved;
}

function logOptionQuoteEvent(event: string, details: Record<string, unknown>): void {
  console.warn(JSON.stringify({ component: "mcp-option-quotes", event, ...details }));
}

/**
 * Quote each contract by its exact OCC symbol in one `get_quotes` call.
 *
 * This replaces fetching an option chain and scanning it for the strike. Schwab
 * returns a fixed number of strikes centered on the underlying price, so a
 * strike far from spot fell outside the window and silently produced no mark —
 * the failure mode that made a whole account's NLV unavailable.
 *
 * Returns null only when the provider itself is unreachable, which the caller
 * must distinguish from a contract that simply did not resolve.
 */
async function resolveOptionQuotes(lookups: OptionQuoteLookup[]): Promise<Map<string, OptionQuoteRecord | null> | null> {
  const resolved = new Map<string, OptionQuoteRecord | null>();
  if (lookups.length === 0) {
    return resolved;
  }

  const symbolLookups = lookups.filter((lookup) => lookup.occSymbol !== null);
  let quoteMap: Record<string, unknown> = {};

  if (symbolLookups.length > 0) {
    try {
      const quotePayload = await callMcpTool<unknown>("get_quotes", {
        symbols: Array.from(new Set(symbolLookups.map((lookup) => lookup.occSymbol as string))),
      });
      quoteMap = pickQuoteMap(quotePayload);
    } catch (error) {
      if (!(error instanceof McpUnavailableError)) {
        throw error;
      }

      logOptionQuoteEvent("provider_unavailable", {
        contractCount: symbolLookups.length,
        reason: error.message,
      });
      return null;
    }
  }

  const unresolved: OptionQuoteLookup[] = [];
  for (const lookup of lookups) {
    const quote = lookup.occSymbol ? parseOptionQuote(quoteMap[lookup.occSymbol], lookup) : null;
    if (quote) {
      resolved.set(lookup.key, quote);
    } else {
      unresolved.push(lookup);
    }
  }

  if (unresolved.length > 0) {
    const viaChain = await resolveViaChain(unresolved);
    for (const lookup of unresolved) {
      const quote = viaChain.get(lookup.key) ?? null;
      if (quote === null) {
        // The provider answered but this contract did not resolve by symbol or
        // in the chain. Logged separately from an outage so a genuine data gap
        // is never read as downtime.
        logOptionQuoteEvent("contract_not_found", {
          occSymbol: lookup.occSymbol,
          underlyingSymbol: lookup.underlyingSymbol,
          strike: lookup.strike,
          expirationDate: lookup.expirationDate,
        });
      }
      resolved.set(lookup.key, quote);
    }
  }

  return resolved;
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

  const responsePayload: Record<string, OptionQuoteRecord | null> = {};
  const lookups: OptionQuoteLookup[] = [];

  for (const request of requests) {
    const key = buildOptionQuoteRequestKey(request);
    const occSymbol = buildOccOptionSymbol({
      underlyingSymbol: request.symbol,
      expirationDate: request.expDate,
      optionType: request.contractType,
      strike: request.strike,
    });

    if (!occSymbol) {
      // Still attempted via the chain, which does not depend on the root.
      logOptionQuoteEvent("symbol_unbuildable", { requestKey: key });
    }

    lookups.push({
      key,
      occSymbol,
      underlyingSymbol: request.symbol.trim().toUpperCase(),
      strike: request.strike,
      optionType: request.contractType,
      expirationDate: request.expDate,
    });
  }

  const resolved = await resolveOptionQuotes(lookups);
  if (resolved === null) {
    return null;
  }

  for (const lookup of lookups) {
    responsePayload[lookup.key] = resolved.get(lookup.key) ?? null;
  }

  return responsePayload;
}

export async function getOptionQuotesBatch(legs: OptionQuoteBatchLeg[]): Promise<Map<string, number | null>> {
  const quotes = new Map<string, number | null>();
  const lookups: OptionQuoteLookup[] = [];

  for (const leg of legs) {
    const normalized = normalizeOptionBatchLeg(leg);
    if (!normalized) {
      continue;
    }

    // Every requested leg is present in the result, null until proven priced.
    quotes.set(normalized.instrumentKey, null);

    const occSymbol = buildOccOptionSymbol({
      underlyingSymbol: normalized.underlyingSymbol,
      expirationDate: normalized.expirationDate,
      optionType: normalized.optionType,
      strike: normalized.strike,
    });

    if (!occSymbol) {
      // Still attempted via the chain, which does not depend on the root.
      logOptionQuoteEvent("symbol_unbuildable", { instrumentKey: normalized.instrumentKey });
    }

    lookups.push({
      key: normalized.instrumentKey,
      occSymbol,
      underlyingSymbol: normalized.underlyingSymbol,
      strike: normalized.strike,
      optionType: normalized.optionType,
      expirationDate: normalized.expirationDate,
    });
  }

  const resolved = await resolveOptionQuotes(lookups);
  if (resolved === null) {
    return quotes;
  }

  for (const lookup of lookups) {
    quotes.set(lookup.key, resolved.get(lookup.key)?.mark ?? null);
  }

  return quotes;
}
