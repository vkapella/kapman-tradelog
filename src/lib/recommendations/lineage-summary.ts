import { RECOMMENDATION_DISPOSITIONS, RECOMMENDATION_PASSES } from "@/lib/recommendations/types";

/**
 * Per-(run, lineage, pass, disposition) aggregate as produced by a Prisma
 * groupBy over trade_recommendations, with the legal entity already joined.
 * Kept structural so the pure summary builder is testable without a database.
 */
export interface LineageGroupRow {
  lineageId: string;
  /** Consuming run (`<lineage>-RNN`); null for legacy single-run records. */
  runId?: string | null;
  legalEntity?: { slug: string; legalName: string } | null;
  environment?: "LIVE" | "PAPER" | null;
  pass: string;
  disposition: string;
  rowCount: number;
  maxAsOf: Date | string | null;
}

export interface RecommendationLineageSummary {
  /** Selection key: the run when the rows carry one, else the lineage (#349). */
  groupKey: string;
  lineageId: string;
  runId: string | null;
  legalEntity: { slug: string; legalName: string } | null;
  environment: "LIVE" | "PAPER" | null;
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
  const byKey = new Map<string, RecommendationLineageSummary>();

  for (const group of groups) {
    const runId = group.runId ?? null;
    const groupKey = runId ?? group.lineageId;
    const existing = byKey.get(groupKey);
    const summary: RecommendationLineageSummary = existing ?? {
      groupKey,
      lineageId: group.lineageId,
      runId,
      legalEntity: group.legalEntity ?? null,
      environment: group.environment ?? null,
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

    byKey.set(groupKey, summary);
  }

  return Array.from(byKey.values()).sort((left, right) => {
    if (left.asOf !== right.asOf) {
      if (left.asOf === null) {
        return 1;
      }
      if (right.asOf === null) {
        return -1;
      }
      return left.asOf < right.asOf ? 1 : -1;
    }

    // Group keys embed a run timestamp (VS-YYYYMMDD-HHMM-NN[-RNN]), so a reverse
    // lexicographic tiebreak keeps same-day runs newest-first.
    return left.groupKey < right.groupKey ? 1 : left.groupKey > right.groupKey ? -1 : 0;
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
