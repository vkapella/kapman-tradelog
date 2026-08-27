import type { Prisma } from "@prisma/client";
import { detailResponse, errorResponse } from "@/lib/api/responses";
import { buildAccountIdWhere, parseAccountIds } from "@/lib/api/account-scope";
import { parsePayloadByType } from "@/lib/adjustments/types";
import { prisma } from "@/lib/db/prisma";
import { getEquityQuotes, getOptionQuotesBatch } from "@/lib/mcp/market-data";
import { computeOpenPositions } from "@/lib/positions/compute-open-positions";
import { normalizePositionSnapshotAccountIds } from "@/lib/positions/position-snapshot";
import { buildPortfolioSnapshot, type PricedOpenPosition } from "@/lib/export/build-portfolio-snapshot";
import { buildExcursionLegs, computeOpenLegExcursions } from "@/lib/analysis/compute-open-leg-excursions";
import type {
  EquityQuoteRecord,
  ExecutionRecord,
  ManualAdjustmentRecord,
  MatchedLotRecord,
} from "@/types/api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedAccountIds = normalizePositionSnapshotAccountIds(parseAccountIds(url.searchParams.get("accountIds")));

  // Fail-closed entity scope (#334). This export is the KB's view of the live
  // book, so a payload that silently mixes entities, environments, or
  // unclassified accounts must never be produced. Only this route fails
  // closed; the analytics routes keep their broad all-accounts defaults.
  if (requestedAccountIds.length === 0) {
    return errorResponse("EXPLICIT_SCOPE_REQUIRED", "KB-facing exports require an explicit account scope.", [
      "Pass ?accountIds=<id[,id...]>. An all-accounts export is never valid for KB ingest.",
    ]);
  }

  const scopedAccounts = await prisma.account.findMany({
    where: buildAccountIdWhere(requestedAccountIds) as Prisma.AccountWhereInput,
    select: {
      id: true,
      accountId: true,
      paperMoney: true,
      legalEntity: { select: { slug: true, legalName: true } },
    },
  });

  const knownTokens = new Set(scopedAccounts.flatMap((account) => [account.id, account.accountId]));
  const unknownTokens = requestedAccountIds.filter((token) => !knownTokens.has(token));
  if (unknownTokens.length > 0) {
    return errorResponse(
      "UNKNOWN_ACCOUNT_IN_SCOPE",
      "Requested account(s) do not exist.",
      unknownTokens.map((token) => `No account matches "${token}"; the scope was not silently narrowed.`),
    );
  }

  const classifiedAccounts = scopedAccounts.filter(
    (account): account is (typeof scopedAccounts)[number] & { legalEntity: { slug: string; legalName: string } } =>
      account.legalEntity !== null,
  );
  if (classifiedAccounts.length !== scopedAccounts.length) {
    return errorResponse(
      "UNCLASSIFIED_ACCOUNT_IN_SCOPE",
      "Scope includes unclassified (quarantined) account(s).",
      scopedAccounts
        .filter((account) => account.legalEntity === null)
        .map((account) => `Account ${account.accountId} has no legal entity; classify it on the Accounts page first.`),
    );
  }

  const entitySlugs = Array.from(new Set(classifiedAccounts.map((account) => account.legalEntity.slug)));
  if (entitySlugs.length > 1) {
    return errorResponse(
      "MIXED_ENTITY_SCOPE",
      "Scope spans more than one legal entity.",
      classifiedAccounts.map((account) => `${account.accountId}: ${account.legalEntity.slug}`),
    );
  }

  const paperFlags = new Set(classifiedAccounts.map((account) => account.paperMoney));
  if (paperFlags.size > 1) {
    return errorResponse(
      "MIXED_ENVIRONMENT_SCOPE",
      "Scope mixes paper and live accounts.",
      classifiedAccounts.map((account) => `${account.accountId}: ${account.paperMoney ? "paper" : "live"}`),
    );
  }

  const legalEntity = classifiedAccounts[0].legalEntity;
  const environment: "LIVE" | "PAPER" = classifiedAccounts[0].paperMoney ? "PAPER" : "LIVE";
  const accountIds = classifiedAccounts.map((account) => account.id);
  const accountScope = { accountId: { in: accountIds } } as const;
  const now = new Date().toISOString();

  const [executionRows, matchedLotRows, adjustmentRows] = await Promise.all([
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
    // Loaded only so computeOpenPositions can net closed quantity out of the open legs; not serialized.
    prisma.matchedLot.findMany({
      where: accountScope,
      include: {
        openExecution: { select: { symbol: true, tradeDate: true, importId: true } },
      },
    }),
    prisma.manualAdjustment.findMany({
      where: { AND: [{ status: "ACTIVE" }, ...(accountScope ? [accountScope] : [])] },
      include: { account: { select: { accountId: true } } },
    }),
  ]);

  const executions: ExecutionRecord[] = executionRows.map((row) => ({
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

  // computeOpenPositions only reads quantity + openExecutionId from matched lots.
  const matchedLotsForCompute: MatchedLotRecord[] = matchedLotRows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    symbol: row.openExecution.symbol,
    openTradeDate: row.openExecution.tradeDate.toISOString(),
    closeTradeDate: null,
    openImportId: row.openExecution.importId,
    closeImportId: null,
    quantity: row.quantity.toString(),
    realizedPnl: row.realizedPnl.toString(),
    holdingDays: row.holdingDays,
    outcome: row.outcome,
    openExecutionId: row.openExecutionId,
    closeExecutionId: row.closeExecutionId,
  }));

  const manualAdjustments: ManualAdjustmentRecord[] = [];
  for (const row of adjustmentRows) {
    try {
      manualAdjustments.push({
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
      // Ignore malformed adjustment payloads in the export.
    }
  }

  const openPositions = computeOpenPositions(executions, matchedLotsForCompute, manualAdjustments);

  const equityPositions = openPositions.filter((position) => position.assetClass === "EQUITY");
  const optionPositions = openPositions.filter(
    (position) => position.assetClass === "OPTION" && position.optionType && position.expirationDate && position.strike,
  );

  const equityQuotePromise: Promise<Record<string, EquityQuoteRecord> | null> =
    equityPositions.length > 0
      ? getEquityQuotes(Array.from(new Set(equityPositions.map((position) => position.symbol))))
      : Promise.resolve(null);

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

  const pricedOpenPositions: PricedOpenPosition[] = openPositions.map((position) => {
    let mark: number | null = null;
    if (position.assetClass === "EQUITY") {
      mark = equityQuotes?.[position.symbol]?.mark ?? null;
    } else if (position.assetClass === "OPTION") {
      mark = optionQuotes.get(position.instrumentKey) ?? null;
    }
    return { ...position, mark };
  });

  const accountExternalIdByInternal = new Map(classifiedAccounts.map((row) => [row.id, row.accountId]));
  const accountExternalIds = classifiedAccounts.map((row) => row.accountId);

  const excursionsByKey = await computeOpenLegExcursions(
    prisma,
    buildExcursionLegs(pricedOpenPositions, executions),
    new Date(now),
  );

  const snapshot = buildPortfolioSnapshot({
    exportedAt: now,
    asOf: now,
    accountExternalIds,
    scope: {
      mode: "EXPLICIT",
      legal_entity: { slug: legalEntity.slug, legal_name: legalEntity.legalName },
      environment,
      account_ids: accountExternalIds,
    },
    accountExternalIdByInternal,
    pricedOpenPositions,
    executions,
    excursionsByKey,
  });

  return detailResponse(snapshot);
}
