"use client";

import { useEffect, useState } from "react";
import type { ExecutionRecord, ManualAdjustmentRecord, OpenPosition, AdjustmentsListApiResponse, MatchedLotRecord } from "@/types/api";
import { computeOpenPositions } from "@/lib/positions/compute-open-positions";

interface ExecutionsPayload {
  data: ExecutionRecord[];
}

interface MatchedLotsPayload {
  data: MatchedLotRecord[];
}

interface AdjustmentsPayload {
  data: ManualAdjustmentRecord[];
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
        let manualAdjustments: ManualAdjustmentRecord[] = [];
        try {
          const adjustmentsResponse = await fetch("/api/adjustments?page=1&pageSize=1000&status=ACTIVE", { cache: "no-store" });
          if (adjustmentsResponse.ok) {
            const adjustmentsPayload = (await adjustmentsResponse.json()) as AdjustmentsPayload | AdjustmentsListApiResponse;
            if ("data" in adjustmentsPayload && Array.isArray(adjustmentsPayload.data)) {
              manualAdjustments = adjustmentsPayload.data as ManualAdjustmentRecord[];
            }
          }
        } catch {
          manualAdjustments = [];
        }

        const openPositions = computeOpenPositions(executionsPayload.data, matchedLotsPayload.data, manualAdjustments);

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
