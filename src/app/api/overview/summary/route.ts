import { detailResponse } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import type { OverviewSummaryResponse } from "@/types/api";

export async function GET() {
  const [executionCount, matchedLots, setupCount, imports, snapshots] = await Promise.all([
    prisma.execution.count(),
    prisma.matchedLot.findMany({ select: { realizedPnl: true, holdingDays: true } }),
    prisma.setupGroup.count(),
    prisma.import.findMany({ select: { status: true, parsedRows: true, skippedRows: true } }),
    prisma.dailyAccountSnapshot.findMany({
      include: {
        account: {
          select: { accountId: true },
        },
      },
      orderBy: [{ snapshotDate: "asc" }, { id: "asc" }],
      take: 500,
    }),
  ]);

  const totalPnl = matchedLots.reduce((sum, lot) => sum + Number(lot.realizedPnl), 0);
  const avgHold =
    matchedLots.length > 0
      ? matchedLots.reduce((sum, lot) => sum + lot.holdingDays, 0) / matchedLots.length
      : 0;
  const parsedRows = imports.reduce((sum, row) => sum + row.parsedRows, 0);
  const skippedRows = imports.reduce((sum, row) => sum + row.skippedRows, 0);
  const committedImports = imports.filter((row) => row.status === "COMMITTED").length;
  const failedImports = imports.filter((row) => row.status === "FAILED").length;

  const payload: OverviewSummaryResponse = {
    netPnl: totalPnl.toFixed(2),
    executionCount,
    matchedLotCount: matchedLots.length,
    setupCount,
    averageHoldDays: avgHold.toFixed(2),
    snapshotCount: snapshots.length,
    importQuality: {
      totalImports: imports.length,
      committedImports,
      failedImports,
      parsedRows,
      skippedRows,
    },
    snapshotSeries: snapshots.map((snapshot) => ({
      accountId: snapshot.account.accountId,
      snapshotDate: snapshot.snapshotDate.toISOString(),
      balance: snapshot.balance.toString(),
    })),
  };

  return detailResponse(payload);
}
