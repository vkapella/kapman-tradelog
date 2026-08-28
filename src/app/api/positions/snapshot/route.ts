import { NextResponse } from "next/server";
import { serializeDataRevision } from "@/lib/accounts/data-revision";
import { parseAccountIds } from "@/lib/api/account-scope";
import { prisma } from "@/lib/db/prisma";
import {
  parsePositionSnapshotAccountValuesJson,
  parsePositionSnapshotPositionsJson,
  resolvePositionSnapshotAccountIds,
  serializePositionSnapshotAccountIds,
  toPositionSnapshotMoneyString,
} from "@/lib/positions/position-snapshot";
import { loadAccountBalanceContext } from "@/lib/accounts/account-balance-context";
import { resolveLiveAccountValue, sumCompleteReconstructedNlv } from "@/lib/positions/live-account-value";
import type { PositionSnapshotResponse, PositionSnapshotResponseData } from "@/types/api";

type SnapshotRow = {
  id: string;
  snapshotAt: Date;
  createdAt: Date;
  status: "PENDING" | "COMPLETE" | "FAILED";
  errorMessage: string | null;
  accountIds: string;
  positionsJson: string;
  accountValuesJson: string;
  unrealizedPnl: { toString(): string } | null;
  realizedPnl: { toString(): string } | null;
  cashAdjustments: { toString(): string } | null;
  manualAdjustments: { toString(): string } | null;
  currentNlv: { toString(): string } | null;
  startingCapital: { toString(): string } | null;
  totalGain: { toString(): string } | null;
  unexplainedDelta: { toString(): string } | null;
};

function parseScopeAccountIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function mapSnapshotRow(row: SnapshotRow): Promise<PositionSnapshotResponseData> {
  const positions = parsePositionSnapshotPositionsJson(row.positionsJson);
  const scopeAccountIds = parseScopeAccountIds(row.accountIds);
  let accountValues = parsePositionSnapshotAccountValuesJson(row.accountValuesJson);

  if (row.status === "COMPLETE" && accountValues.length === 0 && row.accountIds) {
    const accountIds = scopeAccountIds;

    const [accounts, balances] = await Promise.all([
      prisma.account.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, accountId: true },
        orderBy: { id: "asc" },
      }),
      loadAccountBalanceContext(accountIds),
    ]);
    accountValues = accounts.map((account) => resolveLiveAccountValue({
      accountId: account.id,
      accountExternalId: account.accountId,
      positions,
      balance: balances.find((entry) => entry.accountExternalId === account.accountId) ?? null,
      marksAsOf: row.snapshotAt,
    }));
  }

  const resolvedCurrentNlv = accountValues.length > 0
    ? sumCompleteReconstructedNlv(accountValues)
    : row.currentNlv === null ? null : Number(row.currentNlv);
  return {
    id: row.id,
    snapshotAt: row.snapshotAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    scopeAccountIds,
    status: row.status,
    errorMessage: row.errorMessage ?? undefined,
    positions,
    accountValues,
    unrealizedPnl: toPositionSnapshotMoneyString(row.unrealizedPnl),
    realizedPnl: toPositionSnapshotMoneyString(row.realizedPnl),
    cashAdjustments: toPositionSnapshotMoneyString(row.cashAdjustments),
    manualAdjustments: toPositionSnapshotMoneyString(row.manualAdjustments),
    currentNlv: resolvedCurrentNlv === null ? null : resolvedCurrentNlv.toFixed(2),
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
        createdAt: true,
        status: true,
        errorMessage: true,
        accountIds: true,
        positionsJson: true,
        accountValuesJson: true,
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

    // Deliberately unscoped by date. A snapshot is a live "what is it worth right
    // now" reading, and the caller's range end is a *local* calendar date: bounding
    // on it in UTC hid every snapshot computed after 20:00 UTC-4 behind the last
    // one from earlier in the day, so Refresh appeared to do nothing.
    // Passive reads never surface PENDING/FAILED rows: an in-flight compute is
    // only observable by the flow that started it (fetch-by-id, unfiltered).
    snapshot = await prisma.positionSnapshot.findFirst({
      where: { accountIds: accountIdsJson, status: "COMPLETE" },
      orderBy: [{ snapshotAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        snapshotAt: true,
        createdAt: true,
        status: true,
        errorMessage: true,
        accountIds: true,
        positionsJson: true,
        accountValuesJson: true,
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
  const data = await mapSnapshotRow(snapshot);

  // Currency check: each scoped account's CURRENT revision, read live. The
  // client compares these against accountValues[].inputsRevision to answer
  // "has source data changed since this snapshot" (#339).
  const revisionRows = data.scopeAccountIds.length > 0
    ? await prisma.account.findMany({
        where: { id: { in: data.scopeAccountIds } },
        select: { id: true, dataRevision: true },
      })
    : [];
  const currentDataRevisions = Object.fromEntries(
    revisionRows.map((row) => [row.id, serializeDataRevision(row.dataRevision) ?? "0"]),
  );

  const payload: PositionSnapshotResponse = {
    data,
    meta: {
      snapshotExists: true,
      snapshotAge,
      currentDataRevisions,
    },
  };

  return NextResponse.json(payload);
}
