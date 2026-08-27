import { listResponse } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";

// Always query the live database at request time; never statically prerender
// this handler at build (no DB is available then).
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await prisma.legalEntity.findMany({
    select: { slug: true, legalName: true, kind: true },
    orderBy: { slug: "asc" },
  });

  return listResponse(rows, {
    total: rows.length,
    page: 1,
    pageSize: rows.length,
  });
}
