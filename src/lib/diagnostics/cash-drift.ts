import type { CashDriftRecord } from "@/types/api";

export const DEFAULT_CASH_DRIFT_TOLERANCE_ABS = 25;

export interface EngineCashRow {
  accountId: string;
  snapshotDate: Date;
  cashValue: { toString(): string } | number;
}

export interface BrokerCashRow {
  accountId: string;
  snapshotDate: Date;
  totalCash: { toString(): string } | number | null;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Compare the value engine's reconstructed cash with the broker-side daily
 * snapshot cash on every date both exist (#359). A gap that persists at nearly
 * the same size across dates is a missing or misclassified ledger row, not
 * market noise; a gap that appears on one date is a timing or import problem.
 */
export function computeCashDrift(
  accountIds: string[],
  engineRows: EngineCashRow[],
  brokerRows: BrokerCashRow[],
  toleranceAbs: number = DEFAULT_CASH_DRIFT_TOLERANCE_ABS,
): CashDriftRecord[] {
  return accountIds.map((accountId) => {
    const engineByDate = new Map<string, number>();
    for (const row of engineRows) {
      if (row.accountId === accountId) {
        engineByDate.set(dateKey(row.snapshotDate), Number(row.cashValue));
      }
    }
    const gaps: Array<{ date: string; engine: number; broker: number; gap: number }> = [];
    for (const row of brokerRows) {
      if (row.accountId !== accountId || row.totalCash === null) {
        continue;
      }
      const date = dateKey(row.snapshotDate);
      const engine = engineByDate.get(date);
      if (engine === undefined) {
        continue;
      }
      const broker = Number(row.totalCash);
      gaps.push({ date, engine, broker, gap: broker - engine });
    }
    gaps.sort((left, right) => left.date.localeCompare(right.date));
    const latest = gaps[gaps.length - 1];
    const overTolerance = gaps.filter((entry) => Math.abs(entry.gap) > toleranceAbs);
    // "Persistent" = at least three compared dates over tolerance whose gaps all
    // sit within one tolerance of each other (a level offset).
    const persistentOffset =
      overTolerance.length >= 3 &&
      Math.max(...overTolerance.map((entry) => entry.gap)) - Math.min(...overTolerance.map((entry) => entry.gap)) <= toleranceAbs;
    return {
      accountId,
      toleranceAbs,
      comparedDates: gaps.length,
      datesOverTolerance: overTolerance.length,
      latestDate: latest?.date ?? null,
      latestEngineCash: latest ? latest.engine.toFixed(2) : null,
      latestBrokerCash: latest ? latest.broker.toFixed(2) : null,
      latestGap: latest ? latest.gap.toFixed(2) : null,
      persistentOffset,
    };
  });
}
