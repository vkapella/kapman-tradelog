import { listResponse } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import { buildLineageSummaries } from "@/lib/recommendations/lineage-summary";

export const dynamic = "force-dynamic";

/**
 * One summary per consuming run when the rows carry a run_id, else per
 * lineage (legacy single-run records). Two runs off one handoff render as two
 * groups, each with its legal entity and environment (#349).
 */
export async function GET() {
  const groups = await prisma.tradeRecommendation.groupBy({
    by: ["lineageId", "runId", "legalEntityId", "environment", "pass", "disposition"],
    _count: { _all: true },
    _max: { asOf: true },
  });

  const legalEntityIds = Array.from(
    new Set(groups.map((group) => group.legalEntityId).filter((id): id is string => id !== null)),
  );
  const legalEntities =
    legalEntityIds.length === 0
      ? []
      : await prisma.legalEntity.findMany({
          where: { id: { in: legalEntityIds } },
          select: { id: true, slug: true, legalName: true },
        });
  const legalEntityById = new Map(legalEntities.map((entity) => [entity.id, { slug: entity.slug, legalName: entity.legalName }]));

  const summaries = buildLineageSummaries(
    groups.map((group) => ({
      lineageId: group.lineageId,
      runId: group.runId,
      legalEntity: group.legalEntityId ? legalEntityById.get(group.legalEntityId) ?? null : null,
      environment: group.environment,
      pass: group.pass,
      disposition: group.disposition,
      rowCount: group._count._all,
      maxAsOf: group._max.asOf,
    })),
  );

  return listResponse(summaries, { page: 1, pageSize: summaries.length, total: summaries.length });
}
