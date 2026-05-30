import { isAccountInScope } from "@/lib/api/account-scope";
import type { MatchedLotRecord } from "@/types/api";

export interface WinLossFlatCounts {
  WIN: number;
  LOSS: number;
  FLAT: number;
}

export function summarizeWinLossFlatRows(rows: MatchedLotRecord[], selectedAccounts: string[]): WinLossFlatCounts {
  const counts = { WIN: 0, LOSS: 0, FLAT: 0 };
  for (const row of rows) {
    if (!isAccountInScope(selectedAccounts, row.accountId)) {
      continue;
    }

    if (row.outcome === "WIN") {
      counts.WIN += 1;
    } else if (row.outcome === "LOSS") {
      counts.LOSS += 1;
    } else {
      counts.FLAT += 1;
    }
  }

  return counts;
}

export function winRateFromCounts(counts: WinLossFlatCounts): number | null {
  return counts.WIN + counts.LOSS === 0 ? null : (counts.WIN / (counts.WIN + counts.LOSS)) * 100;
}

export function winLossFlatChartData(counts: WinLossFlatCounts) {
  return [
    { name: "WIN", value: counts.WIN, color: "var(--pos)" },
    { name: "LOSS", value: counts.LOSS, color: "var(--neg)" },
    { name: "FLAT", value: counts.FLAT, color: "var(--text-2)" },
  ];
}
