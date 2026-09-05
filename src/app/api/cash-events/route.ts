import type { Prisma } from "@prisma/client";
import type { CashEventResponse } from "@/types/api";
import { buildAccountScopeWhere, parseAccountIds, parseDateRangeParams, toEndOfDayUtcIso } from "@/lib/api/account-scope";
import { listResponse, parsePagination } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";

/**
 * Cash-event ledger rows. Accepts the same `accountIds` (internal or external
 * ids) and `startDate`/`endDate` filters as every other analytics endpoint and
 * echoes the applied scope in `meta.scope`; the legacy singular external
 * `accountId` is still honoured (#368). Previously `accountIds` and dates were
 * silently ignored, so callers received cross-account rows while believing the
 * response was scoped (kapman-assessments KAP-F-017).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const legacyAccountId = url.searchParams.get("accountId")?.trim();
  const accountIds = parseAccountIds(url.searchParams.get("accountIds"));
  const { startDate, endDate } = parseDateRangeParams(url.searchParams);
  const scopedAccountIds = legacyAccountId ? Array.from(new Set([...accountIds, legacyAccountId])) : accountIds;

  const conditions: Prisma.CashEventWhereInput[] = [];
  if (scopedAccountIds.length > 0) {
    conditions.push(buildAccountScopeWhere(scopedAccountIds) as Prisma.CashEventWhereInput);
  }
  if (startDate || endDate) {
    conditions.push({
      eventDate: {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate ? { lte: toEndOfDayUtcIso(endDate) } : {}),
      },
    });
  }
  const where: Prisma.CashEventWhereInput = conditions.length > 0 ? { AND: conditions } : {};

  const [total, rows] = await Promise.all([
    prisma.cashEvent.count({ where }),
    prisma.cashEvent.findMany({
      where,
      orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const data: CashEventResponse[] = rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    eventDate: row.eventDate.toISOString(),
    rowType: row.rowType,
    refNumber: row.refNumber,
    description: row.description,
    amount: row.amount.toString(),
    createdAt: row.createdAt.toISOString(),
  }));

  return listResponse(data, { total, page, pageSize, scope: { accountIds: scopedAccountIds, startDate, endDate } });
}
