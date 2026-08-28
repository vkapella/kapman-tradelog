import type { Prisma, PrismaClient } from "@prisma/client";

type DbClient = Prisma.TransactionClient | PrismaClient;

/**
 * Bump the per-account source-data revision. MUST be called inside the same
 * transaction as the mutation it records — a bump that can commit separately
 * from its mutation proves nothing. Every write path that changes
 * snapshot-relevant data (executions, cash events, matched lots, manual
 * adjustments, daily snapshots, starting capital) goes through this; market
 * mark ingestion deliberately does not (marks carry their own as-of
 * provenance, see #339).
 *
 * Double-bumping in one transaction (e.g. a route bump plus a nested ledger
 * rebuild) is harmless: only the ordering of revisions matters, not the count.
 */
export async function bumpAccountDataRevision(db: DbClient, accountIds: string[]): Promise<void> {
  const ids = Array.from(new Set(accountIds.filter((id) => id.trim().length > 0)));
  if (ids.length === 0) {
    return;
  }
  await db.account.updateMany({
    where: { id: { in: ids } },
    data: { dataRevision: { increment: 1 } },
  });
}

/** Serialize a revision for the API boundary — BigInt does not survive JSON. */
export function serializeDataRevision(value: bigint | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toString();
}

/**
 * Compare two serialized revisions. Returns null when either side is missing —
 * callers must fall back to canonical enqueue precedence, not assume equality.
 */
export function compareDataRevisions(left: string | null | undefined, right: string | null | undefined): number | null {
  if (left === null || left === undefined || right === null || right === undefined) {
    return null;
  }
  try {
    const l = BigInt(left);
    const r = BigInt(right);
    return l < r ? -1 : l > r ? 1 : 0;
  } catch {
    return null;
  }
}
