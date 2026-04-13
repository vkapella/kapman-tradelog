import type { Prisma } from "@prisma/client";
import { buildAccountIdWhere } from "@/lib/api/account-scope";
import { prisma } from "@/lib/db/prisma";
import type { PositionSnapshotOpenPosition } from "@/types/api";

export function normalizePositionSnapshotAccountIds(accountIds: string[]): string[] {
  return Array.from(new Set(accountIds.map((value) => value.trim()).filter((value) => value.length > 0))).sort((left, right) =>
    left.localeCompare(right),
  );
}

export function serializePositionSnapshotAccountIds(accountIds: string[]): string {
  return JSON.stringify(normalizePositionSnapshotAccountIds(accountIds));
}

export async function resolvePositionSnapshotAccountIds(requestedAccountIds: string[]): Promise<string[]> {
  const normalizedAccountIds = normalizePositionSnapshotAccountIds(requestedAccountIds);
  const where = buildAccountIdWhere(normalizedAccountIds) as Prisma.AccountWhereInput | undefined;
  const rows = await prisma.account.findMany({
    where,
    select: { id: true },
    orderBy: { id: "asc" },
  });

  return Array.from(new Set(rows.map((row) => row.id)));
}

export function parsePositionSnapshotPositionsJson(raw: string): PositionSnapshotOpenPosition[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PositionSnapshotOpenPosition[]) : [];
  } catch {
    return [];
  }
}

export function toPositionSnapshotMoneyString(value: { toString(): string } | null | undefined): string {
  return Number(value ?? 0).toFixed(2);
}
