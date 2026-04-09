import { detailResponse } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import type { OverviewSummaryResponse } from "@/types/api";

export async function GET() {
  const [executionCount, matchedLots, setupCount, snapshotCount] = await Promise.all([
    prisma.execution.count(),
    prisma.matchedLot.findMany({ select: { realizedPnl: true, holdingDays: true } }),
    prisma.setupGroup.count(),
    prisma.dailyAccountSnapshot.count(),
  ]);

  const totalPnl = matchedLots.reduce((sum, lot) => sum + Number(lot.realizedPnl), 0);
  const avgHold =
    matchedLots.length > 0
      ? matchedLots.reduce((sum, lot) => sum + lot.holdingDays, 0) / matchedLots.length
      : 0;

  const payload: OverviewSummaryResponse = {
    netPnl: totalPnl.toFixed(2),
    executionCount,
    matchedLotCount: matchedLots.length,
    setupCount,
    averageHoldDays: avgHold.toFixed(2),
    snapshotCount,
  };

  return detailResponse(payload);
}
