import { backfillLotExcursions, type BackfillLotExcursionsSummary } from "@/lib/analysis/backfill-lot-excursions";
import { backfillValueSnapshots, type BackfillValueSnapshotsSummary } from "@/lib/analysis/backfill-value-snapshots";

interface LoggerLike {
  log(message: string): void;
  warn(message: string): void;
}

export interface RefreshDerivedAnalysisInput {
  accountIds: string[];
  logger?: LoggerLike;
}

export interface RefreshDerivedAnalysisSummary {
  valueSnapshots: BackfillValueSnapshotsSummary;
  lotExcursions: BackfillLotExcursionsSummary;
}

function normalizeAccountIds(accountIds: string[]): string[] {
  return Array.from(
    new Set(
      accountIds
        .map((accountId) => accountId.trim())
        .filter((accountId) => accountId.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export async function refreshDerivedAnalysisForAccounts(input: RefreshDerivedAnalysisInput): Promise<RefreshDerivedAnalysisSummary> {
  const accountIds = normalizeAccountIds(input.accountIds);
  const logger = input.logger ?? console;

  if (accountIds.length === 0) {
    throw new Error("Cannot refresh derived analysis without at least one account id.");
  }

  logger.log(`[refresh:derived-analysis] refreshing accounts=${accountIds.join(",")}`);
  const valueSnapshots = await backfillValueSnapshots({ accountIds, logger });
  const lotExcursions = await backfillLotExcursions({ accountIds, logger });
  logger.log(
    `[refresh:derived-analysis] complete snapshots=${valueSnapshots.snapshotsUpserted} excursions=${lotExcursions.excursionsUpserted}`,
  );

  return {
    valueSnapshots,
    lotExcursions,
  };
}
