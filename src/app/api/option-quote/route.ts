import { NextResponse } from "next/server";
import type { OptionQuoteRecord, QuoteUnavailableResponse } from "@/types/api";
import { getOptionQuote } from "@/lib/mcp/market-data";

interface OptionQuoteCacheEntry {
  expiresAtMs: number;
  value: OptionQuoteRecord;
}

const optionQuoteCache = new Map<string, OptionQuoteCacheEntry>();

function unavailable(): QuoteUnavailableResponse {
  return { error: "unavailable" };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();
  const strikeRaw = (url.searchParams.get("strike") ?? "").trim();
  const expDate = (url.searchParams.get("expDate") ?? "").trim();
  const contractType = (url.searchParams.get("contractType") ?? "").trim().toUpperCase();
  const forceRefresh = url.searchParams.get("refresh") === "1";
  const strike = Number(strikeRaw);

  if (!symbol || !expDate || !Number.isFinite(strike) || (contractType !== "CALL" && contractType !== "PUT")) {
    return NextResponse.json(unavailable());
  }

  const now = Date.now();
  const cacheKey = [symbol, String(strike), expDate, contractType].join("|");
  if (!forceRefresh) {
    const cached = optionQuoteCache.get(cacheKey);
    if (cached && cached.expiresAtMs > now) {
      return NextResponse.json(cached.value);
    }
  }

  try {
    const responsePayload = await getOptionQuote(symbol, strike, expDate, contractType);
    if (responsePayload === null) {
      return NextResponse.json(unavailable());
    }

    optionQuoteCache.set(cacheKey, {
      value: responsePayload,
      expiresAtMs: now + 30_000,
    });

    return NextResponse.json(responsePayload);
  } catch {
    return NextResponse.json(unavailable());
  }
}
