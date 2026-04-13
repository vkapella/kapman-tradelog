"use client";

import { useSyncExternalStore } from "react";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { openPositionsStore } from "@/store/openPositionsStore";
import type { OpenPosition } from "@/types/api";

export function useOpenPositions(): { positions: OpenPosition[]; loading: boolean; error: string | null } {
  const { selectedAccounts } = useAccountFilterContext();
  const snapshot = useSyncExternalStore(
    openPositionsStore.subscribe,
    () => openPositionsStore.getSnapshot(selectedAccounts),
    () => openPositionsStore.getSnapshot(selectedAccounts),
  );

  return {
    positions: snapshot.positions,
    loading: snapshot.isLoading,
    error: snapshot.error,
  };
}
