import { detailResponse } from "@/lib/api/responses";
import { parseAccountIds } from "@/lib/api/account-scope";
import { prisma } from "@/lib/db/prisma";
import {
  resolvePositionSnapshotAccountIds,
  serializePositionSnapshotAccountIds,
  toPositionSnapshotMoneyString,
} from "@/lib/positions/position-snapshot";
import type { ReconciliationResponse } from "@/types/api";

function emptyResponse(): ReconciliationResponse {
  return {
    startingCapital: "0.00",
    startingCapitalConfigured: false,
    currentNlv: "0.00",
    totalGain: "0.00",
    unrealizedPnl: "0.00",
    cashAdjustments: "0.00",
    realizedPnl: "0.00",
    manualAdjustments: "0.00",
    unexplainedDelta: "0.00",
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedAccountIds = parseAccountIds(url.searchParams.get("accountIds"));
  const resolvedAccountIds = await resolvePositionSnapshotAccountIds(requestedAccountIds);
  const accountIdsJson = serializePositionSnapshotAccountIds(resolvedAccountIds);

  const snapshot = await prisma.positionSnapshot.findFirst({
    where: { accountIds: accountIdsJson },
    orderBy: [{ snapshotAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: {
      status: true,
      startingCapital: true,
      currentNlv: true,
      totalGain: true,
      unrealizedPnl: true,
      cashAdjustments: true,
      realizedPnl: true,
      manualAdjustments: true,
      unexplainedDelta: true,
    },
  });

  if (!snapshot) {
    return detailResponse(emptyResponse());
  }

  const payload: ReconciliationResponse = {
    startingCapital: toPositionSnapshotMoneyString(snapshot.startingCapital),
    startingCapitalConfigured: Number(snapshot.startingCapital ?? 0) > 0,
    currentNlv: toPositionSnapshotMoneyString(snapshot.currentNlv),
    totalGain: toPositionSnapshotMoneyString(snapshot.totalGain),
    unrealizedPnl: toPositionSnapshotMoneyString(snapshot.unrealizedPnl),
    cashAdjustments: toPositionSnapshotMoneyString(snapshot.cashAdjustments),
    realizedPnl: toPositionSnapshotMoneyString(snapshot.realizedPnl),
    manualAdjustments: toPositionSnapshotMoneyString(snapshot.manualAdjustments),
    unexplainedDelta: toPositionSnapshotMoneyString(snapshot.unexplainedDelta),
  };

  return detailResponse(payload);
}
