import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { buildAccountIdWhere } from "@/lib/api/account-scope";
import type { AccountStartingCapitalSummary } from "@/types/api";

export async function getStartingCapitalSummary(accountIds: string[]): Promise<AccountStartingCapitalSummary> {
  const where = buildAccountIdWhere(accountIds) as Prisma.AccountWhereInput | undefined;
  const rows = await prisma.account.findMany({
    where,
    select: {
      accountId: true,
      startingCapital: true,
    },
  });

  const byAccount: Record<string, number> = {};
  let total = 0;

  for (const row of rows) {
    const value = Number(row.startingCapital ?? 0);
    byAccount[row.accountId] = value;
    total += value;
  }

  return { total, byAccount };
}
