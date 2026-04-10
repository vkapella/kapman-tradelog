import type { Prisma } from "@prisma/client";
import type { NormalizedDailyAccountSnapshot } from "@/lib/adapters/types";

export interface ReplaceImportSnapshotsResult {
  parsed: number;
  upserted: number;
  deleted: number;
}

export async function replaceImportSnapshots(
  tx: Prisma.TransactionClient,
  importId: string,
  accountId: string,
  snapshots: NormalizedDailyAccountSnapshot[],
): Promise<ReplaceImportSnapshotsResult> {
  const snapshotDates = snapshots.map((snapshot) => snapshot.snapshotDate);

  const deleted = await tx.dailyAccountSnapshot.deleteMany({
    where: {
      accountId,
      sourceRef: importId,
      ...(snapshotDates.length > 0 ? { snapshotDate: { notIn: snapshotDates } } : {}),
    },
  });

  let upserted = 0;
  for (const snapshot of snapshots) {
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
