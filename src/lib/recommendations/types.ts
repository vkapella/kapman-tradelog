import { z } from "zod";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const RECOMMENDATION_PASSES = ["PASS1", "PASS2"] as const;
export const RECOMMENDATION_DISPOSITIONS = [
  "ELIGIBLE",
  "NO_TRADE",
  "WAIT",
  "VALIDATED",
  "FLAGGED",
  "REJECTED",
] as const;
export const TRADING_ENVIRONMENTS = ["LIVE", "PAPER"] as const;
export type TradingEnvironmentValue = (typeof TRADING_ENVIRONMENTS)[number];

/**
 * kb JOURNAL_MGMT writes `environment: live | paper`; the tradelog export scope
 * block and this table use uppercase. Accept either, store uppercase (#349).
 */
const environmentSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
  z.enum(TRADING_ENVIRONMENTS),
);

export const recommendationIngestSchema = z.object({
  recId: z.string().min(1),
  lineageId: z.string().min(1),
  localRecId: z.string().min(1),
  /// Consuming-run identity `<lineage_id>-RNN`; absent on legacy single-run records.
  runId: z.string().min(1).nullish(),
  /// Slug of the legal entity the run traded for (must resolve: UNKNOWN_LEGAL_ENTITY).
  legalEntitySlug: z.string().min(1).nullish(),
  environment: environmentSchema.nullish(),
  pass: z.enum(RECOMMENDATION_PASSES),
  disposition: z.enum(RECOMMENDATION_DISPOSITIONS),
  asOf: z.string().regex(isoDate, "asOf must be YYYY-MM-DD"),
  decidedAtRaw: z.string().nullish(),
  decidedAt: z.string().datetime({ offset: true }).nullish(),
  ticker: z.string().min(1),
  structure: z.string().nullish(),
  structureRaw: z.string().nullish(),
  direction: z.string().nullish(),
  reason: z.string().nullish(),
  optionType: z.enum(["CALL", "PUT"]).nullish(),
  strike: z.number().finite().nullish(),
  strikeShort: z.number().finite().nullish(),
  expirationDate: z.string().regex(isoDate, "expirationDate must be YYYY-MM-DD").nullish(),
  entryRangeLow: z.number().finite().nullish(),
  entryRangeHigh: z.number().finite().nullish(),
  entryRangeRaw: z.string().nullish(),
  sizingBand: z.string().nullish(),
  chainQuality: z.string().nullish(),
  optionMid: z.number().finite().nullish(),
  underlyingRef: z.number().finite().nullish(),
  journalSchemaVersion: z.string().nullish(),
  sourceFile: z.string().nullish(),
  raw: z.unknown().nullish(),
});

export const recommendationIngestArraySchema = z.array(recommendationIngestSchema).min(1);

export type RecommendationIngest = z.infer<typeof recommendationIngestSchema>;

/** A row is scoped when it carries a run; unscoped rows are LEGACY_UNSCOPED. */
export function hasScope(row: Pick<RecommendationIngest, "runId" | "legalEntitySlug" | "environment">): boolean {
  return row.runId != null;
}

/**
 * Scope is all-or-nothing: a run without its entity and environment would be a
 * row nobody can attribute. Returns the recIds that supply some but not all of
 * `runId`, `legalEntitySlug`, `environment` (SCOPE_INCOMPLETE).
 */
export function scopeIncompleteRecIds(
  rows: Array<Pick<RecommendationIngest, "recId" | "runId" | "legalEntitySlug" | "environment">>,
): string[] {
  return rows
    .filter((row) => {
      const present = [row.runId, row.legalEntitySlug, row.environment].filter((value) => value != null).length;
      return present > 0 && present < 3;
    })
    .map((row) => row.recId);
}
