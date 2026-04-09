import type { ImportRecord } from "@/types/api";
import { listResponse, parsePagination } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";

function mapBrokerToContract(broker: string): ImportRecord["broker"] {
  return broker === "FIDELITY" ? "fidelity" : "schwab_thinkorswim";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const accountFilter = url.searchParams.get("account");

  const where = accountFilter ? { account: { accountId: accountFilter } } : {};

  const [total, rows] = await Promise.all([
    prisma.import.count({ where }),
    prisma.import.findMany({
      where,
      include: { account: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const data: ImportRecord[] = rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    broker: mapBrokerToContract(row.broker),
    accountId: row.account.accountId,
    status: row.status,
    parsedRows: row.parsedRows,
    inserted: row.persistedRows,
    skipped_duplicate: row.skippedDuplicateRows,
    failed: row.failedRows,
    skipped_parse: row.skippedRows,
    createdAt: row.createdAt.toISOString(),
  }));

  return listResponse(data, { total, page, pageSize });
}
