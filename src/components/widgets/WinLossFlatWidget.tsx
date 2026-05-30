"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { WinLossFlatChart } from "@/components/widgets/WinLossFlatChart";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { RangeFilterContext } from "@/contexts/RangeFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { summarizeWinLossFlatRows } from "@/lib/metrics/win-loss-flat";
import type { MatchedLotRecord } from "@/types/api";

interface MatchedLotsPayload {
  data: MatchedLotRecord[];
}

export { summarizeWinLossFlatRows } from "@/lib/metrics/win-loss-flat";

export function WinLossFlatWidget() {
  const { selectedAccounts } = useAccountFilterContext();
  const { range, applyRangeToSearchParams } = useContext(RangeFilterContext);
  const [rows, setRows] = useState<MatchedLotRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      const query = new URLSearchParams({ page: "1", pageSize: "1000" });
      applyAccountIdsToSearchParams(query, selectedAccounts);
      applyRangeToSearchParams(query);
      const response = await fetch(`/api/matched-lots?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as MatchedLotsPayload;
      if (!cancelled) {
        setRows(payload.data);
      }
    }

    void loadRows();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts, range.startDate, range.endDate, applyRangeToSearchParams]);

  const counts = useMemo(() => summarizeWinLossFlatRows(rows, selectedAccounts), [rows, selectedAccounts]);

  return (
    <WidgetCard title="Win / Loss / Flat">
      <WinLossFlatChart counts={counts} />
    </WidgetCard>
  );
}
