"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { openPositionsStore } from "@/store/openPositionsStore";
import type { AccountStartingCapitalSummary, NlvResult, OverviewSummaryResponse } from "@/types/api";

interface OverviewPayload {
  data: OverviewSummaryResponse;
}

interface StartingCapitalPayload {
  data: AccountStartingCapitalSummary;
}

export function useNetLiquidationValue(accountId: string): NlvResult {
  const { toExternalAccountId } = useAccountFilterContext();
  const positionSnapshot = useSyncExternalStore(
    openPositionsStore.subscribe,
    () => openPositionsStore.getSnapshot([accountId]),
    () => openPositionsStore.getSnapshot([accountId]),
  );

  const [cash, setCash] = useState(0);
  const [cashAsOf, setCashAsOf] = useState<Date | null>(null);
  const [progressReference, setProgressReference] = useState<number | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryUnavailable, setSummaryUnavailable] = useState(false);

  const accountPositions = positionSnapshot.positions;
  const externalAccountId = useMemo(() => toExternalAccountId(accountId), [accountId, toExternalAccountId]);
  const marksAsOf = useMemo(
    () => (positionSnapshot.lastRefreshedAt === null ? null : new Date(positionSnapshot.lastRefreshedAt)),
    [positionSnapshot.lastRefreshedAt],
  );
  const markedValue = useMemo(() => {
    if (accountPositions.length === 0) {
      return positionSnapshot.lastRefreshedAt === null ? null : 0;
    }

    let total = 0;
    for (const position of accountPositions) {
      const mark = positionSnapshot.quotes[position.instrumentKey];
      if (typeof mark !== "number") {
        return null;
      }

      total += mark * position.netQty * (position.assetClass === "OPTION" ? 100 : 1);
    }

    return total;
  }, [accountPositions, positionSnapshot.lastRefreshedAt, positionSnapshot.quotes]);

  useEffect(() => {
    let cancelled = false;

    async function loadNlv() {
      setSummaryLoading(true);
      setSummaryUnavailable(false);

      try {
        const summaryQuery = new URLSearchParams();
        const startingCapitalQuery = new URLSearchParams();
        applyAccountIdsToSearchParams(summaryQuery, [accountId]);
        applyAccountIdsToSearchParams(startingCapitalQuery, [accountId]);
        const [summaryResponse, startingCapitalResponse] = await Promise.all([
          fetch(`/api/overview/summary?${summaryQuery.toString()}`, { cache: "no-store" }),
          fetch(`/api/accounts/starting-capital?${startingCapitalQuery.toString()}`, { cache: "no-store" }),
        ]);

        if (!summaryResponse.ok) {
          throw new Error("Unable to load overview summary for NLV.");
        }
        if (!startingCapitalResponse.ok) {
          throw new Error("Unable to load starting capital for NLV.");
        }

        const [summaryPayload, startingCapitalPayload] = (await Promise.all([
          summaryResponse.json(),
          startingCapitalResponse.json(),
        ])) as [OverviewPayload, StartingCapitalPayload];
        const accountSnapshots = [...summaryPayload.data.snapshotSeries]
          .filter((snapshot) => snapshot.accountId === externalAccountId)
          .sort((left, right) => new Date(right.snapshotDate).getTime() - new Date(left.snapshotDate).getTime());

        const latestSnapshot = accountSnapshots[0];
        const latestStatementSnapshot = accountSnapshots.find((snapshot) => snapshot.totalCash !== null);
        const earliestSnapshot = accountSnapshots[accountSnapshots.length - 1];
        const configuredStartingCapital = startingCapitalPayload.data.byAccount[externalAccountId] ?? 0;

        const latestCash = Number(latestStatementSnapshot?.totalCash ?? latestSnapshot?.balance ?? 0);
        const latestCashAsOfIso = latestStatementSnapshot?.snapshotDate ?? latestSnapshot?.snapshotDate ?? null;
        const baselineValue = Number(earliestSnapshot?.totalCash ?? earliestSnapshot?.balance ?? 0);
        const baseline =
          Number.isFinite(configuredStartingCapital) && configuredStartingCapital > 0
            ? configuredStartingCapital
            : Number.isFinite(baselineValue) && baselineValue > 0
              ? baselineValue
              : null;

        if (!cancelled) {
          setCash(latestCash);
          setCashAsOf(latestCashAsOfIso ? new Date(latestCashAsOfIso) : null);
          setProgressReference(baseline);
          setSummaryLoading(false);
        }
      } catch {
        if (!cancelled) {
          setCash(0);
          setCashAsOf(null);
          setProgressReference(null);
          setSummaryUnavailable(true);
          setSummaryLoading(false);
        }
      }
    }

    void loadNlv();

    return () => {
      cancelled = true;
    };
  }, [accountId, externalAccountId]);

  const nlv = summaryUnavailable || markedValue === null ? null : cash + markedValue;
  const lastUpdated = summaryUnavailable || markedValue === null ? null : marksAsOf;
  const loading = summaryLoading || positionSnapshot.isLoading;

  return {
    nlv,
    cash,
    cashAsOf,
    marksAsOf,
    progressReference,
    lastUpdated,
    loading,
  };
}
