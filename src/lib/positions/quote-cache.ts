import type { OpenPosition } from "@/types/api";

export const POSITIONS_QUOTE_CACHE_KEY = "kapman_positions_cache";

export interface CachedQuoteEntry {
  ask: number | null;
  bid: number | null;
  mark: number | null;
}

export interface PositionsQuoteCache {
  timestamp: string;
  quotes: Record<string, CachedQuoteEntry>;
}

export function parsePositionsQuoteCache(raw: string | null): PositionsQuoteCache | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PositionsQuoteCache>;
    if (typeof parsed.timestamp !== "string" || !parsed.quotes || typeof parsed.quotes !== "object") {
      return null;
    }

    const quotes = Object.fromEntries(
      Object.entries(parsed.quotes).map(([instrumentKey, entry]) => {
        const value = entry as Partial<CachedQuoteEntry> | null | undefined;
        return [
          instrumentKey,
          {
            ask: typeof value?.ask === "number" ? value.ask : null,
            bid: typeof value?.bid === "number" ? value.bid : null,
            mark: typeof value?.mark === "number" ? value.mark : null,
          },
        ];
      }),
    );

    return {
      timestamp: parsed.timestamp,
      quotes,
    };
  } catch {
    return null;
  }
}

export function buildMarkMapFromQuoteCache(
  positions: OpenPosition[],
  quotes: Record<string, CachedQuoteEntry>,
): Record<string, number | null> {
  const markMap: Record<string, number | null> = {};

  for (const position of positions) {
    const quote = quotes[position.instrumentKey];
    if (!quote) {
      continue;
    }

    markMap[position.accountId + "::" + position.instrumentKey] = quote.mark;
  }

  return markMap;
}
