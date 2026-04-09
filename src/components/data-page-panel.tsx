"use client";

import { useEffect, useState } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";

interface PageStatsResponse {
  data: {
    accountTotal: number;
    importTotal: number;
    snapshotTotal: number;
  };
}

interface DataPagePanelProps {
  heading: string;
  nextAction: string;
}

export function DataPagePanel({ heading, nextAction }: DataPagePanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<PageStatsResponse["data"] | null>(null);

  useEffect(() => {
    let canceled = false;

    async function loadStats() {
      try {
        const response = await fetch("/api/page-stats", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }

        const payload = (await response.json()) as PageStatsResponse;
        if (!canceled) {
          setStats(payload.data);
        }
      } catch (requestError) {
        if (!canceled) {
          setError(requestError instanceof Error ? requestError.message : "Unknown error");
        }
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    }

    void loadStats();

    return () => {
      canceled = true;
    };
  }, []);

  if (loading) {
    return <LoadingSkeleton lines={4} />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-400/40 bg-red-950/30 p-6 text-sm text-red-100">
        <p className="font-semibold">Unable to load page data.</p>
        <p className="mt-2">{error}</p>
      </div>
    );
  }

  if (!stats || stats.accountTotal === 0) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-900/40 p-6">
        <h2 className="text-lg font-semibold text-slate-100">Empty state</h2>
        <p className="mt-2 text-sm text-slate-300">No accounts are currently available.</p>
        <p className="mt-3 text-sm text-blue-200">Next action: {nextAction}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/40 p-6">
      <h2 className="text-lg font-semibold text-slate-100">Populated state</h2>
      <p className="mt-2 text-sm text-slate-300">{heading}</p>
      <dl className="mt-4 grid gap-2 text-sm text-slate-200">
        <div className="flex justify-between gap-4">
          <dt>Accounts</dt>
          <dd>{stats.accountTotal}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Imports</dt>
          <dd>{stats.importTotal}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Snapshots</dt>
          <dd>{stats.snapshotTotal}</dd>
        </div>
      </dl>
    </div>
  );
}
