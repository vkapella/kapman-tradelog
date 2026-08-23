import { listResponse } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import { buildLineageSummaries } from "@/lib/recommendations/lineage-summary";

export const dynamic = "force-dynamic";

export async function GET() {
  const groups = await prisma.tradeRecommendation.groupBy({
    by: ["lineageId", "pass", "disposition"],
    _count: { _all: true },
    _max: { asOf: true },
  });

  const summaries = buildLineageSummaries(
    groups.map((group) => ({
      lineageId: group.lineageId,
      pass: group.pass,
      disposition: group.disposition,
      rowCount: group._count._all,
      maxAsOf: group._max.asOf,
    })),
  );

  return listResponse(summaries, { page: 1, pageSize: summaries.length, total: summaries.length });
}
