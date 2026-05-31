import { MarkAssetClass, MarkSource, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { parseEquityDayAggsCsv } from "@/lib/marketdata/equity-day-aggs-parser";
import {
  createS3FlatfilesClient,
  defaultS3FlatfilesConfig,
  downloadDayAggsCsvForDate,
  listAvailableDatesInRange,
  type S3LikeClient,
} from "@/lib/marketdata/s3-flatfiles";

interface LoggerLike {
  log(message: string): void;
  warn(message: string): void;
}

export interface IngestEquityMarksInput {
  startDate?: Date;
  endDate?: Date;
  symbols?: string[];
  now?: Date;
  prismaClient?: PrismaClient;
  s3Client?: S3LikeClient;
  logger?: LoggerLike;
}

export interface IngestEquityMarksSummary {
  startDate: string;
  endDate: string;
  symbolsRequested: number;
  datesProcessed: number;
  datesSkippedMissing: number;
  rowsUpserted: number;
  symbolsMissing: string[];
}

interface IngestDefaults {
  startDate: Date;
  endDate: Date;
  symbols: string[];
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function utcDateLabel(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getUtcYesterday(now: Date): Date {
  const todayUtc = startOfUtcDay(now);
  return new Date(todayUtc.getTime() - 24 * 60 * 60 * 1000);
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function listUtcDateRangeInclusive(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  for (let cursor = startOfUtcDay(startDate); cursor.getTime() <= endDate.getTime(); cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)) {
    dates.push(cursor);
  }
  return dates;
}

function normalizeSymbols(symbols: string[]): string[] {
  return Array.from(
    new Set(
      symbols
        .map((symbol) => symbol.trim().toUpperCase())
        .filter((symbol) => symbol.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

async function loadDistinctEquitySymbols(prismaClient: PrismaClient): Promise<string[]> {
  const rows = await prismaClient.execution.findMany({
    where: {
      assetClass: "EQUITY",
      symbol: {
        not: "",
      },
    },
    select: {
      symbol: true,
    },
    distinct: ["symbol"],
  });

  return normalizeSymbols(rows.map((row) => row.symbol));
}

async function loadEarliestEquityTradeDate(prismaClient: PrismaClient): Promise<Date | null> {
  const row = await prismaClient.execution.findFirst({
    where: {
      assetClass: "EQUITY",
    },
    orderBy: {
      tradeDate: "asc",
    },
    select: {
      tradeDate: true,
    },
  });

  return row ? startOfUtcDay(row.tradeDate) : null;
}

export async function resolveIngestEquityMarksDefaults(input: {
  now?: Date;
  prismaClient?: PrismaClient;
  symbols?: string[];
  startDate?: Date;
  endDate?: Date;
} = {}): Promise<IngestDefaults> {
  const prismaClient = input.prismaClient ?? prisma;
  const now = input.now ?? new Date();

  const symbols = input.symbols ? normalizeSymbols(input.symbols) : await loadDistinctEquitySymbols(prismaClient);
  const fallbackEndDate = getUtcYesterday(now);
  const earliestTradeDate = await loadEarliestEquityTradeDate(prismaClient);

  const startDate = startOfUtcDay(input.startDate ?? earliestTradeDate ?? fallbackEndDate);
  const endDate = startOfUtcDay(input.endDate ?? fallbackEndDate);

  return {
    startDate,
    endDate,
    symbols,
  };
}

export async function ingestEquityMarks(input: IngestEquityMarksInput = {}): Promise<IngestEquityMarksSummary> {
  const prismaClient = input.prismaClient ?? prisma;
  const logger = input.logger ?? console;

  const defaults = await resolveIngestEquityMarksDefaults({
    now: input.now,
    prismaClient,
    symbols: input.symbols,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  if (defaults.startDate.getTime() > defaults.endDate.getTime()) {
    throw new Error(`Invalid date range: start ${utcDateLabel(defaults.startDate)} is after end ${utcDateLabel(defaults.endDate)}.`);
  }

  if (defaults.symbols.length === 0) {
    logger.log("[ingest:equity-marks] no equity symbols found; nothing to ingest.");
    return {
      startDate: utcDateLabel(defaults.startDate),
      endDate: utcDateLabel(defaults.endDate),
      symbolsRequested: 0,
      datesProcessed: 0,
      datesSkippedMissing: 0,
      rowsUpserted: 0,
      symbolsMissing: [],
    };
  }

  const s3Config = defaultS3FlatfilesConfig();
  const s3Client = input.s3Client ?? createS3FlatfilesClient(s3Config);

  const availableDates = await listAvailableDatesInRange(s3Client, {
    bucket: s3Config.bucket,
    prefix: s3Config.equityPrefix,
    startDate: defaults.startDate,
    endDate: defaults.endDate,
  });
  const availableDateSet = new Set(availableDates.map((date) => utcDateLabel(date)));

  let datesProcessed = 0;
  let datesSkippedMissing = 0;
  let rowsUpserted = 0;
  const symbolsMissing = new Set<string>();

  for (const markDate of listUtcDateRangeInclusive(defaults.startDate, defaults.endDate)) {
    const markDateLabel = utcDateLabel(markDate);
    if (!availableDateSet.has(markDateLabel)) {
      if (isWeekend(markDate)) {
        continue;
      }

      datesSkippedMissing += 1;
      logger.warn(`[ingest:equity-marks] missing key for ${markDateLabel}; skipping.`);
      continue;
    }

    const csvText = await downloadDayAggsCsvForDate(s3Client, {
      bucket: s3Config.bucket,
      prefix: s3Config.equityPrefix,
      markDate,
    });

    if (csvText === null) {
      datesSkippedMissing += 1;
      logger.warn(`[ingest:equity-marks] key disappeared for ${markDateLabel}; skipping.`);
      continue;
    }

    const parsed = parseEquityDayAggsCsv(csvText, defaults.symbols);

    for (const missingSymbol of parsed.missingSymbols) {
      symbolsMissing.add(missingSymbol);
    }

    for (const row of parsed.rows) {
      const markDateValue = startOfUtcDay(markDate);
      const instrumentKey = row.symbol.toUpperCase();

      await prismaClient.historicalMark.upsert({
        where: {
          instrumentKey_markDate: {
            instrumentKey,
            markDate: markDateValue,
          },
        },
        update: {
          assetClass: MarkAssetClass.EQUITY,
          symbol: row.symbol,
          open: row.open.toFixed(6),
          high: row.high.toFixed(6),
          low: row.low.toFixed(6),
          close: row.close.toFixed(6),
          volume: row.volume === null ? null : row.volume.toFixed(6),
          source: MarkSource.MASSIVE_S3,
        },
        create: {
          instrumentKey,
          assetClass: MarkAssetClass.EQUITY,
          symbol: row.symbol,
          markDate: markDateValue,
          open: row.open.toFixed(6),
          high: row.high.toFixed(6),
          low: row.low.toFixed(6),
          close: row.close.toFixed(6),
          volume: row.volume === null ? null : row.volume.toFixed(6),
          source: MarkSource.MASSIVE_S3,
        },
      });
      rowsUpserted += 1;
    }

    datesProcessed += 1;
    logger.log(
      `[ingest:equity-marks] date=${markDateLabel} rows=${parsed.rows.length} invalidRows=${parsed.invalidRowCount} duplicates=${parsed.duplicateSymbolCount}`,
    );
  }

  const summary: IngestEquityMarksSummary = {
    startDate: utcDateLabel(defaults.startDate),
    endDate: utcDateLabel(defaults.endDate),
    symbolsRequested: defaults.symbols.length,
    datesProcessed,
    datesSkippedMissing,
    rowsUpserted,
    symbolsMissing: Array.from(symbolsMissing).sort((left, right) => left.localeCompare(right)),
  };

  logger.log(
    `[ingest:equity-marks] complete datesProcessed=${summary.datesProcessed} rowsUpserted=${summary.rowsUpserted} symbolsMissing=${summary.symbolsMissing.length}`,
  );

  return summary;
}
