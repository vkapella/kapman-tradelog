import { detailResponse } from "@/lib/api/responses";
import { compareDataRevisions, serializeDataRevision } from "@/lib/accounts/data-revision";
import { parseAccountIds } from "@/lib/api/account-scope";
import { prisma } from "@/lib/db/prisma";
import {
  resolvePositionSnapshotAccountIds,
  serializePositionSnapshotAccountIds,
  toPositionSnapshotMoneyString,
} from "@/lib/positions/position-snapshot";
import type { ReconciliationResponse } from "@/types/api";

function money(value: number): string {
  return value.toFixed(2);
}

/**
 * Latest COMPLETE run whose per-account child rows cover every requested
 * account. Reconciliation composes children of ONE run only -- summing
 * components captured at different observation times is not a reconciliation
 * (#339) -- but a subset of a wider run's children is fine: each account's
 * identity holds independently within the run.
 */
async function findCoveringRun(accountIds: string[]): Promise<{ runId: string; snapshotAt: Date } | null> {
  const grouped = await prisma.positionSnapshotAccount.groupBy({
    by: ["runId"],
    where: { accountId: { in: accountIds } },
    _count: { accountId: true },
  });
  const coveringRunIds = grouped.filter((row) => row._count.accountId === accountIds.length).map((row) => row.runId);
  if (coveringRunIds.length === 0) {
    return null;
  }
  const run = await prisma.positionSnapshot.findFirst({
    where: { id: { in: coveringRunIds }, status: "COMPLETE" },
    orderBy: [{ snapshotAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { id: true, snapshotAt: true },
  });
  return run ? { runId: run.id, snapshotAt: run.snapshotAt } : null;
}

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

  const coveringRun = resolvedAccountIds.length > 0 ? await findCoveringRun(resolvedAccountIds) : null;

  if (coveringRun) {
    const [children, revisionRows] = await Promise.all([
      prisma.positionSnapshotAccount.findMany({
        where: { runId: coveringRun.runId, accountId: { in: resolvedAccountIds } },
      }),
      prisma.account.findMany({
        where: { id: { in: resolvedAccountIds } },
        select: { id: true, dataRevision: true, startingCapital: true },
      }),
    ]);
    // "Configured" means the operator set a value, including 0 for an account
    // that opened empty and was wire-funded (#327/#348); a live account's
    // starting capital is never defaulted, so null is the unset state.
    const startingCapitalConfigured = revisionRows.every((row) => row.startingCapital !== null);

    const sum = (select: (child: (typeof children)[number]) => { toString(): string } | null) => {
      let total = 0;
      for (const child of children) {
        const value = select(child);
        if (value !== null) {
          total += Number(value);
        }
      }
      return total;
    };
    const anyNull = (select: (child: (typeof children)[number]) => unknown) => children.some((child) => select(child) === null);
    const currentRevisionByAccount = new Map(revisionRows.map((row) => [row.id, serializeDataRevision(row.dataRevision)]));
    const staleAccountIds = children
      .filter((child) => {
        const comparison = compareDataRevisions(
          serializeDataRevision(child.inputsRevision),
          currentRevisionByAccount.get(child.accountId) ?? null,
        );
        return comparison !== null && comparison < 0;
      })
      .map((child) => child.accountId);

    const startingCapital = sum((child) => child.startingCapital);
    const payload: ReconciliationResponse = {
      startingCapital: money(startingCapital),
      startingCapitalConfigured,
      currentNlv: anyNull((child) => child.reconstructedNlv) ? "0.00" : money(sum((child) => child.reconstructedNlv)),
      totalGain: anyNull((child) => child.totalGain) ? "0.00" : money(sum((child) => child.totalGain)),
      unrealizedPnl: anyNull((child) => child.unrealizedPnl) ? "0.00" : money(sum((child) => child.unrealizedPnl)),
      cashAdjustments: money(sum((child) => child.cashAdjustments)),
      realizedPnl: money(sum((child) => child.realizedPnl)),
      manualAdjustments: money(sum((child) => child.manualAdjustments)),
      unexplainedDelta: anyNull((child) => child.unexplainedDelta) ? "0.00" : money(sum((child) => child.unexplainedDelta)),
      runId: coveringRun.runId,
      snapshotAt: coveringRun.snapshotAt.toISOString(),
      staleAccountIds,
      source: "run_accounts",
    };
    return detailResponse(payload);
  }

  // Legacy fallback: pre-#339 rows have no child records, so the only coherent
  // read is the old exact-scope scalar match.
  const snapshot = await prisma.positionSnapshot.findFirst({
    where: { accountIds: accountIdsJson, status: "COMPLETE" },
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
    return detailResponse({ ...emptyResponse(), source: "empty" });
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
    source: "legacy_exact_scope",
  };

  return detailResponse(payload);
}
