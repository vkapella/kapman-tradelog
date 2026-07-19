import { Prisma } from "@prisma/client";
import { buildAccountScopeWhere, parseAccountIds, parseDateRangeParams } from "@/lib/api/account-scope";
import { buildMatchedLotOpenDateWhere } from "@/lib/api/strategy-date-range";
import { listResponse, parsePagination } from "@/lib/api/responses";
import { resolveMatchedLotPriceBasis } from "@/lib/analysis/matched-lot-price-basis";
import { prisma } from "@/lib/db/prisma";
import type { LotExcursionRecord } from "@/types/api";

function dateOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function decimalString(value: Prisma.Decimal | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toString();
}

function realizedReturnPct(input: {
  realizedPnl: Prisma.Decimal;
  quantity: Prisma.Decimal;
  entryPrice: number | null;
  assetClass: string;
  multiplier: number | null;
}): string | null {
  if (input.entryPrice === null) {
    return null;
  }

  const multiplier = input.multiplier ?? (input.assetClass === "OPTION" ? 100 : 1);
  const costBasis = Math.abs(input.entryPrice * Math.abs(Number(input.quantity)) * multiplier);
  if (costBasis === 0) {
    return null;
  }

  return (Number(input.realizedPnl) / costBasis).toFixed(6);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const accountIds = parseAccountIds(url.searchParams.get("accountIds"));
  const symbol = url.searchParams.get("symbol") ?? undefined;
  const setupId = url.searchParams.get("setupId") ?? undefined;
  const { startDate, endDate } = parseDateRangeParams(url.searchParams);
  const accountScope = buildAccountScopeWhere(accountIds);

  const andClauses: Prisma.MatchedLotWhereInput[] = [
    { excursion: { isNot: null } },
  ];

  if (accountScope) {
    andClauses.push(accountScope as Prisma.MatchedLotWhereInput);
  }

  if (symbol) {
    andClauses.push({
      OR: [
        { openExecution: { symbol: { equals: symbol, mode: "insensitive" } } },
        { openExecution: { underlyingSymbol: { equals: symbol, mode: "insensitive" } } },
      ],
    });
  }

  if (setupId) {
    andClauses.push({
      setupGroupLots: {
        some: {
          setupGroupId: setupId,
        },
      },
    });
  }

  const strategyDateWhere = buildMatchedLotOpenDateWhere({ startDate, endDate });
  if (strategyDateWhere) {
    andClauses.push(strategyDateWhere);
  }

  const where: Prisma.MatchedLotWhereInput = { AND: andClauses };

  const [total, rows] = await Promise.all([
    prisma.matchedLot.count({ where }),
    prisma.matchedLot.findMany({
      where,
      include: {
        excursion: true,
        openExecution: true,
        closeExecution: true,
        setupGroupLots: {
          include: {
            setupGroup: true,
          },
        },
      },
      orderBy: [{ closeExecution: { tradeDate: "desc" } }, { createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const data: LotExcursionRecord[] = rows
    .filter((row) => row.excursion !== null)
    .map((row) => {
      const setup = row.setupGroupLots[0]?.setupGroup ?? null;
      const direction = row.openExecution.side === "SELL" ? "SHORT" : "LONG";
      const priceBasis = resolveMatchedLotPriceBasis({
        direction,
        assetClass: row.openExecution.assetClass,
        quantity: Number(row.quantity),
        realizedPnl: Number(row.realizedPnl),
        persistedEntryPrice: row.openExecution.price === null ? null : Number(row.openExecution.price),
        persistedClosePrice: row.closeExecution?.price === null || row.closeExecution?.price === undefined
          ? null
          : Number(row.closeExecution.price),
        closeEventType: row.closeExecution?.eventType ?? null,
        closeStrike: row.closeExecution?.strike === null || row.closeExecution?.strike === undefined
          ? null
          : Number(row.closeExecution.strike),
        multiplier: row.openExecution.multiplier,
        isClosed: row.closeExecution !== null,
      });
      return {
        id: row.excursion?.id ?? "",
        matchedLotId: row.id,
        accountId: row.accountId,
        symbol: row.openExecution.symbol,
        underlyingSymbol: row.openExecution.underlyingSymbol,
        setupId: setup?.id ?? null,
        setupTag: setup ? setup.overrideTag ?? setup.tag : null,
        openTradeDate: row.openExecution.tradeDate.toISOString(),
        closeTradeDate: row.closeExecution?.tradeDate.toISOString() ?? null,
        quantity: row.quantity.toString(),
        realizedPnl: row.realizedPnl.toString(),
        realizedReturnPct: realizedReturnPct({
          realizedPnl: row.realizedPnl,
          quantity: row.quantity,
          entryPrice: priceBasis.entryPrice,
          assetClass: row.openExecution.assetClass,
          multiplier: row.openExecution.multiplier,
        }),
        mfe: decimalString(row.excursion?.mfe) ?? "0",
        mae: decimalString(row.excursion?.mae) ?? "0",
        mfePct: decimalString(row.excursion?.mfePct),
        maePct: decimalString(row.excursion?.maePct),
        mfeDate: dateOnly(row.excursion?.mfeDate),
        maeDate: dateOnly(row.excursion?.maeDate),
        pricedDays: row.excursion?.pricedDays ?? 0,
        unpricedDays: row.excursion?.unpricedDays ?? 0,
        computedAt: row.excursion?.computedAt.toISOString() ?? new Date(0).toISOString(),
      };
    });

  return listResponse(data, { total, page, pageSize });
}
