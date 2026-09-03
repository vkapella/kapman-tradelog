import { Prisma } from "@prisma/client";
import { parsePayloadByType } from "@/lib/adjustments/types";
import { loadAccountBalanceContext } from "@/lib/accounts/account-balance-context";
import { serializeDataRevision } from "@/lib/accounts/data-revision";
import { prisma } from "@/lib/db/prisma";
import { getEquityQuotes, getOptionQuotesBatch } from "@/lib/mcp/market-data";
import { computeOpenPositions } from "@/lib/positions/compute-open-positions";
import { resolveLiveAccountValue, sumCompleteReconstructedNlv } from "@/lib/positions/live-account-value";
import { buildExcursionLegs, computeOpenLegExcursions } from "@/lib/analysis/compute-open-leg-excursions";
import { loadFallbackMarks } from "@/lib/positions/fallback-marks";
import { collectParValueInstrumentKeys, PAR_VALUE_MARK } from "@/lib/positions/par-value-instruments";
import { normalizePositionSnapshotAccountIds, resolvePositionSnapshotAccountIds, serializePositionSnapshotAccountIds } from "@/lib/positions/position-snapshot";
import type {
  EquityQuoteRecord,
  ExecutionRecord,
  ManualAdjustmentRecord,
  MatchedLotRecord,
  PositionSnapshotComputeResponse,
  PositionSnapshotOpenPosition,
} from "@/types/api";

function detailLog(snapshotId: string, step: string, startedAtMs: number, details: Record<string, unknown> = {}): void {
  if (process.env.NEXT_PUBLIC_DEBUG_PERF !== "1") {
    return;
  }

  const elapsedMs = Date.now() - startedAtMs;
  console.info(`[positions.snapshot.compute] ${snapshotId} ${step}`, { elapsedMs, ...details });
}

function toMoneyDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(6));
}

function toMoneyNumber(value: Prisma.Decimal | null | undefined): number {
  return Number(value ?? 0);
}

function sumManualAdjustmentAmounts(adjustments: ManualAdjustmentRecord[]): number {
  return adjustments.reduce((sum, adjustment) => {
    const payload = adjustment.payload as unknown as Record<string, unknown>;

    if ("amount" in payload) {
      const amount = Number(payload.amount);
      return Number.isFinite(amount) ? sum + amount : sum;
    }

    if (adjustment.adjustmentType === "ADD_POSITION" && "costBasis" in payload) {
      const costBasis = Number(payload.costBasis);
      return Number.isFinite(costBasis) ? sum + costBasis : sum;
    }

    return sum;
  }, 0);
}

function mapExecutionRowsToRecords(rows: Array<{
  id: string;
  accountId: string;
  broker: "SCHWAB_THINKORSWIM" | "FIDELITY";
  symbol: string;
  tradeDate: Date;
  eventTimestamp: Date;
  eventType: "TRADE" | "EXPIRATION_INFERRED" | "ASSIGNMENT" | "EXERCISE";
  assetClass: "EQUITY" | "OPTION" | "CASH" | "OTHER";
  side: "BUY" | "SELL" | null;
  quantity: Prisma.Decimal;
  price: Prisma.Decimal | null;
  openingClosingEffect: "TO_OPEN" | "TO_CLOSE" | "UNKNOWN" | null;
  instrumentKey: string | null;
  underlyingSymbol: string | null;
  optionType: string | null;
  strike: Prisma.Decimal | null;
  expirationDate: Date | null;
  spreadGroupId: string | null;
  importId: string;
  rawRowJson?: Prisma.JsonValue | null;
}>): ExecutionRecord[] {
  return rows.map((row) => ({
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
    openingClosingEffect: row.openingClosingEffect ?? null,
    instrumentKey: row.instrumentKey,
    underlyingSymbol: row.underlyingSymbol,
    optionType: row.optionType,
    strike: row.strike?.toString() ?? null,
    expirationDate: row.expirationDate?.toISOString() ?? null,
    spreadGroupId: row.spreadGroupId,
    importId: row.importId,
    rawRowJson: row.rawRowJson ?? null,
  }));
}

function mapMatchedLotRowsToRecords(rows: Array<{
  id: string;
  accountId: string;
  quantity: Prisma.Decimal;
  realizedPnl: Prisma.Decimal;
  holdingDays: number;
  outcome: string;
  openExecutionId: string;
  closeExecutionId: string | null;
  openExecution: { tradeDate: Date; importId: string; symbol: string };
  closeExecution: { tradeDate: Date; importId: string } | null;
}>): MatchedLotRecord[] {
  return rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    symbol: row.openExecution.symbol,
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
  }));
}

function mapAdjustmentRowsToRecords(rows: Array<{
  id: string;
  createdAt: Date;
  createdBy: string;
  accountId: string;
  symbol: string;
  effectiveDate: Date;
  adjustmentType: "SPLIT" | "QTY_OVERRIDE" | "PRICE_OVERRIDE" | "ADD_POSITION" | "REMOVE_POSITION" | "EXECUTION_QTY_OVERRIDE" | "EXECUTION_PRICE_OVERRIDE";
  payloadJson: Prisma.JsonValue;
  reason: string;
  evidenceRef: string | null;
  status: "ACTIVE" | "REVERSED";
  reversedByAdjustmentId: string | null;
  account: { accountId: string };
}>): ManualAdjustmentRecord[] {
  const records: ManualAdjustmentRecord[] = [];

  for (const row of rows) {
    try {
      records.push({
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
      });
    } catch {
      // Ignore malformed adjustment payloads in snapshot computation.
    }
  }

  return records;
}

async function computeSnapshot(snapshotId: string, accountIds: string[]): Promise<void> {
  const startedAtMs = Date.now();
  detailLog(snapshotId, "started", startedAtMs, { accountCount: accountIds.length });

  const accountScope = accountIds.length > 0 ? ({ accountId: { in: accountIds } } as const) : undefined;
  const manualAdjustmentWhere: Prisma.ManualAdjustmentWhereInput = {
    AND: [{ status: "ACTIVE" }, ...(accountScope ? [accountScope] : [])],
  };

  try {
    // All snapshot-relevant local inputs AND the per-account data revisions are
    // read inside one REPEATABLE READ transaction, so the stamped revision
    // provably matches what was read (see #339). External quote calls happen
    // after the transaction commits.
    const inputsReadAt = new Date();
    const { accountRows, executionRows, matchedLotRows, adjustmentRows, realizedByAccountRows, cashByAccountRows, balanceContext } = await prisma.$transaction(async (tx) => {
    const [accountRows, executionRows, matchedLotRows, adjustmentRows, realizedByAccountRows, cashByAccountRows] = await Promise.all([
      tx.account.findMany({
        where: accountScope ? { id: { in: accountIds } } : undefined,
        select: { id: true, accountId: true, startingCapital: true, dataRevision: true },
      }),
      tx.execution.findMany({
        where: accountScope,
        select: {
          id: true,
          accountId: true,
          broker: true,
          symbol: true,
          tradeDate: true,
          eventTimestamp: true,
          eventType: true,
          assetClass: true,
          side: true,
          quantity: true,
          price: true,
          openingClosingEffect: true,
          instrumentKey: true,
          underlyingSymbol: true,
          optionType: true,
          strike: true,
          expirationDate: true,
          spreadGroupId: true,
          importId: true,
          rawRowJson: true,
        },
      }),
      tx.matchedLot.findMany({
        where: accountScope,
        include: {
          openExecution: { select: { tradeDate: true, importId: true, symbol: true } },
          closeExecution: { select: { tradeDate: true, importId: true } },
        },
      }),
      tx.manualAdjustment.findMany({
        where: manualAdjustmentWhere,
        include: { account: { select: { accountId: true } } },
      }),
      tx.matchedLot.groupBy({ by: ["accountId"], where: accountScope, _sum: { realizedPnl: true } }),
      tx.cashEvent.groupBy({ by: ["accountId"], where: accountScope, _sum: { amount: true } }),
    ]);
    const balanceContext = await loadAccountBalanceContext(accountIds, tx);
    return { accountRows, executionRows, matchedLotRows, adjustmentRows, realizedByAccountRows, cashByAccountRows, balanceContext };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

    detailLog(snapshotId, "loaded-inputs", startedAtMs, {
      accountCount: accountRows.length,
      executionCount: executionRows.length,
      matchedLotCount: matchedLotRows.length,
      adjustmentCount: adjustmentRows.length,
    });

    const executions = mapExecutionRowsToRecords(executionRows);
    const matchedLots = mapMatchedLotRowsToRecords(matchedLotRows);
    const manualAdjustments = mapAdjustmentRowsToRecords(adjustmentRows);
    const openPositions = computeOpenPositions(executions, matchedLots, manualAdjustments);
    detailLog(snapshotId, "computed-open-positions", startedAtMs, { openPositionCount: openPositions.length });

    // Money-market funds are priced at par, never quoted (#348).
    const parValueInstrumentKeys = collectParValueInstrumentKeys(executions);
    const equityPositions = openPositions.filter(
      (position) => position.assetClass === "EQUITY" && !parValueInstrumentKeys.has(position.instrumentKey),
    );
    const optionPositions = openPositions.filter(
      (position) => position.assetClass === "OPTION" && position.optionType && position.expirationDate && position.strike,
    );

    const equityQuotePromise: Promise<Record<string, EquityQuoteRecord> | null> =
      equityPositions.length > 0 ? getEquityQuotes(Array.from(new Set(equityPositions.map((position) => position.symbol)))) : Promise.resolve(null);

    const [equityQuotes, optionQuotes] = await Promise.all([
      equityQuotePromise,
      optionPositions.length > 0
        ? getOptionQuotesBatch(
            optionPositions.map((position) => ({
              underlyingSymbol: position.underlyingSymbol,
              strike: Number(position.strike),
              expirationDate: position.expirationDate?.slice(0, 10) ?? "",
              optionType: position.optionType ?? "",
            })),
          )
        : Promise.resolve(new Map<string, number | null>()),
    ]);

    detailLog(snapshotId, "loaded-quotes", startedAtMs, {
      equityQuoteCount: equityQuotes ? Object.keys(equityQuotes).length : 0,
      optionQuoteCount: optionQuotes.size,
    });

    const liveMarks = new Map<string, number>();
    for (const position of openPositions) {
      if (parValueInstrumentKeys.has(position.instrumentKey)) {
        continue;
      }
      const mark = position.assetClass === "EQUITY"
        ? equityQuotes?.[position.symbol]?.mark ?? null
        : optionQuotes.get(position.instrumentKey) ?? null;
      if (mark !== null && Number.isFinite(mark)) {
        liveMarks.set(position.instrumentKey, mark);
      }
    }

    // A recent daily close beats no value at all, but only inside the recency
    // window and only when a live quote is genuinely unavailable.
    const fallbackMarks = await loadFallbackMarks(
      openPositions
        .filter((position) => !liveMarks.has(position.instrumentKey) && !parValueInstrumentKeys.has(position.instrumentKey))
        .map((position) => position.instrumentKey),
      new Date(),
    );
    detailLog(snapshotId, "loaded-fallback-marks", startedAtMs, {
      requested: openPositions.length - liveMarks.size,
      resolved: fallbackMarks.size,
    });

    let totalMarkedValue = 0;
    const pricedPositions: PositionSnapshotOpenPosition[] = openPositions.map((position) => {
      const parMark = parValueInstrumentKeys.has(position.instrumentKey) ? PAR_VALUE_MARK : null;
      const liveMark = parMark === null ? liveMarks.get(position.instrumentKey) ?? null : null;
      const fallback = parMark === null && liveMark === null ? fallbackMarks.get(position.instrumentKey) ?? null : null;
      const mark = parMark ?? liveMark ?? fallback?.mark ?? null;

      if (mark !== null) {
        totalMarkedValue += mark * position.netQty * (position.assetClass === "OPTION" ? 100 : 1);
      }

      return {
        ...position,
        mark,
        markSource: mark === null ? null : parMark !== null ? "PAR" : liveMark !== null ? "LIVE" : "HISTORICAL",
        markAsOf: fallback?.markDate ?? null,
      };
    });

    const totalCostBasis = openPositions.reduce((sum, position) => sum + position.costBasis, 0);
    const unrealizedPnl = totalMarkedValue - totalCostBasis;
    const startingCapital = accountRows.reduce((sum, account) => sum + Number(account.startingCapital ?? 0), 0);
    const realizedByAccount = new Map(realizedByAccountRows.map((row) => [row.accountId, toMoneyNumber(row._sum.realizedPnl)]));
    const cashByAccount = new Map(cashByAccountRows.map((row) => [row.accountId, toMoneyNumber(row._sum.amount)]));
    const marksAsOf = new Date();
    const accountValues = accountRows.map((account) => resolveLiveAccountValue({
      accountId: account.id,
      accountExternalId: account.accountId,
      positions: pricedPositions,
      balance: balanceContext.find((entry) => entry.accountExternalId === account.accountId) ?? null,
      marksAsOf,
      inputsRevision: serializeDataRevision(account.dataRevision),
    }));
    const currentNlv = sumCompleteReconstructedNlv(accountValues);

    const realizedPnl = Array.from(realizedByAccount.values()).reduce((sum, value) => sum + value, 0);
    const cashAdjustments = Array.from(cashByAccount.values()).reduce((sum, value) => sum + value, 0);
    const manualAdjustmentsTotal = sumManualAdjustmentAmounts(manualAdjustments);
    const totalGain = currentNlv === null ? null : currentNlv - startingCapital;
    const unexplainedDelta = totalGain === null
      ? null
      : totalGain - unrealizedPnl - cashAdjustments - realizedPnl - manualAdjustmentsTotal;

    // Open-leg MAE/MFE from HistoricalMark daily high/low over entry->now (advisory display).
    const openLegExcursions = await computeOpenLegExcursions(prisma, buildExcursionLegs(pricedPositions, executions), new Date());
    const persistedPositions: PositionSnapshotOpenPosition[] = pricedPositions.map((position) => {
      const excursion = openLegExcursions.get(position.accountId + "::" + position.instrumentKey);
      return excursion
        ? {
            ...position,
            maePct: excursion.maePct,
            mfePct: excursion.mfePct,
            pricedDays: excursion.pricedDays,
            unpricedDays: excursion.unpricedDays,
            excursionAsOf: excursion.excursionAsOf,
          }
        : position;
    });

    // Per-account results, frozen at compute time. The reconciliation identity
    // holds per account with all inputs from ONE observation, which is what
    // keeps unexplainedDelta meaningful as a data-integrity signal.
    const accountResults = accountRows.map((account) => {
      const value = accountValues.find((entry) => entry.accountId === account.id);
      const accountPositions = persistedPositions.filter((position) => position.accountId === account.id);
      const accountMarkedValue = accountPositions.reduce(
        (sum, position) => (position.mark === null ? sum : sum + position.mark * position.netQty * (position.assetClass === "OPTION" ? 100 : 1)),
        0,
      );
      const accountCostBasis = accountPositions.reduce((sum, position) => sum + position.costBasis, 0);
      const accountMissingMarks = (value?.missingMarkCount ?? 0) > 0;
      const accountUnrealized = accountMissingMarks ? null : accountMarkedValue - accountCostBasis;
      const accountStartingCapital = Number(account.startingCapital ?? 0);
      const accountRealized = realizedByAccount.get(account.id) ?? 0;
      const accountCash = cashByAccount.get(account.id) ?? 0;
      const accountManual = sumManualAdjustmentAmounts(manualAdjustments.filter((adjustment) => adjustment.accountId === account.id));
      const accountNlv = value?.reconstructedNlv == null ? null : Number(value.reconstructedNlv);
      const accountTotalGain = accountNlv === null ? null : accountNlv - accountStartingCapital;
      const accountUnexplained = accountTotalGain === null || accountUnrealized === null
        ? null
        : accountTotalGain - accountUnrealized - accountCash - accountRealized - accountManual;

      return {
        runId: snapshotId,
        accountId: account.id,
        inputsRevision: account.dataRevision,
        cash: toMoneyDecimal(Number(value?.cashAndEquivalents ?? 0)),
        equityMarketValue: toMoneyDecimal(Number(value?.equityMarketValue ?? 0)),
        optionMarketValue: toMoneyDecimal(Number(value?.optionMarketValue ?? 0)),
        securitiesMarketValue: toMoneyDecimal(Number(value?.securitiesMarketValue ?? 0)),
        reconstructedNlv: accountNlv === null ? null : toMoneyDecimal(accountNlv),
        brokerNlv: value?.brokerReportedNlv == null ? null : toMoneyDecimal(Number(value.brokerReportedNlv)),
        startingCapital: toMoneyDecimal(accountStartingCapital),
        realizedPnl: toMoneyDecimal(accountRealized),
        cashAdjustments: toMoneyDecimal(accountCash),
        manualAdjustments: toMoneyDecimal(accountManual),
        unrealizedPnl: accountUnrealized === null ? null : toMoneyDecimal(accountUnrealized),
        totalGain: accountTotalGain === null ? null : toMoneyDecimal(accountTotalGain),
        unexplainedDelta: accountUnexplained === null ? null : toMoneyDecimal(accountUnexplained),
        marksAsOf,
        cashAsOf: value?.cashAsOf ? new Date(value.cashAsOf) : null,
        brokerNlvAsOf: value?.brokerNlvAsOf ? new Date(value.brokerNlvAsOf) : null,
        missingMarkCount: value?.missingMarkCount ?? 0,
        staleMarkCount: value?.staleMarkCount ?? 0,
        staleMarkAsOf: value?.staleMarkAsOf ?? null,
        status: value?.status ?? "INCOMPLETE_MARKS",
        positionsJson: JSON.stringify(accountPositions),
      };
    });

    await prisma.$transaction([
      prisma.positionSnapshot.update({
        where: { id: snapshotId },
        data: {
          status: "COMPLETE",
          completedAt: new Date(),
          inputsReadAt,
          positionsJson: JSON.stringify(persistedPositions),
          accountValuesJson: JSON.stringify(accountValues),
          // Legacy scope-wide scalars: still written for compat, no longer the
          // authoritative source for any non-exact-scope read.
          unrealizedPnl: toMoneyDecimal(unrealizedPnl),
          realizedPnl: toMoneyDecimal(realizedPnl),
          cashAdjustments: toMoneyDecimal(cashAdjustments),
          manualAdjustments: toMoneyDecimal(manualAdjustmentsTotal),
          currentNlv: currentNlv === null ? null : toMoneyDecimal(currentNlv),
          startingCapital: toMoneyDecimal(startingCapital),
          totalGain: totalGain === null ? null : toMoneyDecimal(totalGain),
          unexplainedDelta: unexplainedDelta === null ? null : toMoneyDecimal(unexplainedDelta),
          errorMessage: null,
        },
      }),
      prisma.positionSnapshotAccount.createMany({ data: accountResults }),
    ]);

    detailLog(snapshotId, "completed", startedAtMs, {
      openPositionCount: pricedPositions.length,
      pricedCount: pricedPositions.filter((position) => position.mark !== null).length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown snapshot compute failure.";

    await prisma.positionSnapshot.update({
      where: { id: snapshotId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage,
      },
    });

    detailLog(snapshotId, "failed", startedAtMs, { errorMessage });
  }
}

export async function startPositionSnapshotCompute(requestedAccountIdsInput: string[]): Promise<PositionSnapshotComputeResponse> {
  const requestedAccountIds = normalizePositionSnapshotAccountIds(requestedAccountIdsInput);
  const accountIds = await resolvePositionSnapshotAccountIds(requestedAccountIds);
  const accountIdsJson = serializePositionSnapshotAccountIds(accountIds);

  const snapshot = await prisma.positionSnapshot.create({
    data: {
      accountIds: accountIdsJson,
      status: "PENDING",
      positionsJson: "[]",
      accountValuesJson: "[]",
    },
    select: { id: true, status: true },
  });

  void computeSnapshot(snapshot.id, accountIds);

  return {
    snapshotId: snapshot.id,
    status: snapshot.status,
  };
}
