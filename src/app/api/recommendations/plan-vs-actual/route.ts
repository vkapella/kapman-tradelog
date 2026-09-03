import { errorResponse, listResponse } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import {
  matchRecommendationToExecutions,
  type PlanExecRow,
  type PlanRecRow,
} from "@/lib/recommendations/plan-vs-actual";

export const dynamic = "force-dynamic";

const DEFAULT_WINDOW_DAYS = 5;
const MAX_WINDOW_DAYS = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const windowDaysParam = url.searchParams.get("windowDays");
  const windowDays = windowDaysParam === null ? DEFAULT_WINDOW_DAYS : Number(windowDaysParam);
  if (!Number.isFinite(windowDays) || windowDays < 0 || windowDays > MAX_WINDOW_DAYS) {
    return errorResponse("INVALID_WINDOW", `windowDays must be a number between 0 and ${MAX_WINDOW_DAYS}`, []);
  }
  const includeFlagged = url.searchParams.get("includeFlagged") === "true";
  const lineageId = url.searchParams.get("lineageId") ?? undefined;
  const runId = url.searchParams.get("runId") ?? undefined;
  const ticker = url.searchParams.get("ticker") ?? undefined;

  const recRows = await prisma.tradeRecommendation.findMany({
    where: {
      pass: "PASS2",
      disposition: includeFlagged ? { in: ["VALIDATED", "FLAGGED"] } : "VALIDATED",
      ...(lineageId ? { lineageId } : {}),
      ...(runId ? { runId } : {}),
      ...(ticker ? { ticker: ticker.toUpperCase() } : {}),
    },
    include: { legalEntity: { select: { slug: true } } },
    orderBy: [{ asOf: "desc" }, { recId: "asc" }],
  });

  if (recRows.length === 0) {
    return listResponse([], { page: 1, pageSize: 0, total: 0 });
  }

  const tickers = Array.from(new Set(recRows.map((rec) => rec.ticker)));
  // Every account's fills are loaded; the matcher restricts a scoped
  // recommendation to its own entity and environment (#349).
  const execRows = await prisma.execution.findMany({
    where: {
      assetClass: "OPTION",
      eventType: "TRADE",
      underlyingSymbol: { in: tickers },
    },
    select: {
      id: true,
      accountId: true,
      account: { select: { legalEntityId: true, paperMoney: true } },
      tradeDate: true,
      underlyingSymbol: true,
      optionType: true,
      strike: true,
      expirationDate: true,
      side: true,
      openingClosingEffect: true,
      quantity: true,
      price: true,
    },
  });

  const executions: PlanExecRow[] = execRows.map((exec) => ({
    id: exec.id,
    accountId: exec.accountId,
    accountLegalEntityId: exec.account.legalEntityId,
    accountPaperMoney: exec.account.paperMoney,
    tradeDate: exec.tradeDate,
    underlyingSymbol: exec.underlyingSymbol,
    optionType: exec.optionType ? exec.optionType.toUpperCase() : null,
    strike: exec.strike === null ? null : exec.strike.toNumber(),
    expirationDate: exec.expirationDate,
    side: exec.side,
    openingClosingEffect: exec.openingClosingEffect,
    quantity: exec.quantity.toNumber(),
    price: exec.price === null ? null : exec.price.toNumber(),
  }));

  const results = recRows.map((rec) => {
    const planRec: PlanRecRow = {
      recId: rec.recId,
      ticker: rec.ticker,
      structure: rec.structure,
      disposition: rec.disposition,
      asOf: rec.asOf,
      legalEntityId: rec.legalEntityId,
      legalEntitySlug: rec.legalEntity?.slug ?? null,
      environment: rec.environment,
      optionType: rec.optionType,
      strike: rec.strike === null ? null : rec.strike.toNumber(),
      strikeShort: rec.strikeShort === null ? null : rec.strikeShort.toNumber(),
      expirationDate: rec.expirationDate,
      entryRangeLow: rec.entryRangeLow === null ? null : rec.entryRangeLow.toNumber(),
      entryRangeHigh: rec.entryRangeHigh === null ? null : rec.entryRangeHigh.toNumber(),
      sizingBand: rec.sizingBand,
    };
    return matchRecommendationToExecutions(planRec, executions, windowDays);
  });

  return listResponse(results, { page: 1, pageSize: results.length, total: results.length });
}
