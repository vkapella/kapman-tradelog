import { Prisma } from "@prisma/client";
import { detailResponse, errorResponse } from "@/lib/api/responses";
import { parsePayloadByType } from "@/lib/adjustments/types";
import { loadAccountBalanceContext } from "@/lib/accounts/account-balance-context";
import { getStartingCapitalSummary } from "@/lib/accounts/starting-capital";
import { prisma } from "@/lib/db/prisma";
import { getEquityQuotes, getOptionQuotesBatch } from "@/lib/mcp/market-data";
import { computeOpenPositions } from "@/lib/positions/compute-open-positions";
import { normalizePositionSnapshotAccountIds, resolvePositionSnapshotAccountIds, serializePositionSnapshotAccountIds } from "@/lib/positions/position-snapshot";
import type {
  EquityQuoteRecord,
  ExecutionRecord,
  ManualAdjustmentRecord,
  MatchedLotRecord,
  PositionSnapshotComputeResponse,
  PositionSnapshotOpenPosition,
} from "@/types/api";

interface SnapshotComputeRequestBody {
  accountIds?: string[];
}

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
  adjustmentType: "SPLIT" | "QTY_OVERRIDE" | "PRICE_OVERRIDE" | "ADD_POSITION" | "REMOVE_POSITION" | "EXECUTION_QTY_OVERRIDE";
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

function parseBody(value: unknown): SnapshotComputeRequestBody | null {
  if (value === null || typeof value !== "object") {
    return null;
  }

  const candidate = value as { accountIds?: unknown };
  if (candidate.accountIds !== undefined && (!Array.isArray(candidate.accountIds) || candidate.accountIds.some((item) => typeof item !== "string"))) {
    return null;
  }

  return {
    accountIds: candidate.accountIds,
  };
}

async function computeSnapshot(snapshotId: string, accountIds: string[]): Promise<void> {
  const startedAtMs = Date.now();
  detailLog(snapshotId, "started", startedAtMs, { accountCount: accountIds.length });

  const accountScope = accountIds.length > 0 ? ({ accountId: { in: accountIds } } as const) : undefined;
  const manualAdjustmentWhere: Prisma.ManualAdjustmentWhereInput = {
    AND: [{ status: "ACTIVE" }, ...(accountScope ? [accountScope] : [])],
  };

  try {
    const [accountRows, executionRows, matchedLotRows, adjustmentRows, realizedAggregate, cashAggregate] = await Promise.all([
      prisma.account.findMany({
        where: accountScope ? { id: { in: accountIds } } : undefined,
        select: { id: true, accountId: true },
      }),
      prisma.execution.findMany({
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
        },
      }),
      prisma.matchedLot.findMany({
        where: accountScope,
        include: {
          openExecution: { select: { tradeDate: true, importId: true, symbol: true } },
          closeExecution: { select: { tradeDate: true, importId: true } },
        },
      }),
      prisma.manualAdjustment.findMany({
        where: manualAdjustmentWhere,
        include: { account: { select: { accountId: true } } },
      }),
      prisma.matchedLot.aggregate({ where: accountScope, _sum: { realizedPnl: true } }),
      prisma.cashEvent.aggregate({ where: accountScope, _sum: { amount: true } }),
    ]);

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

    const equityPositions = openPositions.filter((position) => position.assetClass === "EQUITY");
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

    let totalMarkedValue = 0;
    const pricedPositions: PositionSnapshotOpenPosition[] = openPositions.map((position) => {
      let mark: number | null = null;

      if (position.assetClass === "EQUITY") {
        mark = equityQuotes?.[position.symbol]?.mark ?? null;
      } else if (position.assetClass === "OPTION") {
        mark = optionQuotes.get(position.instrumentKey) ?? null;
      }

      if (mark !== null) {
        totalMarkedValue += mark * position.netQty * (position.assetClass === "OPTION" ? 100 : 1);
      }

      return {
        ...position,
        mark,
      };
    });

    const totalCostBasis = openPositions.reduce((sum, position) => sum + position.costBasis, 0);
    const unrealizedPnl = totalMarkedValue - totalCostBasis;
    const startingCapitalSummary = await getStartingCapitalSummary(accountIds);
    const startingCapital = startingCapitalSummary.total;
    const balanceContext = await loadAccountBalanceContext(accountIds);
    const accountExternalIdByInternal = new Map(accountRows.map((row) => [row.id, row.accountId]));
    const markedValueByAccount = new Map<string, number>();
    for (const position of pricedPositions) {
      if (typeof position.mark !== "number") {
        continue;
      }

      const currentValue = markedValueByAccount.get(position.accountId) ?? 0;
      markedValueByAccount.set(
        position.accountId,
        currentValue + position.mark * position.netQty * (position.assetClass === "OPTION" ? 100 : 1),
      );
    }

    let currentNlv = 0;
    for (const accountId of accountIds) {
      const accountExternalId = accountExternalIdByInternal.get(accountId);
      const accountBalance = balanceContext.find((entry) => entry.accountExternalId === accountExternalId);
      const markedValue = markedValueByAccount.get(accountId) ?? 0;
      currentNlv += accountBalance?.brokerNetLiquidationValue ?? (accountBalance?.cash ?? 0) + markedValue;
    }

    const realizedPnl = toMoneyNumber(realizedAggregate._sum.realizedPnl);
    const cashAdjustments = toMoneyNumber(cashAggregate._sum.amount);
    const manualAdjustmentsTotal = sumManualAdjustmentAmounts(manualAdjustments);
    const totalGain = currentNlv - startingCapital;
    const unexplainedDelta = totalGain - unrealizedPnl - cashAdjustments - realizedPnl - manualAdjustmentsTotal;

    await prisma.positionSnapshot.update({
      where: { id: snapshotId },
      data: {
        status: "COMPLETE",
        positionsJson: JSON.stringify(pricedPositions),
        unrealizedPnl: toMoneyDecimal(unrealizedPnl),
        realizedPnl: toMoneyDecimal(realizedPnl),
        cashAdjustments: toMoneyDecimal(cashAdjustments),
        manualAdjustments: toMoneyDecimal(manualAdjustmentsTotal),
        currentNlv: toMoneyDecimal(currentNlv),
        startingCapital: toMoneyDecimal(startingCapital),
        totalGain: toMoneyDecimal(totalGain),
        unexplainedDelta: toMoneyDecimal(unexplainedDelta),
        errorMessage: null,
      },
    });

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
        errorMessage,
      },
    });

    detailLog(snapshotId, "failed", startedAtMs, { errorMessage });
  }
}

export async function POST(request: Request) {
  let parsedBody: SnapshotComputeRequestBody = {};

  try {
    const rawBody = (await request.json().catch(() => ({}))) as unknown;
    const body = parseBody(rawBody);
    if (body === null) {
      return errorResponse("INVALID_BODY", "Unable to parse snapshot compute request.", [
        "Expected body shape: { accountIds?: string[] }.",
      ]);
    }
    parsedBody = body;
  } catch {
    return errorResponse("INVALID_BODY", "Unable to parse snapshot compute request.", [
      "Expected body shape: { accountIds?: string[] }.",
    ]);
  }

  const requestedAccountIds = normalizePositionSnapshotAccountIds(parsedBody.accountIds ?? []);
  const accountIds = await resolvePositionSnapshotAccountIds(requestedAccountIds);
  const accountIdsJson = serializePositionSnapshotAccountIds(accountIds);

  const snapshot = await prisma.positionSnapshot.create({
    data: {
      accountIds: accountIdsJson,
      status: "PENDING",
      positionsJson: "[]",
    },
    select: { id: true, status: true },
  });

  void computeSnapshot(snapshot.id, accountIds);

  const payload: PositionSnapshotComputeResponse = {
    snapshotId: snapshot.id,
    status: snapshot.status,
  };

  return detailResponse(payload);
}
