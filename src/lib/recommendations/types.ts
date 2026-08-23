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

export const recommendationIngestSchema = z.object({
  recId: z.string().min(1),
  lineageId: z.string().min(1),
  localRecId: z.string().min(1),
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
