"use client";

import { useEffect, useState } from "react";
import { AdjustmentForm } from "@/components/adjustments/adjustment-form";
import { AdjustmentList } from "@/components/adjustments/adjustment-list";
import { AdjustmentPreview } from "@/components/adjustments/adjustment-preview";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import type { AccountLedgerRebuildApiResponse, AdjustmentPreviewResponse, ApiErrorResponse, ManualAdjustmentRecord } from "@/types/api";

interface AdjustmentListPayload {
  data: ManualAdjustmentRecord[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
  };
}

export default function Page() {
  const { selectedAccounts } = useAccountFilterContext();
  const [adjustments, setAdjustments] = useState<ManualAdjustmentRecord[]>([]);
  const [preview, setPreview] = useState<AdjustmentPreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [rebuildMessage, setRebuildMessage] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  const activeAccountId = selectedAccounts.length === 1 ? selectedAccounts[0] : null;

  async function loadAdjustments() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/adjustments?page=1&pageSize=1000", { cache: "no-store" });
      const payload = (await response.json()) as AdjustmentListPayload;
      if (!response.ok) {
        throw new Error("Unable to load adjustments.");
      }
      setAdjustments(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load adjustments.");
      setAdjustments([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAdjustments();
  }, []);

  async function handleReverse(adjustmentId: string) {
    setReversingId(adjustmentId);
    setError(null);
    setRebuildMessage(null);
    try {
      const response = await fetch(`/api/adjustments/${adjustmentId}/reverse`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Reverse failed.");
      }
      await loadAdjustments();
    } catch (reverseError) {
      setError(reverseError instanceof Error ? reverseError.message : "Reverse failed.");
    } finally {
      setReversingId(null);
    }
  }

  async function handleRebuildLedger() {
    if (!activeAccountId) {
      setError("Select a single account to rebuild.");
      setRebuildMessage(null);
      return;
    }

    setRebuilding(true);
    setError(null);
    setRebuildMessage(null);
    try {
      const response = await fetch(`/api/accounts/${activeAccountId}/rebuild-ledger`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const payload = (await response.json()) as AccountLedgerRebuildApiResponse;
      if (!response.ok || !("data" in payload)) {
        const errorPayload = payload as ApiErrorResponse;
        throw new Error(errorPayload.error?.message ?? "Ledger rebuild failed.");
      }

      setRebuildMessage(
        `Rebuild complete - ${payload.data.matchedLotsPersisted} matched lots, ${payload.data.warningsCleared} warnings cleared.`,
      );
    } catch (rebuildError) {
      setError(rebuildError instanceof Error ? rebuildError.message : "Ledger rebuild failed.");
    } finally {
      setRebuilding(false);
    }
  }

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-border bg-panel p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-text">Manual Adjustments</p>
            <p className="mt-1 text-xs text-muted">
              Add auditable reconciliation overlays for corporate actions and exceptional corrections without mutating raw executions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleRebuildLedger()}
            disabled={!activeAccountId || rebuilding}
            title={!activeAccountId ? "Select a single account to rebuild." : undefined}
            className="rounded border border-border bg-panel-2 px-3 py-2 text-xs font-medium text-text disabled:cursor-not-allowed disabled:opacity-50"
          >
            {rebuilding ? "Rebuilding..." : "Rebuild Ledger"}
          </button>
        </div>
      </header>

      {error ? <p className="rounded border border-red-400/60 bg-red-400/10 px-3 py-2 text-xs text-red-200">{error}</p> : null}
      {rebuildMessage ? <p className="rounded border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent">{rebuildMessage}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <AdjustmentForm
          onPreview={setPreview}
          onCreated={(created) => {
            setAdjustments((current) => [...current, created].sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate)));
          }}
        />
        <AdjustmentPreview preview={preview} />
      </div>

      {loading ? <p className="text-xs text-muted">Loading adjustments...</p> : null}
      {!loading ? <AdjustmentList adjustments={adjustments} onReverse={handleReverse} reversingId={reversingId} /> : null}
    </section>
  );
}
