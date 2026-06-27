import type { PrismaClient } from "@prisma/client";
import { buildEntryInfoByGroupKey } from "@/lib/export/build-portfolio-snapshot";
import type { ExecutionRecord, OpenPosition, PositionExcursion } from "@/types/api";
import { computeLotExcursion, type LotExcursionMark } from "./compute-lot-excursion";

type PricedLeg = OpenPosition & { mark: number | null };

export interface ExcursionLeg {
  instrumentKey: string;
  accountId: string;
  assetClass: OpenPosition["assetClass"];
  entryDate: Date | null;
  entryPrice: number | null;
  netQty: number;
  mark: number | null;
}

const EMPTY_EXCURSION: PositionExcursion = {
  maePct: null,
  mfePct: null,
  pricedDays: 0,
  unpricedDays: 0,
  excursionAsOf: null,
};

function legKey(accountId: string, instrumentKey: string): string {
  return accountId + "::" + instrumentKey;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function hasUsableEntry(leg: ExcursionLeg): boolean {
  return leg.entryDate !== null && leg.entryPrice !== null && leg.entryPrice > 0;
}

/**
 * Resolve entry date + weighted-average entry price per open leg, reusing the export's
 * opening-execution re-join (`buildEntryInfoByGroupKey`). Entry price is derived from the
 * aggregated cost basis, so for multi-fill positions it is a blended baseline.
 */
export function buildExcursionLegs(positions: PricedLeg[], executions: ExecutionRecord[]): ExcursionLeg[] {
  const entryInfo = buildEntryInfoByGroupKey(executions);
  return positions.map((position) => {
    const info = entryInfo.get(legKey(position.accountId, position.instrumentKey));
    const multiplier = position.assetClass === "OPTION" ? 100 : 1;
    const entryPrice = position.netQty !== 0 ? position.costBasis / (position.netQty * multiplier) : null;
    return {
      instrumentKey: position.instrumentKey,
      accountId: position.accountId,
      assetClass: position.assetClass,
      entryDate: info?.entryDate ? new Date(info.entryDate) : null,
      entryPrice,
      netQty: position.netQty,
      mark: position.mark,
    };
  });
}

/**
 * Pure per-leg excursion. Folds the live mark in as a same-day extreme so MAE/MFE never
 * contradict the displayed mark. Exposed for unit testing.
 */
export function excursionForLeg(
  leg: Pick<ExcursionLeg, "assetClass" | "entryDate" | "entryPrice" | "netQty" | "mark">,
  marksByDate: Map<string, LotExcursionMark>,
  asOf: Date,
  evaluationDateKeys?: string[],
): PositionExcursion {
  if (leg.entryDate === null || leg.entryPrice === null || leg.entryPrice <= 0) {
    return EMPTY_EXCURSION;
  }

  const marks = new Map(marksByDate);
  const asOfKey = dateKey(asOf);
  if (typeof leg.mark === "number") {
    marks.set(asOfKey, { high: leg.mark, low: leg.mark });
  }

  const result = computeLotExcursion({
    openTradeDate: leg.entryDate,
    closeTradeDate: asOf,
    entryPrice: leg.entryPrice,
    quantity: leg.netQty,
    direction: leg.netQty >= 0 ? "LONG" : "SHORT",
    assetClass: leg.assetClass,
    marksByDate: marks,
    evaluationDateKeys,
  });

  const sortedDates = Array.from(marks.keys()).sort();
  return {
    maePct: result.maePct,
    mfePct: result.mfePct,
    pricedDays: result.pricedDays,
    unpricedDays: result.unpricedDays,
    excursionAsOf: result.pricedDays > 0 && sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null,
  };
}

/**
 * Compute MAE/MFE for every open leg from HistoricalMark daily high/low over entry→asOf.
 * One batched query (no N+1), no DB migration. Returns a map keyed by `${accountId}::${instrumentKey}`.
 */
export async function computeOpenLegExcursions(
  prismaClient: PrismaClient,
  legs: ExcursionLeg[],
  asOf: Date,
): Promise<Map<string, PositionExcursion>> {
  const out = new Map<string, PositionExcursion>();
  const datedLegs = legs.filter(hasUsableEntry);

  if (datedLegs.length === 0) {
    for (const leg of legs) {
      out.set(legKey(leg.accountId, leg.instrumentKey), EMPTY_EXCURSION);
    }
    return out;
  }

  const instrumentKeys = Array.from(new Set(datedLegs.map((leg) => leg.instrumentKey)));
  const earliestEntry = datedLegs.reduce(
    (min, leg) => (leg.entryDate! < min ? leg.entryDate! : min),
    datedLegs[0].entryDate!,
  );

  const markRows = await prismaClient.historicalMark.findMany({
    where: { instrumentKey: { in: instrumentKeys }, markDate: { gte: earliestEntry, lte: asOf } },
    select: { instrumentKey: true, markDate: true, high: true, low: true },
    orderBy: [{ instrumentKey: "asc" }, { markDate: "asc" }],
  });

  const marksByInstrument = new Map<string, Map<string, LotExcursionMark>>();
  const tradingDayKeys = new Set<string>([dateKey(asOf)]);
  for (const row of markRows) {
    const key = dateKey(row.markDate);
    tradingDayKeys.add(key);
    const byDate = marksByInstrument.get(row.instrumentKey) ?? new Map<string, LotExcursionMark>();
    byDate.set(key, { high: Number(row.high), low: Number(row.low) });
    marksByInstrument.set(row.instrumentKey, byDate);
  }
  const evaluationDateKeys = Array.from(tradingDayKeys).sort();

  for (const leg of legs) {
    const marksByDate = marksByInstrument.get(leg.instrumentKey) ?? new Map<string, LotExcursionMark>();
    out.set(legKey(leg.accountId, leg.instrumentKey), excursionForLeg(leg, marksByDate, asOf, evaluationDateKeys));
  }

  return out;
}
