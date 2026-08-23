import { RECOMMENDATION_DISPOSITIONS, RECOMMENDATION_PASSES } from "@/lib/recommendations/types";

/**
 * Per-(lineageId, pass, disposition) aggregate as produced by a Prisma
 * groupBy over trade_recommendations. Kept structural so the pure summary
 * builder is testable without a database.
 */
export interface LineageGroupRow {
  lineageId: string;
  pass: string;
  disposition: string;
  rowCount: number;
  maxAsOf: Date | string | null;
}

export interface RecommendationLineageSummary {
  lineageId: string;
  asOf: string | null;
  rowCount: number;
  passes: Record<string, number>;
  dispositions: Record<string, number>;
}

function toIsoDate(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function buildLineageSummaries(groups: LineageGroupRow[]): RecommendationLineageSummary[] {
  const byLineage = new Map<string, RecommendationLineageSummary>();

  for (const group of groups) {
    const existing = byLineage.get(group.lineageId);
    const summary: RecommendationLineageSummary = existing ?? {
      lineageId: group.lineageId,
      asOf: null,
      rowCount: 0,
      passes: {},
      dispositions: {},
    };

    summary.rowCount += group.rowCount;
    summary.passes[group.pass] = (summary.passes[group.pass] ?? 0) + group.rowCount;
    summary.dispositions[group.disposition] = (summary.dispositions[group.disposition] ?? 0) + group.rowCount;

    const groupAsOf = toIsoDate(group.maxAsOf);
    if (groupAsOf && (summary.asOf === null || groupAsOf > summary.asOf)) {
      summary.asOf = groupAsOf;
    }

    byLineage.set(group.lineageId, summary);
  }

  return Array.from(byLineage.values()).sort((left, right) => {
    if (left.asOf !== right.asOf) {
      if (left.asOf === null) {
        return 1;
      }
      if (right.asOf === null) {
        return -1;
      }
      return left.asOf < right.asOf ? 1 : -1;
    }

    // Lineage IDs embed a run timestamp (VS-YYYYMMDD-HHMM-NN), so a reverse
    // lexicographic tiebreak keeps same-day runs newest-first.
    return left.lineageId < right.lineageId ? 1 : left.lineageId > right.lineageId ? -1 : 0;
  });
}

/**
 * "11 ELIGIBLE · 60 WAIT" — dispositions in canonical order, zero counts
 * omitted. Unknown dispositions trail in alphabetical order rather than
 * disappearing.
 */
export function formatDispositionBreakdown(dispositions: Record<string, number>): string {
  const known = RECOMMENDATION_DISPOSITIONS.filter((disposition) => (dispositions[disposition] ?? 0) > 0);
  const unknown = Object.keys(dispositions)
    .filter((key) => !(RECOMMENDATION_DISPOSITIONS as readonly string[]).includes(key) && dispositions[key] > 0)
    .sort();

  const parts = [...known, ...unknown].map((disposition) => `${dispositions[disposition]} ${disposition}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/** Newest run that contains at least one PASS1 row, or null when none exist. */
export function latestPass1Summary(summaries: RecommendationLineageSummary[]): RecommendationLineageSummary | null {
  return summaries.find((summary) => (summary.passes[RECOMMENDATION_PASSES[0]] ?? 0) > 0) ?? null;
}
