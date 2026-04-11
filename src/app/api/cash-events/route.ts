import type { Prisma } from "@prisma/client";
import type { CashEventResponse } from "@/types/api";
import { listResponse, parsePagination } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const accountId = url.searchParams.get("accountId") ?? undefined;

  const where: Prisma.CashEventWhereInput = {};
  if (accountId) {
    where.account = {
      accountId: { equals: accountId, mode: "insensitive" },
    };
  }

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

  return listResponse(data, { total, page, pageSize });
}
