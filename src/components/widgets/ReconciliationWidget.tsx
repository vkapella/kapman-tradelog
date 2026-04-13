"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { formatCurrency, safeNumber } from "@/components/widgets/utils";
import type { ReconciliationResponse } from "@/types/api";

interface ReconciliationPayload {
  data: ReconciliationResponse;
}

const RECONCILIATION_WIDGET_STALE_MS = 120_000;

interface ReconciliationWidgetCacheEntry {
  data: ReconciliationResponse | null;
  error: string | null;
  expiresAtMs: number;
  promise?: Promise<ReconciliationResponse>;
}

const reconciliationWidgetCache = new Map<string, ReconciliationWidgetCacheEntry>();

function signClass(value: number): string {
  if (value > 0) {
    return "text-accent-2";
  }
  if (value < 0) {
    return "text-red-300";
  }
  return "text-muted";
}

function buildCacheKey(selectedAccounts: string[]): string {
  return selectedAccounts.length > 0 ? [...selectedAccounts].sort((left, right) => left.localeCompare(right)).join(",") : "__all__";
}

export function ReconciliationWidget() {
  const { selectedAccounts } = useAccountFilterContext();
  const [data, setData] = useState<ReconciliationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      const cacheKey = buildCacheKey(selectedAccounts);
      const now = Date.now();
      const cached = reconciliationWidgetCache.get(cacheKey);

      if (cached?.data) {
        setData(cached.data);
      }
      if (cached?.error) {
        setError(cached.error);
      } else {
        setError(null);
      }

      if (cached && cached.expiresAtMs > now) {
        setLoading(false);
        return;
      }

      setLoading(!cached?.data);

      try {
        let requestPromise = cached?.promise;

        if (!requestPromise) {
          const query = new URLSearchParams();
          applyAccountIdsToSearchParams(query, selectedAccounts);
          requestPromise = fetch(`/api/overview/reconciliation?${query.toString()}`, { cache: "no-store" }).then(async (response) => {
            if (!response.ok) {
              throw new Error("Unable to load reconciliation.");
            }

            const payload = (await response.json()) as ReconciliationPayload;
            return payload.data;
          });

          reconciliationWidgetCache.set(cacheKey, {
            data: cached?.data ?? null,
            error: null,
            expiresAtMs: 0,
            promise: requestPromise,
          });
        }

        const nextData = await requestPromise;
        reconciliationWidgetCache.set(cacheKey, {
          data: nextData,
          error: null,
          expiresAtMs: Date.now() + RECONCILIATION_WIDGET_STALE_MS,
        });

        if (!cancelled) {
          setData(nextData);
          setError(null);
        }
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Unable to load reconciliation.";
        reconciliationWidgetCache.set(cacheKey, {
          data: cached?.data ?? null,
          error: message,
          expiresAtMs: Date.now() + RECONCILIATION_WIDGET_STALE_MS,
        });

        if (!cancelled) {
          setError(message);
          if (!cached?.data) {
            setData(null);
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts]);

  const rows = useMemo(() => {
    if (!data) {
      return [];
    }

    return [
      { label: "Starting Capital", value: safeNumber(data.startingCapital) },
      { label: "Current NLV", value: safeNumber(data.currentNlv) },
      { label: "Total Gain", value: safeNumber(data.totalGain) },
      { label: "Unrealized P&L", value: safeNumber(data.unrealizedPnl) },
      { label: "Cash Adjustments", value: safeNumber(data.cashAdjustments) },
      { label: "Realized P&L", value: safeNumber(data.realizedPnl) },
      { label: "Manual Adjustments", value: safeNumber(data.manualAdjustments) },
      { label: "Unexplained Delta", value: safeNumber(data.unexplainedDelta), highlighted: true },
    ];
  }, [data]);

  return (
    <WidgetCard title="Portfolio Reconciliation">
      {loading ? <p className="text-xs text-muted">Loading reconciliation…</p> : null}
      {!loading && error ? <p className="text-xs text-red-300">{error}</p> : null}
      {!loading && !error && data ? (
        <div className="space-y-2 text-xs">
          {!data.startingCapitalConfigured ? (
            <p className="rounded border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-amber-300">
              Set starting capital on the <code>/accounts</code> page to reconcile against your initial portfolio value.
            </p>
          ) : null}
          {rows.map((row) => {
            const rowClass = row.highlighted
              ? row.value === 0
                ? "text-accent-2"
                : "text-amber-300"
              : signClass(row.value);

            return (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <span className="text-muted">{row.label}</span>
                <span className={rowClass}>{formatCurrency(row.value)}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </WidgetCard>
  );
}
