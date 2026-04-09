"use client";

import { useEffect, useState } from "react";
import type { ExecutionRecord, MatchedLotRecord, OpenPosition } from "@/types/api";

interface ExecutionsPayload {
  data: ExecutionRecord[];
}

interface MatchedLotsPayload {
  data: MatchedLotRecord[];
}

function signedQuantity(side: string | null, quantity: number): number {
  return side === "SELL" ? quantity * -1 : quantity;
}

function fallbackInstrumentKey(execution: ExecutionRecord): string {
  const expiration = execution.expirationDate ? execution.expirationDate.slice(0, 10) : "";
  return [
    execution.accountId,
    execution.assetClass,
    execution.underlyingSymbol ?? execution.symbol,
    execution.optionType ?? "",
    execution.strike ?? "",
    expiration,
  ].join("|");
}

export function useOpenPositions(): { positions: OpenPosition[]; loading: boolean; error: string | null } {
  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPositions() {
      setLoading(true);
      setError(null);

      try {
        const [executionResponse, matchedLotsResponse] = await Promise.all([
          fetch("/api/executions?page=1&pageSize=1000", { cache: "no-store" }),
          fetch("/api/matched-lots?page=1&pageSize=1000", { cache: "no-store" }),
        ]);

        if (!executionResponse.ok || !matchedLotsResponse.ok) {
          throw new Error("Unable to load open position inputs.");
        }

        const executionsPayload = (await executionResponse.json()) as ExecutionsPayload;
        const matchedLotsPayload = (await matchedLotsResponse.json()) as MatchedLotsPayload;

        const matchedOpenExecutionIds = new Set(matchedLotsPayload.data.map((row) => row.openExecutionId));
        const grouped = new Map<string, OpenPosition>();

        for (const execution of executionsPayload.data) {
          if (execution.openingClosingEffect !== "TO_OPEN") {
            continue;
          }

          if (matchedOpenExecutionIds.has(execution.id)) {
            continue;
          }

          const key = execution.instrumentKey ?? fallbackInstrumentKey(execution);
          const groupKey = execution.accountId + "::" + key;
          const quantity = Number(execution.quantity);
          const price = Number(execution.price ?? 0);
          const qtySigned = signedQuantity(execution.side, quantity);

          const existing = grouped.get(groupKey);
          if (existing) {
            existing.netQty += qtySigned;
            existing.costBasis += qtySigned * price;
            continue;
          }

          grouped.set(groupKey, {
            symbol: execution.symbol,
            underlyingSymbol: execution.underlyingSymbol ?? execution.symbol,
            assetClass: execution.assetClass === "OPTION" ? "OPTION" : "EQUITY",
            optionType: execution.optionType === "CALL" || execution.optionType === "PUT" ? execution.optionType : null,
            strike: execution.strike,
            expirationDate: execution.expirationDate,
            instrumentKey: key,
            netQty: qtySigned,
            costBasis: qtySigned * price,
            accountId: execution.accountId,
          });
        }

        const openPositions = Array.from(grouped.values())
          .filter((position) => position.netQty !== 0)
          .sort((left, right) => {
            const symbolOrder = left.underlyingSymbol.localeCompare(right.underlyingSymbol);
            if (symbolOrder !== 0) {
              return symbolOrder;
            }

            return left.instrumentKey.localeCompare(right.instrumentKey);
          });

        if (!cancelled) {
          setPositions(openPositions);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to compute open positions.");
          setPositions([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPositions();

    return () => {
      cancelled = true;
    };
  }, []);

  return { positions, loading, error };
}
