import type { Prisma } from "@prisma/client";
import type { NormalizedDailyAccountSnapshot } from "@/lib/adapters/types";

export interface ReplaceImportSnapshotsResult {
  parsed: number;
  upserted: number;
  deleted: number;
}

function snapshotPriority(snapshot: NormalizedDailyAccountSnapshot): number {
  if (snapshot.totalCash != null && snapshot.brokerNetLiquidationValue != null) {
    return 3;
  }

  if (snapshot.totalCash != null) {
    return 2;
  }

  return 1;
}

function collapseSnapshots(snapshots: NormalizedDailyAccountSnapshot[]): NormalizedDailyAccountSnapshot[] {
  const bestByDate = new Map<string, NormalizedDailyAccountSnapshot>();

  for (const snapshot of snapshots) {
    const key = snapshot.snapshotDate.toISOString();
    const existing = bestByDate.get(key);
    if (!existing || snapshotPriority(snapshot) > snapshotPriority(existing)) {
      bestByDate.set(key, snapshot);
    }
  }

  return Array.from(bestByDate.values()).sort((left, right) => left.snapshotDate.getTime() - right.snapshotDate.getTime());
}

export async function replaceImportSnapshots(
  tx: Prisma.TransactionClient,
  importId: string,
  accountId: string,
  snapshots: NormalizedDailyAccountSnapshot[],
): Promise<ReplaceImportSnapshotsResult> {
  const collapsedSnapshots = collapseSnapshots(snapshots);
  const snapshotDates = collapsedSnapshots.map((snapshot) => snapshot.snapshotDate);

  const deleted = await tx.dailyAccountSnapshot.deleteMany({
    where: {
      accountId,
      sourceRef: importId,
      ...(snapshotDates.length > 0 ? { snapshotDate: { notIn: snapshotDates } } : {}),
    },
  });

  let upserted = 0;
  for (const snapshot of collapsedSnapshots) {
    await tx.dailyAccountSnapshot.upsert({
      where: {
        accountId_snapshotDate: {
          accountId,
          snapshotDate: snapshot.snapshotDate,
        },
      },
      update: {
        balance: snapshot.balance,
        totalCash: snapshot.totalCash ?? null,
        brokerNetLiquidationValue: snapshot.brokerNetLiquidationValue ?? null,
        sourceRef: importId,
      },
      create: {
        accountId,
        snapshotDate: snapshot.snapshotDate,
        balance: snapshot.balance,
        totalCash: snapshot.totalCash ?? null,
        brokerNetLiquidationValue: snapshot.brokerNetLiquidationValue ?? null,
        sourceRef: importId,
      },
    });
    upserted += 1;
  }

  return {
    parsed: snapshots.length,
    upserted,
    deleted: deleted.count,
  };
}
