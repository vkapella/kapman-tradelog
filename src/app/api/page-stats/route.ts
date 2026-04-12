import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { buildAccountScopeWhere, parseAccountIds } from "@/lib/api/account-scope";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const accountIds = parseAccountIds(url.searchParams.get("accountIds"));
  const accountScope = buildAccountScopeWhere(accountIds);

  const [accountTotal, importTotal, snapshotTotal] = await Promise.all([
    accountIds.length === 0
      ? prisma.account.count()
      : prisma.account.count({
          where: {
            OR: [{ id: { in: accountIds } }, { accountId: { in: accountIds } }],
          },
        }),
    prisma.import.count({ where: accountScope as Prisma.ImportWhereInput | undefined }),
    prisma.dailyAccountSnapshot.count({ where: accountScope as Prisma.DailyAccountSnapshotWhereInput | undefined }),
  ]);

  return NextResponse.json({
    data: {
      accountTotal,
      importTotal,
      snapshotTotal,
    },
  });
}
