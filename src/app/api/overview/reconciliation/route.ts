import { Prisma } from "@prisma/client";
import { buildAccountScopeWhere, parseAccountIds } from "@/lib/api/account-scope";
import { detailResponse } from "@/lib/api/responses";
import { parsePayloadByType } from "@/lib/adjustments/types";
import { prisma } from "@/lib/db/prisma";
import { getEquityQuotes, getOptionQuote } from "@/lib/mcp/market-data";
import { computeOpenPositions } from "@/lib/positions/compute-open-positions";
import type { ExecutionRecord, ManualAdjustmentRecord, MatchedLotRecord, OpenPosition, ReconciliationResponse } from "@/types/api";

function toMoneyString(value: number): string {
  return value.toFixed(2);
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
      // Skip malformed adjustment payloads rather than failing reconciliation.
    }
  }

  return records;
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

async function computeUnrealizedPnl(positions: OpenPosition[]): Promise<number> {
  if (positions.length === 0) {
    return 0;
  }

  const totalCostBasis = positions.reduce((sum, position) => sum + position.costBasis, 0);
  const equities = positions.filter((position) => position.assetClass === "EQUITY");
  const options = positions.filter((position) => position.assetClass === "OPTION");
  let markValue = 0;

  if (equities.length > 0) {
    const symbols = Array.from(new Set(equities.map((position) => position.symbol)));
    const quotes = await getEquityQuotes(symbols);
    if (quotes === null) {
      return 0;
    }

    for (const position of equities) {
      const quote = quotes[position.symbol];
      if (!quote) {
        return 0;
      }

      markValue += quote.mark * position.netQty;
    }
  }

  for (const position of options) {
    const expDate = position.expirationDate?.slice(0, 10);
    const strike = Number(position.strike);
    if (!position.optionType || !expDate || !Number.isFinite(strike)) {
      continue;
    }

    const quote = await getOptionQuote(position.underlyingSymbol, strike, expDate, position.optionType);
    if (!quote) {
      return 0;
    }

    markValue += quote.mark * 100 * position.netQty;
  }

  return markValue - totalCostBasis;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const accountIds = parseAccountIds(url.searchParams.get("accountIds"));
  const accountScope = buildAccountScopeWhere(accountIds);
  const executionScope = accountScope as Prisma.ExecutionWhereInput | undefined;
  const matchedLotScope = accountScope as Prisma.MatchedLotWhereInput | undefined;
  const snapshotScope = accountScope as Prisma.DailyAccountSnapshotWhereInput | undefined;
  const cashEventScope = accountScope as Prisma.CashEventWhereInput | undefined;

  const manualAdjustmentWhere: Prisma.ManualAdjustmentWhereInput = {
    AND: [{ status: "ACTIVE" }, ...(accountScope ? [accountScope as Prisma.ManualAdjustmentWhereInput] : [])],
  };

  const [executionRows, matchedLotRows, adjustmentRows, nlvRows, realizedAggregate, cashAggregate] = await Promise.all([
    prisma.execution.findMany({
      where: executionScope,
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
      where: matchedLotScope,
      include: {
        openExecution: { select: { tradeDate: true, importId: true, symbol: true } },
        closeExecution: { select: { tradeDate: true, importId: true } },
      },
    }),
    prisma.manualAdjustment.findMany({
      where: manualAdjustmentWhere,
      include: { account: { select: { accountId: true } } },
    }),
    prisma.dailyAccountSnapshot.findMany({
      where: {
        AND: [{ brokerNetLiquidationValue: { not: null } }, ...(snapshotScope ? [snapshotScope] : [])],
      },
      select: { accountId: true, brokerNetLiquidationValue: true, snapshotDate: true, id: true },
      orderBy: [{ accountId: "asc" }, { snapshotDate: "desc" }, { id: "desc" }],
    }),
    prisma.matchedLot.aggregate({ where: matchedLotScope, _sum: { realizedPnl: true } }),
    prisma.cashEvent.aggregate({ where: cashEventScope, _sum: { amount: true } }),
  ]);

  const executions = mapExecutionRowsToRecords(executionRows);
  const matchedLots = mapMatchedLotRowsToRecords(matchedLotRows);
  const manualAdjustments = mapAdjustmentRowsToRecords(adjustmentRows);
  const openPositions = computeOpenPositions(executions, matchedLots, manualAdjustments);

  const startingCapitalRaw = process.env.STARTING_CAPITAL?.trim() ?? "";
  const startingCapitalConfigured = startingCapitalRaw.length > 0;
  const parsedStartingCapital = Number(startingCapitalRaw);
  const startingCapital = startingCapitalConfigured && Number.isFinite(parsedStartingCapital) ? parsedStartingCapital : 0;

  const latestNlvByAccount = new Set<string>();
  let currentNlv = 0;
  for (const snapshot of nlvRows) {
    if (latestNlvByAccount.has(snapshot.accountId)) {
      continue;
    }

    latestNlvByAccount.add(snapshot.accountId);
    currentNlv += Number(snapshot.brokerNetLiquidationValue ?? 0);
  }

  const realizedPnl = Number(realizedAggregate._sum.realizedPnl ?? 0);
  const cashAdjustments = Number(cashAggregate._sum.amount ?? 0);
  const unrealizedPnl = await computeUnrealizedPnl(openPositions);
  const manualAdjustmentsTotal = sumManualAdjustmentAmounts(manualAdjustments);
  const totalGain = currentNlv - startingCapital;
  const unexplainedDelta = totalGain - unrealizedPnl - cashAdjustments - realizedPnl - manualAdjustmentsTotal;

  const payload: ReconciliationResponse = {
    startingCapital: toMoneyString(startingCapital),
    startingCapitalConfigured,
    currentNlv: toMoneyString(currentNlv),
    totalGain: toMoneyString(totalGain),
    unrealizedPnl: toMoneyString(unrealizedPnl),
    cashAdjustments: toMoneyString(cashAdjustments),
    realizedPnl: toMoneyString(realizedPnl),
    manualAdjustments: toMoneyString(manualAdjustmentsTotal),
    unexplainedDelta: toMoneyString(unexplainedDelta),
  };

  return detailResponse(payload);
}
