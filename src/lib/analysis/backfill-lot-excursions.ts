import { Prisma, type PrismaClient } from "@prisma/client";
import { buildAccountIdWhere } from "@/lib/api/account-scope";
import { prisma } from "@/lib/db/prisma";
import { deriveInstrumentKeyFromPersistedExecution } from "@/lib/ledger/instrument-key";
import { computeLotExcursion, type LotExcursionDirection, type LotExcursionMark } from "./compute-lot-excursion";

interface LoggerLike {
  log(message: string): void;
  warn(message: string): void;
}

export interface BackfillLotExcursionsInput {
  accountIds?: string[];
  startDate?: Date;
  endDate?: Date;
  includeOpen?: boolean;
  now?: Date;
  prismaClient?: PrismaClient;
  logger?: LoggerLike;
}

export interface BackfillLotExcursionsSummary {
  lotCount: number;
  excursionsUpserted: number;
  pricedDays: number;
  unpricedDays: number;
  noMarkLotCount: number;
}

type MatchedLotRow = Prisma.MatchedLotGetPayload<{
  include: {
    openExecution: true;
    closeExecution: true;
  };
}>;

type HistoricalMarkRow = {
  instrumentKey: string;
  markDate: Date;
  high: Prisma.Decimal;
  low: Prisma.Decimal;
};

type MarksByInstrument = Map<string, Map<string, LotExcursionMark>>;

const UPSERT_BATCH_SIZE = 50;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toEndOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function directionForLot(row: MatchedLotRow): LotExcursionDirection | null {
  if (row.openExecution.side === "BUY") {
    return "LONG";
  }

  if (row.openExecution.side === "SELL") {
    return "SHORT";
  }

  return null;
}

function closeDateForLot(row: MatchedLotRow, includeOpen: boolean, now: Date): Date | null {
  if (row.closeExecution) {
    return row.closeExecution.tradeDate;
  }

  return includeOpen ? now : null;
}

function instrumentKeyForLot(row: MatchedLotRow): string {
  return deriveInstrumentKeyFromPersistedExecution(row.openExecution);
}

function buildMarksByInstrument(rows: HistoricalMarkRow[]): MarksByInstrument {
  const result: MarksByInstrument = new Map();

  for (const row of rows) {
    const byDate = result.get(row.instrumentKey) ?? new Map<string, LotExcursionMark>();
    byDate.set(dateKey(row.markDate), {
      high: Number(row.high),
      low: Number(row.low),
    });
    result.set(row.instrumentKey, byDate);
  }

  return result;
}

function decimalString(value: number): string {
  return value.toFixed(6);
}

function dateFromKey(value: string | null): Date | null {
  return value === null ? null : new Date(`${value}T00:00:00.000Z`);
}

async function flushUpserts(prismaClient: PrismaClient, operations: Array<Prisma.PrismaPromise<unknown>>): Promise<void> {
  for (let index = 0; index < operations.length; index += UPSERT_BATCH_SIZE) {
    await Promise.all(operations.slice(index, index + UPSERT_BATCH_SIZE));
  }
  operations.length = 0;
}

export async function backfillLotExcursions(input: BackfillLotExcursionsInput = {}): Promise<BackfillLotExcursionsSummary> {
  const prismaClient = input.prismaClient ?? prisma;
  const logger = input.logger ?? console;
  const includeOpen = input.includeOpen ?? false;
  const now = startOfUtcDay(input.now ?? new Date());
  const accountWhere = buildAccountIdWhere(input.accountIds ?? []) as Prisma.AccountWhereInput | undefined;
  const accounts = await prismaClient.account.findMany({
    where: accountWhere,
    select: { id: true },
    orderBy: { accountId: "asc" },
  });
  const scopedAccountIds = accounts.map((account) => account.id);

  if (scopedAccountIds.length === 0) {
    logger.log("[backfill:lot-excursions] no accounts found; nothing to backfill.");
    return {
      lotCount: 0,
      excursionsUpserted: 0,
      pricedDays: 0,
      unpricedDays: 0,
      noMarkLotCount: 0,
    };
  }

  const andClauses: Prisma.MatchedLotWhereInput[] = [
    { accountId: { in: scopedAccountIds } },
  ];

  if (!includeOpen) {
    andClauses.push({ closeExecutionId: { not: null } });
  }

  if (input.startDate || input.endDate) {
    andClauses.push({
      openExecution: {
        tradeDate: {
          ...(input.startDate ? { gte: startOfUtcDay(input.startDate) } : {}),
          ...(input.endDate ? { lte: toEndOfUtcDay(input.endDate) } : {}),
        },
      },
    });
  }

  const lots = await prismaClient.matchedLot.findMany({
    where: { AND: andClauses },
    include: {
      openExecution: true,
      closeExecution: true,
    },
    orderBy: [{ accountId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });

  if (lots.length === 0) {
    logger.log("[backfill:lot-excursions] no matched lots found; nothing to backfill.");
    return {
      lotCount: 0,
      excursionsUpserted: 0,
      pricedDays: 0,
      unpricedDays: 0,
      noMarkLotCount: 0,
    };
  }

  const lotWindows = lots
    .map((lot) => ({
      lot,
      closeTradeDate: closeDateForLot(lot, includeOpen, now),
      direction: directionForLot(lot),
      instrumentKey: instrumentKeyForLot(lot),
    }))
    .filter((entry): entry is {
      lot: MatchedLotRow;
      closeTradeDate: Date;
      direction: LotExcursionDirection;
      instrumentKey: string;
    } => entry.closeTradeDate !== null && entry.direction !== null);

  const startDate = lotWindows.reduce<Date | null>((earliest, entry) => {
    const date = startOfUtcDay(entry.lot.openExecution.tradeDate);
    return earliest === null || date.getTime() < earliest.getTime() ? date : earliest;
  }, null);
  const endDate = lotWindows.reduce<Date | null>((latest, entry) => {
    const date = startOfUtcDay(entry.closeTradeDate);
    return latest === null || date.getTime() > latest.getTime() ? date : latest;
  }, null);

  if (startDate === null || endDate === null) {
    logger.warn("[backfill:lot-excursions] no lots had a computable direction/window.");
    return {
      lotCount: lots.length,
      excursionsUpserted: 0,
      pricedDays: 0,
      unpricedDays: 0,
      noMarkLotCount: lots.length,
    };
  }

  const instrumentKeys = Array.from(new Set(lotWindows.map((entry) => entry.instrumentKey)));
  const [markRows, tradingDayRows] = await Promise.all([
    instrumentKeys.length === 0
      ? Promise.resolve([])
      : prismaClient.historicalMark.findMany({
          where: {
            instrumentKey: { in: instrumentKeys },
            markDate: {
              gte: startDate,
              lte: endDate,
            },
          },
          select: {
            instrumentKey: true,
            markDate: true,
            high: true,
            low: true,
          },
          orderBy: [{ instrumentKey: "asc" }, { markDate: "asc" }],
        }),
    prismaClient.historicalMark.findMany({
      where: {
        markDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: { markDate: true },
      distinct: ["markDate"],
      orderBy: { markDate: "asc" },
    }),
  ]);

  const marksByInstrument = buildMarksByInstrument(markRows);
  const evaluationDateKeys = tradingDayRows.map((row) => dateKey(row.markDate));
  const upserts: Array<Prisma.PrismaPromise<unknown>> = [];
  let excursionsUpserted = 0;
  let pricedDays = 0;
  let unpricedDays = 0;
  let noMarkLotCount = 0;

  for (const entry of lotWindows) {
    const entryPrice = entry.lot.openExecution.price === null ? null : Number(entry.lot.openExecution.price);
    const marksByDate = entryPrice === null
      ? new Map<string, LotExcursionMark>()
      : marksByInstrument.get(entry.instrumentKey) ?? new Map<string, LotExcursionMark>();
    const result = computeLotExcursion({
      openTradeDate: entry.lot.openExecution.tradeDate,
      closeTradeDate: entry.closeTradeDate,
      entryPrice: entryPrice ?? 0,
      quantity: Number(entry.lot.quantity),
      direction: entry.direction,
      assetClass: entry.lot.openExecution.assetClass,
      multiplier: entry.lot.openExecution.multiplier ?? undefined,
      marksByDate,
      evaluationDateKeys: evaluationDateKeys.length > 0 ? evaluationDateKeys : undefined,
    });

    pricedDays += result.pricedDays;
    unpricedDays += result.unpricedDays;
    if (result.pricedDays === 0) {
      noMarkLotCount += 1;
    }

    upserts.push(
      prismaClient.lotExcursion.upsert({
        where: { matchedLotId: entry.lot.id },
        update: {
          mfe: decimalString(result.mfe),
          mae: decimalString(result.mae),
          mfePct: result.mfePct === null ? null : decimalString(result.mfePct),
          maePct: result.maePct === null ? null : decimalString(result.maePct),
          mfeDate: dateFromKey(result.mfeDate),
          maeDate: dateFromKey(result.maeDate),
          pricedDays: result.pricedDays,
          unpricedDays: result.unpricedDays,
          computedAt: new Date(),
        },
        create: {
          matchedLotId: entry.lot.id,
          mfe: decimalString(result.mfe),
          mae: decimalString(result.mae),
          mfePct: result.mfePct === null ? null : decimalString(result.mfePct),
          maePct: result.maePct === null ? null : decimalString(result.maePct),
          mfeDate: dateFromKey(result.mfeDate),
          maeDate: dateFromKey(result.maeDate),
          pricedDays: result.pricedDays,
          unpricedDays: result.unpricedDays,
        },
      }),
    );
    excursionsUpserted += 1;

    if (upserts.length >= UPSERT_BATCH_SIZE) {
      await flushUpserts(prismaClient, upserts);
    }
  }

  await flushUpserts(prismaClient, upserts);
  logger.log(`[backfill:lot-excursions] lots=${lotWindows.length} upserted=${excursionsUpserted} pricedDays=${pricedDays} unpricedDays=${unpricedDays}`);

  return {
    lotCount: lotWindows.length,
    excursionsUpserted,
    pricedDays,
    unpricedDays,
    noMarkLotCount,
  };
}
