"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { useOpenPositions } from "@/hooks/useOpenPositions";
import type {
  NlvResult,
  OptionQuoteRecord,
  OptionQuoteResponse,
  OverviewSummaryResponse,
  QuoteUnavailableResponse,
  QuotesResponse,
} from "@/types/api";

interface OverviewPayload {
  data: OverviewSummaryResponse;
}

function isUnavailable(value: unknown): value is QuoteUnavailableResponse {
  return typeof value === "object" && value !== null && "error" in value && (value as { error?: string }).error === "unavailable";
}

export function useNetLiquidationValue(accountId: string): NlvResult {
  const { toExternalAccountId } = useAccountFilterContext();
  const { positions, loading: positionsLoading } = useOpenPositions();

  const [nlv, setNlv] = useState<number | null>(null);
  const [cash, setCash] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  const accountPositions = useMemo(() => positions.filter((position) => position.accountId === accountId), [accountId, positions]);
  const externalAccountId = useMemo(() => toExternalAccountId(accountId), [accountId, toExternalAccountId]);

  useEffect(() => {
    let cancelled = false;

    async function loadNlv() {
      if (positionsLoading) {
        setLoading(true);
        return;
      }

      setLoading(true);

      try {
        const summaryResponse = await fetch("/api/overview/summary", { cache: "no-store" });
        if (!summaryResponse.ok) {
          throw new Error("Unable to load overview summary for NLV.");
        }

        const summaryPayload = (await summaryResponse.json()) as OverviewPayload;
        const latestSnapshot = [...summaryPayload.data.snapshotSeries]
          .filter((snapshot) => snapshot.accountId === externalAccountId)
          .sort((left, right) => new Date(right.snapshotDate).getTime() - new Date(left.snapshotDate).getTime())[0];

        const latestCash = Number(latestSnapshot?.balance ?? 0);
        if (!cancelled) {
          setCash(latestCash);
        }

        const equityPositions = accountPositions.filter((position) => position.assetClass === "EQUITY");
        const optionPositions = accountPositions.filter((position) => position.assetClass === "OPTION");

        let quoteUnavailable = false;
        let equityValue = 0;
        let optionValue = 0;

        if (equityPositions.length > 0) {
          const symbols = Array.from(new Set(equityPositions.map((position) => position.symbol))).join(",");
          const quotesResponse = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols)}`, { cache: "no-store" });
          const quotesPayload = (await quotesResponse.json()) as QuotesResponse;

          if (isUnavailable(quotesPayload)) {
            quoteUnavailable = true;
          } else {
            for (const position of equityPositions) {
              const quote = quotesPayload[position.symbol];
              if (!quote) {
                quoteUnavailable = true;
                break;
              }

              equityValue += quote.mark * position.netQty;
            }
          }
        }

        if (!quoteUnavailable && optionPositions.length > 0) {
          const optionQuotes = await Promise.all(
            optionPositions.map(async (position) => {
              const expDate = position.expirationDate?.slice(0, 10);
              if (!position.optionType || !position.strike || !expDate) {
                return null;
              }

              const response = await fetch(
                `/api/option-quote?symbol=${encodeURIComponent(position.underlyingSymbol)}&strike=${encodeURIComponent(
                  position.strike,
                )}&expDate=${encodeURIComponent(expDate)}&contractType=${position.optionType}`,
                { cache: "no-store" },
              );

              return {
                key: position.instrumentKey,
                payload: (await response.json()) as OptionQuoteResponse,
              };
            }),
          );

          const optionQuoteMap = new Map<string, OptionQuoteRecord>();
          for (const quote of optionQuotes) {
            if (!quote || isUnavailable(quote.payload)) {
              quoteUnavailable = true;
              break;
            }

            optionQuoteMap.set(quote.key, quote.payload);
          }

          if (!quoteUnavailable) {
            for (const position of optionPositions) {
              const quote = optionQuoteMap.get(position.instrumentKey);
              if (!quote) {
                quoteUnavailable = true;
                break;
              }

              optionValue += quote.mark * 100 * position.netQty;
            }
          }
        }

        if (cancelled) {
          return;
        }

        if (quoteUnavailable) {
          setNlv(null);
          setLastUpdated(null);
          setLoading(false);
          return;
        }

        setNlv(latestCash + equityValue + optionValue);
        setLastUpdated(new Date());
        setLoading(false);
      } catch {
        if (!cancelled) {
          setNlv(null);
          setLastUpdated(null);
          setLoading(false);
        }
      }
    }

    void loadNlv();

    return () => {
      cancelled = true;
    };
  }, [accountId, accountPositions, externalAccountId, positionsLoading]);

  return {
    nlv,
    cash,
    lastUpdated,
    loading,
  };
}
