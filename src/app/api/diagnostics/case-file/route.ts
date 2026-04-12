import { Prisma } from "@prisma/client";
import { detailResponse, errorResponse } from "@/lib/api/responses";
import {
  buildExecutionCaseFile,
  buildMatchedLotCaseFile,
  buildSetupCaseFile,
  buildSetupInferenceCaseFile,
} from "@/lib/diagnostics/case-file";
import { prisma } from "@/lib/db/prisma";
import type {
  DiagnosticCaseFileResponse,
  ExecutionRecord,
  MatchedLotRecord,
  SetupSummaryRecord,
} from "@/types/api";

function mapExecution(row: {
  id: string;
  accountId: string;
  broker: string;
  symbol: string;
  tradeDate: Date;
  eventTimestamp: Date;
  eventType: string;
  assetClass: string;
  side: string | null;
  quantity: Prisma.Decimal;
  price: Prisma.Decimal | null;
  openingClosingEffect: string | null;
  instrumentKey: string | null;
  underlyingSymbol: string | null;
  optionType: string | null;
  strike: Prisma.Decimal | null;
  expirationDate: Date | null;
  spreadGroupId: string | null;
  importId: string;
}): ExecutionRecord {
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
    instrumentKey: row.instrumentKey,
    underlyingSymbol: row.underlyingSymbol,
    optionType: row.optionType,
    strike: row.strike?.toString() ?? null,
    expirationDate: row.expirationDate?.toISOString() ?? null,
    spreadGroupId: row.spreadGroupId,
    importId: row.importId,
  };
}

function mapMatchedLot(row: {
  id: string;
  accountId: string;
  quantity: Prisma.Decimal;
  realizedPnl: Prisma.Decimal;
  holdingDays: number;
  outcome: string;
  openExecutionId: string;
  closeExecutionId: string | null;
  openExecution: { symbol: string; underlyingSymbol: string | null; tradeDate: Date; importId: string };
  closeExecution: { tradeDate: Date; importId: string } | null;
}): MatchedLotRecord {
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

function mapSetup(row: {
  id: string;
  accountId: string;
  tag: string;
  overrideTag: string | null;
  underlyingSymbol: string;
  realizedPnl: Prisma.Decimal | null;
  winRate: Prisma.Decimal | null;
  expectancy: Prisma.Decimal | null;
  averageHoldDays: Prisma.Decimal | null;
}): SetupSummaryRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    tag: row.tag,
    overrideTag: row.overrideTag,
    underlyingSymbol: row.underlyingSymbol,
    realizedPnl: row.realizedPnl?.toString() ?? null,
    winRate: row.winRate?.toString() ?? null,
    expectancy: row.expectancy?.toString() ?? null,
    averageHoldDays: row.averageHoldDays?.toString() ?? null,
  };
}

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  return Array.from(new Map(rows.map((row) => [row.id, row])).values());
}

function getRawAction(rawRowJson: unknown): string | null {
  if (!rawRowJson || typeof rawRowJson !== "object" || Array.isArray(rawRowJson)) {
    return null;
  }

  if ("rawAction" in rawRowJson && rawRowJson.rawAction !== null && rawRowJson.rawAction !== undefined) {
    return String(rawRowJson.rawAction);
  }
  if ("action" in rawRowJson && rawRowJson.action !== null && rawRowJson.action !== undefined) {
    return String(rawRowJson.action);
  }

  return null;
}

function buildGenericSetupReasons(setup: SetupSummaryRecord, lotCount: number): string[] {
  return [
    `Current setup tag is ${setup.overrideTag ?? setup.tag}.`,
    `This setup currently contains ${lotCount} matched lot(s).`,
  ];
}

function overlapsAt(referenceDate: Date, input: { openTradeDate: Date; closeTradeDate: Date | null }): boolean {
  if (input.openTradeDate > referenceDate) {
    return false;
  }

  if (!input.closeTradeDate) {
    return true;
  }

  return input.closeTradeDate >= referenceDate;
}

async function loadSetupRecordsForLots(matchedLotIds: string[]): Promise<SetupSummaryRecord[]> {
  if (matchedLotIds.length === 0) {
    return [];
  }

  const rows = await prisma.setupGroup.findMany({
    where: {
      lots: {
        some: {
          matchedLotId: {
            in: matchedLotIds,
          },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  return uniqueById(rows.map(mapSetup));
}

async function loadExecutionCaseFile(executionId: string): Promise<DiagnosticCaseFileResponse | null> {
  const execution = await prisma.execution.findUnique({
    where: { id: executionId },
  });
  if (!execution) {
    return null;
  }

  const matchedLots = await prisma.matchedLot.findMany({
    where: {
      OR: [{ openExecutionId: execution.id }, { closeExecutionId: execution.id }],
    },
    include: {
      openExecution: true,
      closeExecution: true,
    },
    orderBy: [{ id: "asc" }],
  });
  const relatedExecutions = uniqueById(
    matchedLots.flatMap((lot) => [mapExecution(lot.openExecution), ...(lot.closeExecution ? [mapExecution(lot.closeExecution)] : [])]),
  );
  const mappedLots = matchedLots.map(mapMatchedLot);
  const setups = await loadSetupRecordsForLots(mappedLots.map((lot) => lot.id));
  const evidence: Array<{ label: string; value: string }> = [
    { label: "Raw symbol", value: execution.symbol },
    { label: "Normalized instrument key", value: execution.instrumentKey ?? "NA" },
    { label: "Side", value: execution.side ?? "NA" },
  ];

  if (execution.eventType === "EXPIRATION_INFERRED") {
    const sourceLot = matchedLots.find((lot) => lot.closeExecutionId === execution.id) ?? null;
    if (sourceLot) {
      evidence.push(
        { label: "Original open execution", value: sourceLot.openExecutionId },
        { label: "Remaining quantity", value: sourceLot.quantity.toString() },
        { label: "Expiration date used", value: execution.expirationDate?.toISOString().slice(0, 10) ?? "NA" },
        { label: "Synthetic close execution", value: execution.id },
        { label: "Matched lot ids", value: matchedLots.map((lot) => lot.id).join(", ") || "NA" },
      );
    }
  }

  return buildExecutionCaseFile({
    execution: mapExecution(execution),
    relatedExecutions,
    matchedLots: mappedLots,
    setups,
    rawAction: getRawAction(execution.rawRowJson),
    evidence,
  });
}

async function loadMatchedLotCaseFile(matchedLotId: string): Promise<DiagnosticCaseFileResponse | null> {
  const matchedLot = await prisma.matchedLot.findUnique({
    where: { id: matchedLotId },
    include: {
      openExecution: true,
      closeExecution: true,
    },
  });
  if (!matchedLot) {
    return null;
  }

  const setups = await loadSetupRecordsForLots([matchedLot.id]);
  const executions = uniqueById(
    [mapExecution(matchedLot.openExecution), ...(matchedLot.closeExecution ? [mapExecution(matchedLot.closeExecution)] : [])],
  );
  const evidence: Array<{ label: string; value: string }> = [
    { label: "Open execution", value: matchedLot.openExecutionId },
    { label: "Close execution", value: matchedLot.closeExecutionId ?? "OPEN" },
    { label: "Outcome", value: matchedLot.outcome },
    { label: "Realized P&L", value: matchedLot.realizedPnl.toString() },
  ];

  if (matchedLot.closeExecution?.eventType === "EXPIRATION_INFERRED") {
    evidence.push({ label: "Synthetic close", value: matchedLot.closeExecution.id });
  }

  return buildMatchedLotCaseFile({
    matchedLot: mapMatchedLot(matchedLot),
    executions,
    setups,
    evidence,
  });
}

async function loadSetupCaseFile(setupId: string): Promise<DiagnosticCaseFileResponse | null> {
  const setupGroup = await prisma.setupGroup.findUnique({
    where: { id: setupId },
    include: {
      lots: {
        include: {
          matchedLot: {
            include: {
              openExecution: true,
              closeExecution: true,
            },
          },
        },
      },
    },
  });
  if (!setupGroup) {
    return null;
  }

  const mappedSetup = mapSetup(setupGroup);
  const lots = setupGroup.lots.map((entry) => mapMatchedLot(entry.matchedLot));
  const executions = uniqueById(
    setupGroup.lots.flatMap((entry) => [
      mapExecution(entry.matchedLot.openExecution),
      ...(entry.matchedLot.closeExecution ? [mapExecution(entry.matchedLot.closeExecution)] : []),
    ]),
  );

  return buildSetupCaseFile({
    setup: mappedSetup,
    matchedLots: lots,
    executions,
    inferenceReasons: buildGenericSetupReasons(mappedSetup, lots.length),
    evidence: [
      { label: "Setup id", value: setupGroup.id },
      { label: "Underlying", value: setupGroup.underlyingSymbol },
      { label: "Matched lots", value: String(lots.length) },
    ],
  });
}

async function loadSetupInferenceCaseFile(searchParams: URLSearchParams): Promise<DiagnosticCaseFileResponse | null> {
  const code = searchParams.get("code");
  const underlyingSymbol = searchParams.get("underlyingSymbol");
  const message = searchParams.get("message") ?? "Setup inference diagnostic.";
  const lotIdsParam = searchParams.get("lotIds");
  if (!code || !underlyingSymbol || !lotIdsParam) {
    return null;
  }

  const lotIds = lotIdsParam
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (lotIds.length === 0) {
    return null;
  }

  const matchedLots = await prisma.matchedLot.findMany({
    where: {
      id: {
        in: lotIds,
      },
    },
    include: {
      openExecution: true,
      closeExecution: true,
    },
    orderBy: [{ id: "asc" }],
  });
  if (matchedLots.length === 0) {
    return null;
  }

  const mappedLots = matchedLots.map(mapMatchedLot);
  const executions = uniqueById(
    matchedLots.flatMap((lot) => [mapExecution(lot.openExecution), ...(lot.closeExecution ? [mapExecution(lot.closeExecution)] : [])]),
  );
  const setups = await loadSetupRecordsForLots(mappedLots.map((lot) => lot.id));
  const evidence: Array<{ label: string; value: string }> = [
    { label: "Diagnostic code", value: code },
    { label: "Affected lots", value: lotIds.join(", ") },
  ];

  if (code === "PAIR_FAIL_NO_OVERLAP_LONG_CALL" || code === "PAIR_FAIL_NO_ELIGIBLE_EXP" || code === "PAIR_FAIL_MISSING_METADATA") {
    const shortCallLot = matchedLots.find(
      (lot) => lot.openExecution.assetClass === "OPTION" && lot.openExecution.optionType === "CALL" && lot.openExecution.side === "SELL",
    );

    if (shortCallLot) {
      const overlappingLongCalls = await prisma.matchedLot.findMany({
        where: {
          accountId: shortCallLot.accountId,
          openExecution: {
            assetClass: "OPTION",
            optionType: "CALL",
            side: "BUY",
            underlyingSymbol,
            tradeDate: {
              lte: shortCallLot.openExecution.tradeDate,
            },
          },
          OR: [{ closeExecution: null }, { closeExecution: { tradeDate: { gte: shortCallLot.openExecution.tradeDate } } }],
        },
        include: {
          openExecution: true,
          closeExecution: true,
        },
      });
      const overlappingIds = overlappingLongCalls
        .filter((lot) =>
          overlapsAt(shortCallLot.openExecution.tradeDate, {
            openTradeDate: lot.openExecution.tradeDate,
            closeTradeDate: lot.closeExecution?.tradeDate ?? null,
          }),
        )
        .map((lot) => lot.id);

      evidence.push(
        { label: "Short call lot", value: shortCallLot.id },
        { label: "Short call execution", value: shortCallLot.openExecutionId },
        { label: "Short call open date", value: shortCallLot.openExecution.tradeDate.toISOString().slice(0, 10) },
        { label: "Overlapping long call anchors", value: String(overlappingIds.length) },
        { label: "Overlapping long call lot ids", value: overlappingIds.join(", ") || "none" },
      );
    }
  }

  return buildSetupInferenceCaseFile({
    code,
    message,
    underlyingSymbol,
    executions,
    matchedLots: mappedLots,
    setups,
    inferenceReasons: [message],
    evidence,
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");

  let payload: DiagnosticCaseFileResponse | null = null;
  if (kind === "execution") {
    const executionId = url.searchParams.get("executionId");
    if (!executionId) {
      return errorResponse("MISSING_EXECUTION_ID", "executionId is required.", ["Provide executionId for execution case files."]);
    }
    payload = await loadExecutionCaseFile(executionId);
  } else if (kind === "matched_lot") {
    const matchedLotId = url.searchParams.get("matchedLotId");
    if (!matchedLotId) {
      return errorResponse("MISSING_MATCHED_LOT_ID", "matchedLotId is required.", ["Provide matchedLotId for matched lot case files."]);
    }
    payload = await loadMatchedLotCaseFile(matchedLotId);
  } else if (kind === "setup") {
    const setupId = url.searchParams.get("setupId");
    if (!setupId) {
      return errorResponse("MISSING_SETUP_ID", "setupId is required.", ["Provide setupId for setup case files."]);
    }
    payload = await loadSetupCaseFile(setupId);
  } else if (kind === "setup_inference") {
    payload = await loadSetupInferenceCaseFile(url.searchParams);
  } else {
    return errorResponse("INVALID_KIND", "Unsupported case file kind.", ["Supported kinds: execution, matched_lot, setup, setup_inference."]);
  }

  if (!payload) {
    return errorResponse("NOT_FOUND", "Diagnostic case file not found.", ["The requested case file could not be resolved from current data."], 404);
  }

  return detailResponse(payload);
}
