import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { RecommendationIngest } from "@/lib/recommendations/types";

export interface UpsertRecommendationsResult {
  received: number;
  created: number;
  updated: number;
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
 * Idempotent by construction: keyed on recId, an upsert per row inside one
 * transaction. Re-running the same payload never double-logs (KB_4.0_DESIGN §7).
 */
export async function upsertRecommendations(rows: RecommendationIngest[]): Promise<UpsertRecommendationsResult> {
  const recIds = rows.map((row) => row.recId);
  const existing = await prisma.tradeRecommendation.findMany({
    where: { recId: { in: recIds } },
    select: { recId: true },
  });
  const existingIds = new Set(existing.map((row) => row.recId));

  await prisma.$transaction(
    rows.map((row) =>
      prisma.tradeRecommendation.upsert({
        where: { recId: row.recId },
        create: { recId: row.recId, ...buildData(row) },
        update: buildData(row),
      }),
    ),
  );

  const created = rows.filter((row) => !existingIds.has(row.recId)).length;
  return { received: rows.length, created, updated: rows.length - created };
}
