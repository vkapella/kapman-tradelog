"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import type { ImportRecord } from "@/types/api";

interface ImportsPayload {
  data: ImportRecord[];
}

export function ImportHealthWidget() {
  const { isSelectedAccount } = useAccountFilterContext();
  const [rows, setRows] = useState<ImportRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      const response = await fetch("/api/imports?page=1&pageSize=1000", { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as ImportsPayload;
      if (!cancelled) {
        setRows(payload.data);
      }
    }

    void loadRows();

    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    const filtered = rows.filter((row) => isSelectedAccount(row.accountId));
    const committed = filtered.filter((row) => row.status === "COMMITTED").length;
    const failed = filtered.filter((row) => row.status === "FAILED").length;
    const parsedRows = filtered.reduce((sum, row) => sum + row.parsedRows, 0);
    const skippedRows = filtered.reduce((sum, row) => sum + row.skipped_parse + row.skipped_duplicate, 0);

    return {
      totalImports: filtered.length,
      committedImports: committed,
      failedImports: failed,
      parsedRows,
      skippedRows,
    };
  }, [rows, isSelectedAccount]);

  const healthy = summary.failedImports === 0 && summary.skippedRows === 0;

  return (
    <WidgetCard title="Import Health">
      <div className="space-y-1 text-xs text-muted">
        <p>Total imports: {summary.totalImports}</p>
        <p>Committed: {summary.committedImports}</p>
        <p>Failed: {summary.failedImports}</p>
        <p>Parsed rows: {summary.parsedRows}</p>
        <p>Skipped rows: {summary.skippedRows}</p>
      </div>
      <p className={healthy ? "mt-2 text-xs text-accent-2" : "mt-2 text-xs text-amber-300"}>{healthy ? "Healthy" : "Needs review"}</p>
      <Link href="/imports" className="mt-2 inline-block text-xs text-accent underline">
        View imports →
      </Link>
    </WidgetCard>
  );
}
