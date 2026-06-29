import { startPositionSnapshotCompute } from "@/lib/positions/compute-position-snapshot";
import type { PositionSnapshotComputeResponse } from "@/types/api";

export interface ImportPositionSnapshotRefreshResult {
  positionSnapshot: PositionSnapshotComputeResponse | null;
  warning: {
    code: "POSITION_SNAPSHOT_REFRESH_FAILED";
    message: string;
  } | null;
}

export async function startImportPositionSnapshotRefresh(accountId: string): Promise<ImportPositionSnapshotRefreshResult> {
  try {
    return {
      positionSnapshot: await startPositionSnapshotCompute([accountId]),
      warning: null,
    };
  } catch (error) {
    console.warn("[imports] failed to start position snapshot refresh", error);
    return {
      positionSnapshot: null,
      warning: {
        code: "POSITION_SNAPSHOT_REFRESH_FAILED",
        message: error instanceof Error ? error.message : "Position snapshot refresh failed after import commit.",
      },
    };
  }
}
