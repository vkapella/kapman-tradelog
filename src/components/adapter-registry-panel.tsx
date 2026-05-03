"use client";

import { useEffect, useState } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import type { AdapterSummaryRecord } from "@/types/api";

interface AdapterListPayload {
  data: AdapterSummaryRecord[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
  };
}

export function AdapterRegistryPanel() {
  const [loading, setLoading] = useState(true);
  const [adapters, setAdapters] = useState<AdapterSummaryRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAdapters() {
      try {
        const response = await fetch("/api/imports/adapters", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }

        const payload = (await response.json()) as AdapterListPayload;
        if (!cancelled) {
          setAdapters(payload.data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unknown error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAdapters();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <LoadingSkeleton lines={3} />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-400/40 bg-red-950/30 p-4 text-sm text-red-100">
        <p className="font-semibold">Unable to load adapter registry</p>
        <p className="mt-1">{error}</p>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-lg font-semibold text-text">Adapter Registry</h2>
      <p className="mt-1 text-sm text-text-2">Available broker adapters and declared coverage.</p>
      <ul className="mt-4 space-y-3">
        {adapters.map((adapter) => (
          <li key={adapter.id} className="rounded-xl border border-border bg-bg p-3">
            <div className="flex items-center justify-between gap-4">
              <p className="font-medium text-text">{adapter.displayName}</p>
              <span className="text-xs uppercase tracking-wide text-text-2">{adapter.status}</span>
            </div>
            <p className="mt-2 text-xs text-text-2">{adapter.coverage.notes}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
