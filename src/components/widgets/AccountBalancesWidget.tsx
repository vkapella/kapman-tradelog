"use client";

import { useEffect, useMemo, useState } from "react";
import { AccountLabel } from "@/components/accounts/AccountLabel";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { usePositionSnapshot } from "@/hooks/usePositionSnapshot";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { formatCurrency, safeNumber } from "@/components/widgets/utils";
import type { AccountStartingCapitalSummary, OverviewSummaryResponse, PositionSnapshotOpenPosition } from "@/types/api";

interface OverviewPayload {
  data: OverviewSummaryResponse;
}

interface StartingCapitalPayload {
  data: AccountStartingCapitalSummary;
}

interface AccountBalanceMetrics {
  cash: number;
  cashAsOf: Date | null;
  marksAsOf: Date | null;
  progressReference: number | null;
  nlv: number | null;
  loading: boolean;
}

function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatTime(value: Date | null): string {
  if (!value) {
    return "unavailable";
  }

  return value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function deriveAccountMetrics(
  accountId: string,
  externalAccountId: string,
  snapshotPositions: PositionSnapshotOpenPosition[],
  snapshotAt: string | null,
  summary: OverviewSummaryResponse | null,
  startingCapital: AccountStartingCapitalSummary | null,
  loading: boolean,
): AccountBalanceMetrics {
  const marksAsOf = snapshotAt ? new Date(snapshotAt) : null;
  const positions = snapshotPositions.filter((position) => position.accountId === accountId);

  const accountSnapshots = [...(summary?.snapshotSeries ?? [])]
    .filter((entry) => entry.accountId === externalAccountId)
    .sort((left, right) => new Date(right.snapshotDate).getTime() - new Date(left.snapshotDate).getTime());
  const latestSnapshot = accountSnapshots[0];
  const latestStatementSnapshot = accountSnapshots.find((entry) => entry.totalCash !== null);
  const earliestSnapshot = accountSnapshots[accountSnapshots.length - 1];
  const configuredStartingCapital = startingCapital?.byAccount[externalAccountId] ?? 0;

  const cash = Number(latestStatementSnapshot?.totalCash ?? latestSnapshot?.balance ?? 0);
  const cashAsOfIso = latestStatementSnapshot?.snapshotDate ?? latestSnapshot?.snapshotDate ?? null;
  const cashAsOf = cashAsOfIso ? new Date(cashAsOfIso) : null;
  const baselineValue = Number(earliestSnapshot?.totalCash ?? earliestSnapshot?.balance ?? 0);
  const progressReference =
    Number.isFinite(configuredStartingCapital) && configuredStartingCapital > 0
      ? configuredStartingCapital
      : Number.isFinite(baselineValue) && baselineValue > 0
        ? baselineValue
        : null;

  let markedValue: number | null = null;
  if (marksAsOf) {
    markedValue = 0;
    for (const position of positions) {
      if (typeof position.mark !== "number") {
        markedValue = null;
        break;
      }

      markedValue += position.mark * position.netQty * (position.assetClass === "OPTION" ? 100 : 1);
    }
  }

  return {
    cash,
    cashAsOf,
    marksAsOf,
    progressReference,
    nlv: markedValue === null ? null : cash + markedValue,
    loading,
  };
}

function AccountBalanceRow({ accountId, metrics }: { accountId: string; metrics: AccountBalanceMetrics }) {
  const { nlv, cash, cashAsOf, marksAsOf, progressReference, loading } = metrics;
  const value = nlv ?? cash;
  const base = progressReference ?? Math.max(Math.abs(value), 1);
  const progress = Math.max(0, Math.min(100, (value / base) * 100));
  const staleCash = cashAsOf && marksAsOf ? toDateKey(cashAsOf) !== toDateKey(marksAsOf) : false;

  return (
    <div className={["rounded-lg border bg-panel-2 p-3", staleCash ? "border-amber-400/70" : "border-border"].join(" ")}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-text">
          <AccountLabel accountId={accountId} />
        </p>
        <p className="text-[11px] text-muted">{loading ? "Updating..." : marksAsOf ? formatTime(marksAsOf) : "Snapshot unavailable"}</p>
      </div>
      <p className="mt-1 text-xs text-muted">Cash: {formatCurrency(cash)}</p>
      <p className="text-[11px] text-muted">Cash as of: {cashAsOf ? cashAsOf.toISOString().slice(0, 10) : "unknown"}</p>
      <p className="text-[11px] text-muted">Marks as of: {formatTime(marksAsOf)}</p>
      {staleCash ? (
        <p className="mt-1 rounded border border-amber-400/70 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200">
          Cash snapshot date differs from marks date.
        </p>
      ) : null}
      <p className="text-sm font-semibold text-text">{nlv === null ? "NLV unavailable" : "NLV: " + formatCurrency(nlv)}</p>
      <p className="text-[10px] text-muted">Scale base: {formatCurrency(base)}</p>
      <div className="mt-2 h-2 rounded bg-panel">
        <div className="h-2 rounded bg-accent" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

export function AccountBalancesWidget() {
  const { selectedAccounts, toExternalAccountId } = useAccountFilterContext();
  const { snapshot, loading: snapshotLoading, computing, error: snapshotError, triggerCompute } = usePositionSnapshot(selectedAccounts);
  const [summary, setSummary] = useState<OverviewSummaryResponse | null>(null);
  const [startingCapital, setStartingCapital] = useState<AccountStartingCapitalSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAccountContext(): Promise<void> {
      setSummaryLoading(true);
      setSummaryError(null);

      try {
        const summaryQuery = new URLSearchParams();
        const startingCapitalQuery = new URLSearchParams();
        applyAccountIdsToSearchParams(summaryQuery, selectedAccounts);
        applyAccountIdsToSearchParams(startingCapitalQuery, selectedAccounts);

        const [summaryResponse, startingCapitalResponse] = await Promise.all([
          fetch(`/api/overview/summary?${summaryQuery.toString()}`, { cache: "no-store", signal: controller.signal }),
          fetch(`/api/accounts/starting-capital?${startingCapitalQuery.toString()}`, { cache: "no-store", signal: controller.signal }),
        ]);

        if (!summaryResponse.ok || !startingCapitalResponse.ok) {
          throw new Error("Unable to load account balance context.");
        }

        const [summaryPayload, startingCapitalPayload] = (await Promise.all([
          summaryResponse.json(),
          startingCapitalResponse.json(),
        ])) as [OverviewPayload, StartingCapitalPayload];

        if (controller.signal.aborted) {
          return;
        }

        setSummary(summaryPayload.data);
        setStartingCapital(startingCapitalPayload.data);
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        setSummary(null);
        setStartingCapital(null);
        setSummaryError(loadError instanceof Error ? loadError.message : "Unable to load account balance context.");
      } finally {
        if (!controller.signal.aborted) {
          setSummaryLoading(false);
        }
      }
    }

    void loadAccountContext();

    return () => {
      controller.abort();
    };
  }, [selectedAccounts]);

  const metricsByAccount = useMemo(() => {
    return Object.fromEntries(
      selectedAccounts.map((accountId) => [
        accountId,
        deriveAccountMetrics(
          accountId,
          toExternalAccountId(accountId),
          snapshot?.positions ?? [],
          snapshot?.snapshotAt ?? null,
          summary,
          startingCapital,
          snapshotLoading || summaryLoading,
        ),
      ]),
    ) as Record<string, AccountBalanceMetrics>;
  }, [selectedAccounts, snapshot, summary, startingCapital, snapshotLoading, summaryLoading, toExternalAccountId]);

  const action = (
    <button
      type="button"
      onClick={() => void triggerCompute()}
      disabled={computing}
      className="rounded border border-border bg-panel-2 px-2 py-0.5 text-[10px] text-muted disabled:opacity-50"
    >
      {computing ? "Computing..." : "Refresh"}
    </button>
  );

  return (
    <WidgetCard title="Account Balances + NLV" action={action}>
      <div className="space-y-2">
        {selectedAccounts.length === 0 ? <p className="text-xs text-muted">No accounts selected.</p> : null}
        {snapshotError ? <p className="text-xs text-red-300">{snapshotError}</p> : null}
        {summaryError ? <p className="text-xs text-red-300">{summaryError}</p> : null}
        {!snapshot && !snapshotLoading && !snapshotError ? (
          <p className="text-xs text-muted">No snapshot available. Refresh to compute account balances.</p>
        ) : null}
        {selectedAccounts.map((accountId) => (
          <AccountBalanceRow key={accountId} accountId={accountId} metrics={metricsByAccount[accountId]} />
        ))}
      </div>
    </WidgetCard>
  );
}
