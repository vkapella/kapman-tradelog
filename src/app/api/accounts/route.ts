import { listResponse } from "@/lib/api/responses";
import { mapAccountRowToRecord } from "@/lib/accounts/api";
import { warnDeprecatedStartingCapitalEnvVar } from "@/lib/accounts/env";
import { ensureAccountDefaults } from "@/lib/accounts/ensure-defaults";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  warnDeprecatedStartingCapitalEnvVar();
  await ensureAccountDefaults();

  const rows = await prisma.account.findMany({
    select: {
      id: true,
      accountId: true,
      displayLabel: true,
      brokerName: true,
      startingCapital: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { accountId: "asc" }],
  });

  return listResponse(rows.map(mapAccountRowToRecord), {
    total: rows.length,
    page: 1,
    pageSize: rows.length,
  });
}
