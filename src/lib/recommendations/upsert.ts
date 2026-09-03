import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { RecommendationIngest } from "@/lib/recommendations/types";

export interface UpsertRecommendationsResult {
  received: number;
  created: number;
  updated: number;
}

/**
 * Ingest refusals with a named reason (#349). The route maps these to the
 * standard error envelope; the script prints them.
 */
export class RecommendationIngestError extends Error {
  constructor(
    public readonly code: "UNKNOWN_LEGAL_ENTITY" | "REC_ID_RUN_MISMATCH",
    message: string,
    public readonly details: string[],
    public readonly status: number,
  ) {
    super(message);
    this.name = "RecommendationIngestError";
  }
}

function toDecimal(value: number | null | undefined): Prisma.Decimal | null {
  return value === null || value === undefined ? null : new Prisma.Decimal(value);
}

function toDateOnly(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function buildData(row: RecommendationIngest) {
  return {
    lineageId: row.lineageId,
    localRecId: row.localRecId,
    pass: row.pass,
    disposition: row.disposition,
    asOf: toDateOnly(row.asOf) as Date,
    decidedAtRaw: row.decidedAtRaw ?? null,
    decidedAt: row.decidedAt ? new Date(row.decidedAt) : null,
    ticker: row.ticker.toUpperCase(),
    structure: row.structure ?? null,
    structureRaw: row.structureRaw ?? null,
    direction: row.direction ?? null,
    reason: row.reason ?? null,
    optionType: row.optionType ?? null,
    strike: toDecimal(row.strike),
    strikeShort: toDecimal(row.strikeShort),
    expirationDate: toDateOnly(row.expirationDate),
    entryRangeLow: toDecimal(row.entryRangeLow),
    entryRangeHigh: toDecimal(row.entryRangeHigh),
    entryRangeRaw: row.entryRangeRaw ?? null,
    sizingBand: row.sizingBand ?? null,
    chainQuality: row.chainQuality ?? null,
    optionMid: toDecimal(row.optionMid),
    underlyingRef: toDecimal(row.underlyingRef),
    journalSchemaVersion: row.journalSchemaVersion ?? null,
    sourceFile: row.sourceFile ?? null,
    raw: row.raw === undefined || row.raw === null ? Prisma.JsonNull : (row.raw as Prisma.InputJsonValue),
  };
}

/**
 * Scope columns for a scoped row. Unscoped rows contribute nothing, so a
 * re-POST without scope never strips a scope that was stamped earlier.
 */
function buildScopeData(row: RecommendationIngest, legalEntityIdBySlug: Map<string, string>) {
  if (row.runId == null) {
    return {};
  }
  return {
    runId: row.runId,
    legalEntityId: legalEntityIdBySlug.get(row.legalEntitySlug as string) ?? null,
    environment: row.environment ?? null,
  };
}

async function resolveLegalEntities(rows: RecommendationIngest[]): Promise<Map<string, string>> {
  const slugs = Array.from(new Set(rows.map((row) => row.legalEntitySlug).filter((slug): slug is string => slug != null)));
  if (slugs.length === 0) {
    return new Map();
  }
  const entities = await prisma.legalEntity.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
  const bySlug = new Map(entities.map((entity) => [entity.slug, entity.id]));
  const unknown = slugs.filter((slug) => !bySlug.has(slug));
  if (unknown.length > 0) {
    throw new RecommendationIngestError(
      "UNKNOWN_LEGAL_ENTITY",
      "legalEntitySlug does not resolve to a legal entity",
      unknown.map((slug) => `unknown legal entity slug: ${slug}`),
      400,
    );
  }
  return bySlug;
}

/**
 * Idempotent by construction: keyed on recId, an upsert per row inside one
 * transaction. Re-running the same payload never double-logs (KB_4.0_DESIGN §7).
 *
 * Scope rules (#349): a recId already stamped with a run is refused under a
 * different run (REC_ID_RUN_MISMATCH) rather than overwritten; a legacy
 * unscoped row may be stamped once by a scoped re-POST (counted as updated);
 * an unscoped re-POST of a scoped row leaves the scope in place.
 */
export async function upsertRecommendations(rows: RecommendationIngest[]): Promise<UpsertRecommendationsResult> {
  const legalEntityIdBySlug = await resolveLegalEntities(rows);

  const recIds = rows.map((row) => row.recId);
  const existing = await prisma.tradeRecommendation.findMany({
    where: { recId: { in: recIds } },
    select: { recId: true, runId: true },
  });
  const existingRunByRecId = new Map(existing.map((row) => [row.recId, row.runId]));

  const mismatches = rows.filter((row) => {
    const existingRun = existingRunByRecId.get(row.recId);
    return existingRun != null && row.runId != null && row.runId !== existingRun;
  });
  if (mismatches.length > 0) {
    throw new RecommendationIngestError(
      "REC_ID_RUN_MISMATCH",
      "recId already exists under a different runId; a run never overwrites another run's record",
      mismatches.map((row) => `${row.recId}: stored run ${existingRunByRecId.get(row.recId)}, payload run ${row.runId}`),
      409,
    );
  }

  await prisma.$transaction(
    rows.map((row) =>
      prisma.tradeRecommendation.upsert({
        where: { recId: row.recId },
        create: { recId: row.recId, ...buildData(row), ...buildScopeData(row, legalEntityIdBySlug) },
        update: { ...buildData(row), ...buildScopeData(row, legalEntityIdBySlug) },
      }),
    ),
  );

  const created = rows.filter((row) => !existingRunByRecId.has(row.recId)).length;
  return { received: rows.length, created, updated: rows.length - created };
}
