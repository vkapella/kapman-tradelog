import { MarkAssetClass, MarkSource, type Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { canonicalToOcc, occToCanonical, parseCanonicalOptionInstrumentKey } from "@/lib/marketdata/occ-ticker";
import { parseOptionDayAggsCsv, type OptionDayAggRow } from "@/lib/marketdata/option-day-aggs-parser";
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

export type OptionMarksIngestSource = "s3" | "rest";

export interface IngestOptionMarksInput {
  startDate?: Date;
  endDate?: Date;
  contracts?: string[];
  source?: OptionMarksIngestSource;
  now?: Date;
  prismaClient?: PrismaClient;
  s3Client?: S3LikeClient;
  logger?: LoggerLike;
  polygonApiKey?: string;
}

export interface IngestOptionMarksSummary {
  source: OptionMarksIngestSource;
  startDate: string;
  endDate: string;
  contractsRequested: number;
  datesProcessed: number;
  datesSkippedMissing: number;
  rowsUpserted: number;
  contractsMissing: string[];
  invalidRowCount: number;
  duplicateContractCount: number;
}

interface IngestDefaults {
  startDate: Date;
  endDate: Date;
  contracts: string[];
}

interface PolygonAggregateResult {
  o?: number;
  h?: number;
  l?: number;
  c?: number;
  v?: number;
  t?: number;
}

interface PolygonAggregateResponse {
  status?: string;
  results?: PolygonAggregateResult[];
  error?: string;
  message?: string;
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

function normalizeContracts(contracts: string[]): string[] {
  return Array.from(
    new Set(
      contracts
        .map((contract) => parseCanonicalOptionInstrumentKey(contract).instrumentKey)
        .filter((contract) => contract.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function tryBuildCanonicalContractFromExecution(execution: {
  instrumentKey: string | null;
  symbol: string;
  underlyingSymbol: string | null;
  optionType: string | null;
  strike: Prisma.Decimal | null;
  expirationDate: Date | null;
}): string | null {
  if (execution.instrumentKey) {
    try {
      return parseCanonicalOptionInstrumentKey(execution.instrumentKey).instrumentKey;
    } catch {
      // Fall back to execution fields below; some legacy rows may have non-canonical keys.
    }
  }

  if (!execution.optionType || !execution.strike || !execution.expirationDate) {
    return null;
  }

  const optionType = execution.optionType.toUpperCase();
  if (optionType !== "CALL" && optionType !== "PUT") {
    return null;
  }

  const underlying = execution.underlyingSymbol ?? execution.symbol;
  const expirationDate = utcDateLabel(execution.expirationDate);
  const fallbackKey = `${underlying}|${optionType}|${execution.strike.toString()}|${expirationDate}`;

  try {
    return parseCanonicalOptionInstrumentKey(fallbackKey).instrumentKey;
  } catch {
    return null;
  }
}

async function loadDistinctOptionContracts(prismaClient: PrismaClient): Promise<string[]> {
  const rows = await prismaClient.execution.findMany({
    where: {
      assetClass: "OPTION",
    },
    select: {
      instrumentKey: true,
      symbol: true,
      underlyingSymbol: true,
      optionType: true,
      strike: true,
      expirationDate: true,
    },
  });

  const contracts = rows
    .map((row) => tryBuildCanonicalContractFromExecution(row))
    .filter((contract): contract is string => contract !== null);

  return normalizeContracts(contracts);
}

async function loadEarliestOptionTradeDate(prismaClient: PrismaClient): Promise<Date | null> {
  const row = await prismaClient.execution.findFirst({
    where: {
      assetClass: "OPTION",
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

export async function resolveIngestOptionMarksDefaults(input: {
  now?: Date;
  prismaClient?: PrismaClient;
  contracts?: string[];
  startDate?: Date;
  endDate?: Date;
} = {}): Promise<IngestDefaults> {
  const prismaClient = input.prismaClient ?? prisma;
  const now = input.now ?? new Date();

  const contracts = input.contracts ? normalizeContracts(input.contracts) : await loadDistinctOptionContracts(prismaClient);
  const fallbackEndDate = getUtcYesterday(now);
  const earliestTradeDate = await loadEarliestOptionTradeDate(prismaClient);
  const startDate = startOfUtcDay(input.startDate ?? earliestTradeDate ?? fallbackEndDate);
  const endDate = startOfUtcDay(input.endDate ?? fallbackEndDate);

  return {
    startDate,
    endDate,
    contracts,
  };
}

async function upsertOptionMark(prismaClient: PrismaClient, params: { row: OptionDayAggRow; markDate: Date; source: MarkSource }): Promise<void> {
  await prismaClient.historicalMark.upsert({
    where: {
      instrumentKey_markDate: {
        instrumentKey: params.row.instrumentKey,
        markDate: params.markDate,
      },
    },
    update: {
      assetClass: MarkAssetClass.OPTION,
      symbol: params.row.underlying,
      open: params.row.open.toFixed(6),
      high: params.row.high.toFixed(6),
      low: params.row.low.toFixed(6),
      close: params.row.close.toFixed(6),
      volume: params.row.volume === null ? null : params.row.volume.toFixed(6),
      source: params.source,
    },
    create: {
      instrumentKey: params.row.instrumentKey,
      assetClass: MarkAssetClass.OPTION,
      symbol: params.row.underlying,
      markDate: params.markDate,
      open: params.row.open.toFixed(6),
      high: params.row.high.toFixed(6),
      low: params.row.low.toFixed(6),
      close: params.row.close.toFixed(6),
      volume: params.row.volume === null ? null : params.row.volume.toFixed(6),
      source: params.source,
    },
  });
}

async function ingestOptionMarksFromS3(params: {
  prismaClient: PrismaClient;
  s3Client?: S3LikeClient;
  logger: LoggerLike;
  defaults: IngestDefaults;
}): Promise<Omit<IngestOptionMarksSummary, "source" | "startDate" | "endDate" | "contractsRequested">> {
  const s3Config = defaultS3FlatfilesConfig();
  const s3Client = params.s3Client ?? createS3FlatfilesClient(s3Config);
  const availableDates = await listAvailableDatesInRange(s3Client, {
    bucket: s3Config.bucket,
    prefix: s3Config.optionsPrefix,
    startDate: params.defaults.startDate,
    endDate: params.defaults.endDate,
  });
  const availableDateSet = new Set(availableDates.map((date) => utcDateLabel(date)));

  let datesProcessed = 0;
  let datesSkippedMissing = 0;
  let rowsUpserted = 0;
  let invalidRowCount = 0;
  let duplicateContractCount = 0;
  const contractsMissing = new Set<string>();

  for (const markDate of listUtcDateRangeInclusive(params.defaults.startDate, params.defaults.endDate)) {
    const markDateLabel = utcDateLabel(markDate);
    if (!availableDateSet.has(markDateLabel)) {
      if (isWeekend(markDate)) {
        continue;
      }

      datesSkippedMissing += 1;
      params.logger.warn(`[ingest:option-marks] missing key for ${markDateLabel}; skipping.`);
      continue;
    }

    const csvText = await downloadDayAggsCsvForDate(s3Client, {
      bucket: s3Config.bucket,
      prefix: s3Config.optionsPrefix,
      markDate,
    });

    if (csvText === null) {
      datesSkippedMissing += 1;
      params.logger.warn(`[ingest:option-marks] key disappeared for ${markDateLabel}; skipping.`);
      continue;
    }

    const parsed = parseOptionDayAggsCsv(csvText, params.defaults.contracts);
    invalidRowCount += parsed.invalidRowCount;
    duplicateContractCount += parsed.duplicateContractCount;

    for (const missingContract of parsed.missingContracts) {
      contractsMissing.add(missingContract);
    }

    for (const row of parsed.rows) {
      await upsertOptionMark(params.prismaClient, {
        row,
        markDate: startOfUtcDay(markDate),
        source: MarkSource.MASSIVE_S3,
      });
      rowsUpserted += 1;
    }

    datesProcessed += 1;
    params.logger.log(
      `[ingest:option-marks] source=s3 date=${markDateLabel} rows=${parsed.rows.length} invalidRows=${parsed.invalidRowCount} duplicates=${parsed.duplicateContractCount}`,
    );
  }

  return {
    datesProcessed,
    datesSkippedMissing,
    rowsUpserted,
    contractsMissing: Array.from(contractsMissing).sort((left, right) => left.localeCompare(right)),
    invalidRowCount,
    duplicateContractCount,
  };
}

function parsePolygonAggregateRows(contract: string, rows: PolygonAggregateResult[]): Array<{ row: OptionDayAggRow; markDate: Date }> {
  const parsedContract = occToCanonical(canonicalToOcc(contract));
  const parsedRows: Array<{ row: OptionDayAggRow; markDate: Date }> = [];

  for (const result of rows) {
    if (typeof result.t !== "number") {
      continue;
    }

    const open = typeof result.o === "number" && Number.isFinite(result.o) ? result.o : null;
    const high = typeof result.h === "number" && Number.isFinite(result.h) ? result.h : null;
    const low = typeof result.l === "number" && Number.isFinite(result.l) ? result.l : null;
    const close = typeof result.c === "number" && Number.isFinite(result.c) ? result.c : null;

    if (open === null || high === null || low === null || close === null) {
      continue;
    }

    parsedRows.push({
      markDate: startOfUtcDay(new Date(result.t)),
      row: {
        instrumentKey: parsedContract.instrumentKey,
        occTicker: parsedContract.occTicker,
        underlying: parsedContract.underlying,
        open,
        high,
        low,
        close,
        volume: typeof result.v === "number" && Number.isFinite(result.v) ? result.v : null,
      },
    });
  }

  return parsedRows;
}

async function fetchPolygonOptionAggregates(params: {
  contract: string;
  startDate: Date;
  endDate: Date;
  apiKey: string;
}): Promise<PolygonAggregateResult[]> {
  const occTicker = canonicalToOcc(params.contract);
  const url = new URL(`https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(occTicker)}/range/1/day/${utcDateLabel(params.startDate)}/${utcDateLabel(params.endDate)}`);
  url.searchParams.set("adjusted", "true");
  url.searchParams.set("sort", "asc");
  url.searchParams.set("limit", "50000");
  url.searchParams.set("apiKey", params.apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Polygon REST aggregate request failed for ${params.contract}: HTTP ${response.status} ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as PolygonAggregateResponse;
  if (payload.status === "ERROR") {
    throw new Error(`Polygon REST aggregate request failed for ${params.contract}: ${payload.error ?? payload.message ?? "unknown error"}`);
  }

  return payload.results ?? [];
}

async function ingestOptionMarksFromRest(params: {
  prismaClient: PrismaClient;
  logger: LoggerLike;
  defaults: IngestDefaults;
  polygonApiKey?: string;
}): Promise<Omit<IngestOptionMarksSummary, "source" | "startDate" | "endDate" | "contractsRequested">> {
  const apiKey = params.polygonApiKey ?? process.env.POLYGON_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("Missing POLYGON_API_KEY for option mark REST fallback.");
  }

  let rowsUpserted = 0;
  const datesProcessed = new Set<string>();
  const contractsMissing = new Set<string>();

  for (const contract of params.defaults.contracts) {
    const aggregateRows = await fetchPolygonOptionAggregates({
      contract,
      startDate: params.defaults.startDate,
      endDate: params.defaults.endDate,
      apiKey,
    });
    const parsedRows = parsePolygonAggregateRows(contract, aggregateRows);

    if (parsedRows.length === 0) {
      contractsMissing.add(contract);
      params.logger.warn(`[ingest:option-marks] source=rest contract=${contract} returned no day aggregates.`);
      continue;
    }

    for (const parsed of parsedRows) {
      await upsertOptionMark(params.prismaClient, {
        row: parsed.row,
        markDate: parsed.markDate,
        source: MarkSource.POLYGON_REST,
      });
      rowsUpserted += 1;
      datesProcessed.add(utcDateLabel(parsed.markDate));
    }

    params.logger.log(`[ingest:option-marks] source=rest contract=${contract} rows=${parsedRows.length}`);
  }

  return {
    datesProcessed: datesProcessed.size,
    datesSkippedMissing: 0,
    rowsUpserted,
    contractsMissing: Array.from(contractsMissing).sort((left, right) => left.localeCompare(right)),
    invalidRowCount: 0,
    duplicateContractCount: 0,
  };
}

export async function ingestOptionMarks(input: IngestOptionMarksInput = {}): Promise<IngestOptionMarksSummary> {
  const prismaClient = input.prismaClient ?? prisma;
  const logger = input.logger ?? console;
  const source = input.source ?? "s3";

  const defaults = await resolveIngestOptionMarksDefaults({
    now: input.now,
    prismaClient,
    contracts: input.contracts,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  if (defaults.startDate.getTime() > defaults.endDate.getTime()) {
    throw new Error(`Invalid date range: start ${utcDateLabel(defaults.startDate)} is after end ${utcDateLabel(defaults.endDate)}.`);
  }

  if (defaults.contracts.length === 0) {
    logger.log("[ingest:option-marks] no option contracts found; nothing to ingest.");
    return {
      source,
      startDate: utcDateLabel(defaults.startDate),
      endDate: utcDateLabel(defaults.endDate),
      contractsRequested: 0,
      datesProcessed: 0,
      datesSkippedMissing: 0,
      rowsUpserted: 0,
      contractsMissing: [],
      invalidRowCount: 0,
      duplicateContractCount: 0,
    };
  }

  const ingested = source === "rest"
    ? await ingestOptionMarksFromRest({
        prismaClient,
        logger,
        defaults,
        polygonApiKey: input.polygonApiKey,
      })
    : await ingestOptionMarksFromS3({
        prismaClient,
        s3Client: input.s3Client,
        logger,
        defaults,
      });

  const summary: IngestOptionMarksSummary = {
    source,
    startDate: utcDateLabel(defaults.startDate),
    endDate: utcDateLabel(defaults.endDate),
    contractsRequested: defaults.contracts.length,
    ...ingested,
  };

  logger.log(
    `[ingest:option-marks] complete source=${summary.source} datesProcessed=${summary.datesProcessed} rowsUpserted=${summary.rowsUpserted} contractsMissing=${summary.contractsMissing.length}`,
  );

  return summary;
}
