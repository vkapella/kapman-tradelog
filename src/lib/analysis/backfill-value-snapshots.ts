import { Prisma, type PrismaClient } from "@prisma/client";
import { buildAccountIdWhere, toEndOfDayUtcIso } from "@/lib/api/account-scope";
import { parsePayloadByType } from "@/lib/adjustments/types";
import { prisma } from "@/lib/db/prisma";
import { deriveInstrumentKeyFromPersistedExecution } from "@/lib/ledger/instrument-key";
import { computeHoldingsAsOf } from "@/lib/positions/compute-holdings-asof";
import type { ExecutionRecord, ManualAdjustmentRecord, MatchedLotRecord } from "@/types/api";
import {
  computeAccountValueForDate,
  type HistoricalMarksByInstrument,
} from "./value-snapshot-engine";

interface LoggerLike {
  log(message: string): void;
  warn(message: string): void;
}

export interface BackfillValueSnapshotsInput {
  accountIds?: string[];
  startDate?: Date;
  endDate?: Date;
  now?: Date;
  prismaClient?: PrismaClient;
  logger?: LoggerLike;
}

export interface BackfillValueSnapshotsSummary {
  accountCount: number;
  startDate: string;
  endDate: string;
  tradingDayCount: number;
  snapshotsUpserted: number;
  unpricedPositionCount: number;
}

type ExecutionRow = Prisma.ExecutionGetPayload<Record<string, never>>;
type MatchedLotRow = Prisma.MatchedLotGetPayload<{
  include: {
    openExecution: true;
    closeExecution: true;
  };
}>;
type ManualAdjustmentRow = Prisma.ManualAdjustmentGetPayload<{
  include: {
    account: {
      select: {
        accountId: true;
      };
    };
  };
}>;

export interface AccountActivityDateRow {
  accountId: string;
  date: Date | null;
}

const FALLBACK_MARK_LOOKBACK_DAYS = 10;
const UPSERT_BATCH_SIZE = 50;
const INTERNAL_CASH_EQUIVALENT_ROW_TYPES = new Set([
  "MONEY_MARKET",
  "MONEY_MARKET_BUY",
  "MONEY_MARKET_REDEEM",
  "MONEY_MARKET_EXCHANGE_OUT",
  "MONEY_MARKET_EXCHANGE_IN",
  "REDEMPTION",
]);

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getUtcYesterday(now: Date): Date {
  return addUtcDays(startOfUtcDay(now), -1);
}

function isOnOrBeforeDate(date: Date, snapshotDate: Date): boolean {
  return date.getTime() <= toEndOfDayUtcIso(dateKey(snapshotDate)).getTime();
}

function setEarliestAccountActivityDate(result: Map<string, Date>, row: AccountActivityDateRow): void {
  if (!row.date) {
    return;
  }

  const date = startOfUtcDay(row.date);
  const existing = result.get(row.accountId);
  if (!existing || date.getTime() < existing.getTime()) {
    result.set(row.accountId, date);
  }
}

export function buildFirstActivityDateByAccount(input: {
  tradeDates: AccountActivityDateRow[];
  cashEventDates: AccountActivityDateRow[];
  brokerSnapshotDates: AccountActivityDateRow[];
}): Map<string, Date> {
  const result = new Map<string, Date>();
  for (const row of input.tradeDates) {
    setEarliestAccountActivityDate(result, row);
  }
  for (const row of input.cashEventDates) {
    setEarliestAccountActivityDate(result, row);
  }
  for (const row of input.brokerSnapshotDates) {
    setEarliestAccountActivityDate(result, row);
  }
  return result;
}

export function cumulativeLedgerAmountForCashEvent(event: { amount: Prisma.Decimal | number; rowType: string }): number {
  // Money-market sweep rows move cash into/out of cash-equivalent funds. Trade
  // cash deltas already capture buying power changes, so including sweeps here
  // would double-count internal bookkeeping.
  if (INTERNAL_CASH_EQUIVALENT_ROW_TYPES.has(event.rowType)) {
    return 0;
  }

  return Number(event.amount);
}

export function reconstructedTradeCashDelta(execution: {
  assetClass: string;
  side: string | null;
  quantity: Prisma.Decimal | string | number;
  price: Prisma.Decimal | string | number | null;
  rawRowJson?: Prisma.JsonValue | null;
}): number {
  if (isCashNeutralTransferReceive(execution.rawRowJson)) {
    return 0;
  }

  if (execution.side !== "BUY" && execution.side !== "SELL") {
    return 0;
  }

  if (execution.price === null) {
    return 0;
  }

  const quantity = Math.abs(Number(execution.quantity));
  const price = Number(execution.price);
  if (!Number.isFinite(quantity) || !Number.isFinite(price)) {
    return 0;
  }

  const multiplier = execution.assetClass === "OPTION" ? 100 : 1;
  const grossCashFlow = quantity * price * multiplier;
  return execution.side === "BUY" ? grossCashFlow * -1 : grossCashFlow;
}

function isRecord(value: Prisma.JsonValue | null | undefined): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonStringField(value: Prisma.JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function isCashNeutralTransferReceive(rawRowJson: Prisma.JsonValue | null | undefined): boolean {
  if (!isRecord(rawRowJson)) {
    return false;
  }

  const action = jsonStringField(rawRowJson.action)?.toUpperCase() ?? "";
  const rawAction = jsonStringField(rawRowJson.rawAction)?.toUpperCase() ?? "";
  return action.includes("ACAT_RECEIVE") || rawAction.includes("ACAT RECEIVE");
}

function toExecutionRecord(row: ExecutionRow): ExecutionRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    broker: row.broker,
    symbol: row.symbol,
    tradeDate: row.tradeDate.toISOString(),
    eventTimestamp: row.eventTimestamp.toISOString(),
    eventType: row.eventType,
    assetClass: row.assetClass,
    side: row.side,
    quantity: row.quantity.toString(),
    price: row.price?.toString() ?? null,
    openingClosingEffect: row.openingClosingEffect,
    instrumentKey: deriveInstrumentKeyFromPersistedExecution(row),
    underlyingSymbol: row.underlyingSymbol,
    optionType: row.optionType,
    strike: row.strike?.toString() ?? null,
    expirationDate: row.expirationDate?.toISOString() ?? null,
    spreadGroupId: row.spreadGroupId,
    importId: row.importId,
  };
}

function toMatchedLotRecord(row: MatchedLotRow): MatchedLotRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    symbol: row.openExecution.symbol,
    underlyingSymbol: row.openExecution.underlyingSymbol,
    openTradeDate: row.openExecution.tradeDate.toISOString(),
    closeTradeDate: row.closeExecution?.tradeDate.toISOString() ?? null,
    openImportId: row.openExecution.importId,
    closeImportId: row.closeExecution?.importId ?? null,
    quantity: row.quantity.toString(),
    realizedPnl: row.realizedPnl.toString(),
    holdingDays: row.holdingDays,
    outcome: row.outcome,
    openExecutionId: row.openExecutionId,
    closeExecutionId: row.closeExecutionId,
  };
}

function toManualAdjustmentRecord(row: ManualAdjustmentRow): ManualAdjustmentRecord | null {
  try {
    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy,
      accountId: row.accountId,
      accountExternalId: row.account.accountId,
      symbol: row.symbol,
      effectiveDate: row.effectiveDate.toISOString(),
      adjustmentType: row.adjustmentType,
      payload: parsePayloadByType(row.adjustmentType, row.payloadJson),
      reason: row.reason,
      evidenceRef: row.evidenceRef,
      status: row.status,
      reversedByAdjustmentId: row.reversedByAdjustmentId,
    };
  } catch {
    return null;
  }
}

function buildMarksByInstrument(rows: Array<{ instrumentKey: string; markDate: Date; close: Prisma.Decimal }>): HistoricalMarksByInstrument {
  const marksByKey: HistoricalMarksByInstrument = new Map();

  for (const row of rows) {
    const byDate = marksByKey.get(row.instrumentKey) ?? new Map();
    byDate.set(dateKey(row.markDate), { close: Number(row.close) });
    marksByKey.set(row.instrumentKey, byDate);
  }

  return marksByKey;
}

function buildBrokerNlvByAccountDate(
  rows: Array<{ accountId: string; snapshotDate: Date; brokerNetLiquidationValue: Prisma.Decimal | null }>,
): Map<string, number | null> {
  const result = new Map<string, number | null>();
  for (const row of rows) {
    result.set(`${row.accountId}:${dateKey(row.snapshotDate)}`, row.brokerNetLiquidationValue === null ? null : Number(row.brokerNetLiquidationValue));
  }
  return result;
}

async function flushUpserts(prismaClient: PrismaClient, operations: Array<Prisma.PrismaPromise<unknown>>): Promise<void> {
  for (let index = 0; index < operations.length; index += UPSERT_BATCH_SIZE) {
    await Promise.all(operations.slice(index, index + UPSERT_BATCH_SIZE));
  }
  operations.length = 0;
}

export async function backfillValueSnapshots(input: BackfillValueSnapshotsInput = {}): Promise<BackfillValueSnapshotsSummary> {
  const prismaClient = input.prismaClient ?? prisma;
  const logger = input.logger ?? console;
  const accountWhere = buildAccountIdWhere(input.accountIds ?? []) as Prisma.AccountWhereInput | undefined;
  const accounts = await prismaClient.account.findMany({
    where: accountWhere,
    select: {
      id: true,
      accountId: true,
      startingCapital: true,
    },
    orderBy: { accountId: "asc" },
  });

  const scopedAccountIds = accounts.map((account) => account.id);
  if (scopedAccountIds.length === 0) {
    const fallbackDate = dateKey(startOfUtcDay(input.endDate ?? input.now ?? new Date()));
    logger.log("[backfill:value-snapshots] no accounts found; nothing to backfill.");
    return {
      accountCount: 0,
      startDate: fallbackDate,
      endDate: fallbackDate,
      tradingDayCount: 0,
      snapshotsUpserted: 0,
      unpricedPositionCount: 0,
    };
  }

  const [earliestExecution, latestMark] = await Promise.all([
    prismaClient.execution.findFirst({
      where: { accountId: { in: scopedAccountIds } },
      orderBy: { tradeDate: "asc" },
      select: { tradeDate: true },
    }),
    prismaClient.historicalMark.findFirst({
      orderBy: { markDate: "desc" },
      select: { markDate: true },
    }),
  ]);

  const endDate = startOfUtcDay(input.endDate ?? latestMark?.markDate ?? getUtcYesterday(input.now ?? new Date()));
  const startDate = startOfUtcDay(input.startDate ?? earliestExecution?.tradeDate ?? endDate);

  if (startDate.getTime() > endDate.getTime()) {
    throw new Error(`Invalid date range: start ${dateKey(startDate)} is after end ${dateKey(endDate)}.`);
  }

  const [firstTradeRows, firstCashEventRows, firstBrokerSnapshotRows] = await Promise.all([
    prismaClient.execution.groupBy({
      by: ["accountId"],
      where: { accountId: { in: scopedAccountIds } },
      _min: { tradeDate: true },
    }),
    prismaClient.cashEvent.groupBy({
      by: ["accountId"],
      where: { accountId: { in: scopedAccountIds } },
      _min: { eventDate: true },
    }),
    prismaClient.dailyAccountSnapshot.groupBy({
      by: ["accountId"],
      where: { accountId: { in: scopedAccountIds } },
      _min: { snapshotDate: true },
    }),
  ]);
  const firstActivityDateByAccount = buildFirstActivityDateByAccount({
    tradeDates: firstTradeRows.map((row) => ({ accountId: row.accountId, date: row._min.tradeDate })),
    cashEventDates: firstCashEventRows.map((row) => ({ accountId: row.accountId, date: row._min.eventDate })),
    brokerSnapshotDates: firstBrokerSnapshotRows.map((row) => ({ accountId: row.accountId, date: row._min.snapshotDate })),
  });

  const tradingDays = await prismaClient.historicalMark.findMany({
    where: {
      markDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: { markDate: true },
    distinct: ["markDate"],
    orderBy: { markDate: "asc" },
  });

  if (tradingDays.length === 0 || earliestExecution === null) {
    logger.log(
      `[backfill:value-snapshots] no ${earliestExecution === null ? "executions" : "historical marks"} found for ${dateKey(startDate)}..${dateKey(endDate)}.`,
    );
    return {
      accountCount: scopedAccountIds.length,
      startDate: dateKey(startDate),
      endDate: dateKey(endDate),
      tradingDayCount: 0,
      snapshotsUpserted: 0,
      unpricedPositionCount: 0,
    };
  }

  const endOfRange = toEndOfDayUtcIso(dateKey(endDate));
  const markLoadStart = addUtcDays(startDate, -FALLBACK_MARK_LOOKBACK_DAYS);
  const [
    executionRows,
    matchedLotRows,
    adjustmentRows,
    cashEventRows,
    brokerSnapshotRows,
  ] = await Promise.all([
    prismaClient.execution.findMany({
      where: {
        accountId: { in: scopedAccountIds },
        tradeDate: { lte: endOfRange },
      },
      orderBy: [{ accountId: "asc" }, { tradeDate: "asc" }, { id: "asc" }],
    }),
    prismaClient.matchedLot.findMany({
      where: { accountId: { in: scopedAccountIds } },
      include: {
        openExecution: true,
        closeExecution: true,
      },
      orderBy: [{ accountId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
    prismaClient.manualAdjustment.findMany({
      where: {
        accountId: { in: scopedAccountIds },
        status: "ACTIVE",
        effectiveDate: { lte: endOfRange },
      },
      include: {
        account: {
          select: { accountId: true },
        },
      },
      orderBy: [{ accountId: "asc" }, { effectiveDate: "asc" }, { createdAt: "asc" }],
    }),
    prismaClient.cashEvent.findMany({
      where: {
        accountId: { in: scopedAccountIds },
        eventDate: { lte: endOfRange },
      },
      orderBy: [{ accountId: "asc" }, { eventDate: "asc" }, { id: "asc" }],
      select: {
        accountId: true,
        eventDate: true,
        rowType: true,
        amount: true,
      },
    }),
    prismaClient.dailyAccountSnapshot.findMany({
      where: {
        accountId: { in: scopedAccountIds },
        snapshotDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        accountId: true,
        snapshotDate: true,
        brokerNetLiquidationValue: true,
      },
      orderBy: [{ accountId: "asc" }, { snapshotDate: "asc" }, { id: "asc" }],
    }),
  ]);

  const executions = executionRows.map(toExecutionRecord);
  const instrumentKeys = Array.from(new Set(executions.map((execution) => execution.instrumentKey).filter((key): key is string => key !== null)));
  const markRows =
    instrumentKeys.length === 0
      ? []
      : await prismaClient.historicalMark.findMany({
          where: {
            instrumentKey: { in: instrumentKeys },
            markDate: {
              gte: markLoadStart,
              lte: endDate,
            },
          },
          select: {
            instrumentKey: true,
            markDate: true,
            close: true,
          },
          orderBy: [{ instrumentKey: "asc" }, { markDate: "asc" }],
        });

  const marksByKey = buildMarksByInstrument(markRows);
  const matchedLots = matchedLotRows.map(toMatchedLotRecord);
  const adjustments = adjustmentRows.map(toManualAdjustmentRecord).filter((row): row is ManualAdjustmentRecord => row !== null);
  const brokerNlvByAccountDate = buildBrokerNlvByAccountDate(brokerSnapshotRows);
  let snapshotsUpserted = 0;
  let unpricedPositionCount = 0;
  const upserts: Array<Prisma.PrismaPromise<unknown>> = [];

  for (const account of accounts) {
    const accountExecutionRows = executionRows.filter((execution) => execution.accountId === account.id);
    const accountExecutions = executions.filter((execution) => execution.accountId === account.id);
    const accountMatchedLots = matchedLots.filter((lot) => lot.accountId === account.id);
    const accountAdjustments = adjustments.filter((adjustment) => adjustment.accountId === account.id);
    const accountCashEvents = cashEventRows.filter((event) => event.accountId === account.id);
    const accountFirstActivityDate = firstActivityDateByAccount.get(account.id) ?? null;
    let executionCashIndex = 0;
    let cashEventIndex = 0;
    let cashValue = Number(account.startingCapital ?? 0);
    let accountSnapshotsUpserted = 0;

    for (const tradingDay of tradingDays) {
      const snapshotDate = startOfUtcDay(tradingDay.markDate);

      while (executionCashIndex < accountExecutionRows.length && isOnOrBeforeDate(accountExecutionRows[executionCashIndex]?.tradeDate ?? new Date(0), snapshotDate)) {
        const execution = accountExecutionRows[executionCashIndex];
        if (execution) {
          cashValue += reconstructedTradeCashDelta(execution);
        }
        executionCashIndex += 1;
      }

      while (cashEventIndex < accountCashEvents.length && isOnOrBeforeDate(accountCashEvents[cashEventIndex]?.eventDate ?? new Date(0), snapshotDate)) {
        const cashEvent = accountCashEvents[cashEventIndex];
        if (cashEvent) {
          cashValue += cumulativeLedgerAmountForCashEvent(cashEvent);
        }
        cashEventIndex += 1;
      }

      if (accountFirstActivityDate === null || snapshotDate.getTime() < accountFirstActivityDate.getTime()) {
        continue;
      }

      const holdings = computeHoldingsAsOf(accountExecutions, accountMatchedLots, accountAdjustments, snapshotDate);
      const value = computeAccountValueForDate({
        holdings,
        marksByKey,
        cashValue,
        brokerNlv: brokerNlvByAccountDate.get(`${account.id}:${dateKey(snapshotDate)}`) ?? null,
        snapshotDate,
      });

      unpricedPositionCount += value.unpricedPositionCount;
      upserts.push(
        prismaClient.accountValueSnapshot.upsert({
          where: {
            accountId_snapshotDate: {
              accountId: account.id,
              snapshotDate,
            },
          },
          update: {
            cashValue: value.cashValue.toFixed(6),
            equityValue: value.equityValue.toFixed(6),
            optionValue: value.optionValue.toFixed(6),
            totalValue: value.totalValue.toFixed(6),
            brokerNlv: value.brokerNlv === null ? null : value.brokerNlv.toFixed(6),
            reconcileDelta: value.reconcileDelta === null ? null : value.reconcileDelta.toFixed(6),
            unpricedPositionCount: value.unpricedPositionCount,
            source: value.source,
          },
          create: {
            accountId: account.id,
            snapshotDate,
            cashValue: value.cashValue.toFixed(6),
            equityValue: value.equityValue.toFixed(6),
            optionValue: value.optionValue.toFixed(6),
            totalValue: value.totalValue.toFixed(6),
            brokerNlv: value.brokerNlv === null ? null : value.brokerNlv.toFixed(6),
            reconcileDelta: value.reconcileDelta === null ? null : value.reconcileDelta.toFixed(6),
            unpricedPositionCount: value.unpricedPositionCount,
            source: value.source,
          },
        }),
      );
      snapshotsUpserted += 1;
      accountSnapshotsUpserted += 1;

      if (upserts.length >= UPSERT_BATCH_SIZE) {
        await flushUpserts(prismaClient, upserts);
      }
    }

    logger.log(`[backfill:value-snapshots] account=${account.accountId} snapshots=${accountSnapshotsUpserted}`);
  }

  await flushUpserts(prismaClient, upserts);

  return {
    accountCount: scopedAccountIds.length,
    startDate: dateKey(startDate),
    endDate: dateKey(endDate),
    tradingDayCount: tradingDays.length,
    snapshotsUpserted,
    unpricedPositionCount,
  };
}
