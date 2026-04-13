import { NextResponse } from "next/server";
import { parseAccountIds } from "@/lib/api/account-scope";
import { prisma } from "@/lib/db/prisma";
import {
  parsePositionSnapshotPositionsJson,
  resolvePositionSnapshotAccountIds,
  serializePositionSnapshotAccountIds,
  toPositionSnapshotMoneyString,
} from "@/lib/positions/position-snapshot";
import type { PositionSnapshotResponse, PositionSnapshotResponseData } from "@/types/api";

type SnapshotRow = {
  id: string;
  snapshotAt: Date;
  status: "PENDING" | "COMPLETE" | "FAILED";
  errorMessage: string | null;
  positionsJson: string;
  unrealizedPnl: { toString(): string } | null;
  realizedPnl: { toString(): string } | null;
  cashAdjustments: { toString(): string } | null;
  manualAdjustments: { toString(): string } | null;
  currentNlv: { toString(): string } | null;
  startingCapital: { toString(): string } | null;
  totalGain: { toString(): string } | null;
  unexplainedDelta: { toString(): string } | null;
};

function mapSnapshotRow(row: SnapshotRow): PositionSnapshotResponseData {
  return {
    id: row.id,
    snapshotAt: row.snapshotAt.toISOString(),
    status: row.status,
    errorMessage: row.errorMessage ?? undefined,
    positions: parsePositionSnapshotPositionsJson(row.positionsJson),
    unrealizedPnl: toPositionSnapshotMoneyString(row.unrealizedPnl),
    realizedPnl: toPositionSnapshotMoneyString(row.realizedPnl),
    cashAdjustments: toPositionSnapshotMoneyString(row.cashAdjustments),
    manualAdjustments: toPositionSnapshotMoneyString(row.manualAdjustments),
    currentNlv: toPositionSnapshotMoneyString(row.currentNlv),
    startingCapital: toPositionSnapshotMoneyString(row.startingCapital),
    totalGain: toPositionSnapshotMoneyString(row.totalGain),
    unexplainedDelta: toPositionSnapshotMoneyString(row.unexplainedDelta),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const snapshotId = url.searchParams.get("snapshotId");

  let snapshot: SnapshotRow | null;
  if (snapshotId) {
    snapshot = await prisma.positionSnapshot.findUnique({
      where: { id: snapshotId },
      select: {
        id: true,
        snapshotAt: true,
        status: true,
        errorMessage: true,
        positionsJson: true,
        unrealizedPnl: true,
        realizedPnl: true,
        cashAdjustments: true,
        manualAdjustments: true,
        currentNlv: true,
        startingCapital: true,
        totalGain: true,
        unexplainedDelta: true,
      },
    });
  } else {
    const requestedAccountIds = parseAccountIds(url.searchParams.get("accountIds"));
    const resolvedAccountIds = await resolvePositionSnapshotAccountIds(requestedAccountIds);
    const accountIdsJson = serializePositionSnapshotAccountIds(resolvedAccountIds);

    snapshot = await prisma.positionSnapshot.findFirst({
      where: { accountIds: accountIdsJson },
      orderBy: [{ snapshotAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        snapshotAt: true,
        status: true,
        errorMessage: true,
        positionsJson: true,
        unrealizedPnl: true,
        realizedPnl: true,
        cashAdjustments: true,
        manualAdjustments: true,
        currentNlv: true,
        startingCapital: true,
        totalGain: true,
        unexplainedDelta: true,
      },
    });
  }

  if (!snapshot) {
    const payload: PositionSnapshotResponse = {
      data: null,
      meta: {
        snapshotExists: false,
      },
    };
    return NextResponse.json(payload);
  }

  const snapshotAge = Math.max(0, Math.floor((Date.now() - snapshot.snapshotAt.getTime()) / 1000));
  const payload: PositionSnapshotResponse = {
    data: mapSnapshotRow(snapshot),
    meta: {
      snapshotExists: true,
      snapshotAge,
    },
  };

  return NextResponse.json(payload);
}
