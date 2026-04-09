import { NextResponse } from "next/server";
import type { EquityQuoteRecord, QuoteUnavailableResponse, QuotesResponse } from "@/types/api";
import { SchwabCredentialsUnavailableError, getAccessToken } from "@/lib/schwab-auth";

interface QuoteCacheEntry {
  expiresAtMs: number;
  value: QuotesResponse;
}

const quoteCache = new Map<string, QuoteCacheEntry>();

function numberOrZero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function unavailable(): QuoteUnavailableResponse {
  return { error: "unavailable" };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbolsRaw = url.searchParams.get("symbols") ?? "";
  const symbols = Array.from(
    new Set(
      symbolsRaw
        .split(",")
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));

  if (symbols.length === 0) {
    return NextResponse.json({} satisfies Record<string, EquityQuoteRecord>);
  }

  const cacheKey = symbols.join(",");
  const now = Date.now();
  const cached = quoteCache.get(cacheKey);
  if (cached && cached.expiresAtMs > now) {
    return NextResponse.json(cached.value);
  }

  try {
    const token = await getAccessToken();
    const upstream = await fetch(`https://api.schwabapi.com/marketdata/v1/quotes?symbols=${encodeURIComponent(cacheKey)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!upstream.ok) {
      const payload = unavailable();
      return NextResponse.json(payload);
    }

    const upstreamPayload = (await upstream.json()) as Record<string, unknown>;
    const responsePayload: Record<string, EquityQuoteRecord> = {};

    for (const symbol of symbols) {
      const quotePayload = upstreamPayload[symbol] ?? upstreamPayload[symbol.toLowerCase()];
      if (quotePayload) {
        responsePayload[symbol] = parseEquityQuote(quotePayload);
      }
    }

    quoteCache.set(cacheKey, {
      value: responsePayload,
      expiresAtMs: now + 30_000,
    });

    return NextResponse.json(responsePayload);
  } catch (error) {
    if (error instanceof SchwabCredentialsUnavailableError) {
      return NextResponse.json(unavailable());
    }

    return NextResponse.json(unavailable());
  }
}
