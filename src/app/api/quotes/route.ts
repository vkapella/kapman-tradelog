import { NextResponse } from "next/server";
import type { EquityQuoteRecord, QuoteUnavailableResponse, QuotesResponse } from "@/types/api";
import { getEquityQuotes } from "@/lib/mcp/market-data";

interface QuoteCacheEntry {
  expiresAtMs: number;
  value: QuotesResponse;
}

const quoteCache = new Map<string, QuoteCacheEntry>();

function unavailable(): QuoteUnavailableResponse {
  return { error: "unavailable" };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbolsRaw = url.searchParams.get("symbols") ?? "";
  const forceRefresh = url.searchParams.get("refresh") === "1";
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
  if (!forceRefresh) {
    const cached = quoteCache.get(cacheKey);
    if (cached && cached.expiresAtMs > now) {
      return NextResponse.json(cached.value);
    }
  }

  try {
    const responsePayload = await getEquityQuotes(symbols);
    if (responsePayload === null) {
      const payload = unavailable();
      return NextResponse.json(payload);
    }

    quoteCache.set(cacheKey, {
      value: responsePayload,
      expiresAtMs: now + 30_000,
    });

    return NextResponse.json(responsePayload);
  } catch {
    return NextResponse.json(unavailable());
  }
}
