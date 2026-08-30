"use client";

import { useEffect, useState } from "react";
import type { HealthResponse } from "@/types/api";

/* UI-3 details panel: SHA and deployment id live here, never in the header
 * chip. Rows with no value are omitted entirely — "unknown" reads as a bug
 * rather than an absence (decision 06). */
export function ReleaseInfoCard() {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health", { cache: "no-store" })
      .then((response) => response.json() as Promise<HealthResponse>)
      .then((payload) => {
        if (!cancelled) {
          setHealth(payload);
        }
      })
      .catch(() => {
        /* card renders nothing on failure */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!health) {
    return null;
  }

  const rows: Array<[string, string]> = [["Version", health.version]];
  if (health.sha) {
    rows.push(["Commit", health.sha]);
  }
  if (health.machineId) {
    rows.push(["Machine", health.machineId]);
  }
  rows.push(["Database", health.db]);

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold text-text">Release</h2>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded border border-border bg-bg p-3">
            <dt className="text-text-3">{label}</dt>
            <dd className="mt-1 font-mono text-text">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
