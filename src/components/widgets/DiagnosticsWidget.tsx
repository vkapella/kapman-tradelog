"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import type { DiagnosticsResponse } from "@/types/api";

interface DiagnosticsPayload {
  data: DiagnosticsResponse;
}

export function DiagnosticsWidget() {
  const { selectedAccounts } = useAccountFilterContext();
  const [data, setData] = useState<DiagnosticsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      const query = new URLSearchParams();
      applyAccountIdsToSearchParams(query, selectedAccounts);
      const response = await fetch(`/api/diagnostics?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as DiagnosticsPayload;
      if (!cancelled) {
        setData(payload.data);
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts]);

  const clear = Boolean(data && data.warningsCount === 0 && data.parseCoverage === 1 && data.matchingCoverage === 1);

  return (
    <WidgetCard title="Diagnostics Badge">
      {data ? (
        <div className="space-y-1 text-xs text-muted">
          <p>Parse coverage: {(data.parseCoverage * 100).toFixed(1)}%</p>
          <p>Matching coverage: {(data.matchingCoverage * 100).toFixed(1)}%</p>
          <p>Warnings: {data.warningsCount}</p>
          <p>Pair ambiguity: {data.setupInference.setupInferencePairAmbiguousTotal}</p>
          <p>Synthetic expiration: {data.syntheticExpirationCount}</p>
          <p className={clear ? "text-accent-2" : "text-amber-300"}>{clear ? "All clear" : data.warningsCount + " warnings"}</p>
          <Link href="/diagnostics" className="text-accent underline">
            View diagnostics →
          </Link>
        </div>
      ) : (
        <p className="text-xs text-muted">Diagnostics unavailable.</p>
      )}
    </WidgetCard>
  );
}
