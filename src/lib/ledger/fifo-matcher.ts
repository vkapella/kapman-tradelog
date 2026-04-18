import { randomUUID } from "node:crypto";

export interface LedgerWarning {
  code: string;
  message: string;
  rowRef?: string;
}

export interface LedgerExecution {
  id: string;
  importId: string;
  accountId: string;
  broker: "SCHWAB_THINKORSWIM" | "FIDELITY";
  eventTimestamp: Date;
  tradeDate: Date;
  eventType: "TRADE" | "ASSIGNMENT" | "EXERCISE";
  assetClass: "EQUITY" | "OPTION" | "CASH" | "OTHER";
  symbol: string;
  underlyingSymbol: string | null;
  instrumentKey: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number | null;
  openingClosingEffect: "TO_OPEN" | "TO_CLOSE" | "UNKNOWN";
  expirationDate: Date | null;
  optionType: string | null;
  strike: number | null;
}

export interface MatchedLotCandidate {
  accountId: string;
  openExecutionId: string;
  closeExecutionId: string;
  quantity: number;
  realizedPnl: number;
  holdingDays: number;
  outcome: string;
  washSaleFlagged: boolean;
}

export interface SyntheticExecutionCandidate {
  id: string;
  accountId: string;
  importId: string;
  broker: "SCHWAB_THINKORSWIM" | "FIDELITY";
  eventTimestamp: Date;
  tradeDate: Date;
  eventType: "EXPIRATION_INFERRED";
  assetClass: "OPTION";
  symbol: string;
  underlyingSymbol: string | null;
  instrumentKey: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  openingClosingEffect: "TO_CLOSE";
  expirationDate: Date;
  optionType: string | null;
  strike: number | null;
  sourceRowRef: string;
}

export interface FifoMatchResult {
  matchedLots: MatchedLotCandidate[];
  syntheticExecutions: SyntheticExecutionCandidate[];
  warnings: LedgerWarning[];
}

interface OpenLot {
  execution: LedgerExecution;
  remainingQty: number;
}

const FIDELITY_COMPACT_OPTION_SYMBOL_REGEX = /^-([A-Z]{1,6})\d{6}[CP]\d+(?:\.\d+)?$/;

function normalizeUnderlyingSymbol(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/^-/, "");
  return normalized || null;
}

function deriveUnderlyingSymbol(execution: Pick<LedgerExecution, "underlyingSymbol" | "instrumentKey" | "symbol">): string | null {
  const explicit = normalizeUnderlyingSymbol(execution.underlyingSymbol);
  if (explicit) {
    return explicit;
  }

  const [fromInstrumentKey = ""] = execution.instrumentKey.split("|");
  const instrumentUnderlying = normalizeUnderlyingSymbol(fromInstrumentKey);
  if (instrumentUnderlying && instrumentUnderlying !== "NA") {
    return instrumentUnderlying;
  }

  const compactOptionMatch = execution.symbol.match(FIDELITY_COMPACT_OPTION_SYMBOL_REGEX);
  if (compactOptionMatch?.[1]) {
    return compactOptionMatch[1];
  }

  return normalizeUnderlyingSymbol(execution.symbol);
}

function computePnl(open: LedgerExecution, close: { side: "BUY" | "SELL"; price: number | null }, quantity: number): number {
  const openPrice = open.price ?? 0;
  const closePrice = close.price ?? 0;
  const multiplier = open.assetClass === "OPTION" ? 100 : 1;

  if (open.side === "BUY" && close.side === "SELL") {
    return (closePrice - openPrice) * quantity * multiplier;
  }

  if (open.side === "SELL" && close.side === "BUY") {
    return (openPrice - closePrice) * quantity * multiplier;
  }

  return 0;
}

function computeHoldingDays(openDate: Date, closeDate: Date): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.round((closeDate.getTime() - openDate.getTime()) / millisecondsPerDay));
}

function matchesCloseSide(openSide: "BUY" | "SELL", closeSide: "BUY" | "SELL"): boolean {
  return (openSide === "BUY" && closeSide === "SELL") || (openSide === "SELL" && closeSide === "BUY");
}

function computeOutcome(realizedPnl: number): string {
  if (realizedPnl > 0) {
    return "WIN";
  }
  if (realizedPnl < 0) {
    return "LOSS";
  }
  return "FLAT";
}

function isCloseExecution(execution: LedgerExecution): boolean {
  if (execution.openingClosingEffect === "TO_CLOSE") {
    return true;
  }

  return execution.eventType === "ASSIGNMENT" || execution.eventType === "EXERCISE";
}

function shouldTreatUnknownEquityAsClose(execution: LedgerExecution, openLots: OpenLot[]): boolean {
  if (execution.openingClosingEffect !== "UNKNOWN" || execution.assetClass !== "EQUITY") {
    return false;
  }

  return openLots.some((openLot) => matchesCloseSide(openLot.execution.side, execution.side));
}

function effectiveClosePrice(execution: LedgerExecution): number | null {
  if (execution.price !== null) {
    return execution.price;
  }

  if ((execution.eventType === "ASSIGNMENT" || execution.eventType === "EXERCISE") && execution.strike !== null) {
    return execution.strike;
  }

  return null;
}

function sameTimestampExecutionPriority(execution: LedgerExecution): number {
  if (execution.openingClosingEffect === "TO_OPEN") {
    return 0;
  }

  if (isCloseExecution(execution)) {
    return 2;
  }

  return 1;
}

function applyWashSaleFlag(
  matchedLots: MatchedLotCandidate[],
  executions: LedgerExecution[],
  warnings: LedgerWarning[],
) {
  for (const lot of matchedLots) {
    if (lot.realizedPnl >= 0) {
      continue;
    }

    const closeExecution = executions.find((execution) => execution.id === lot.closeExecutionId);
    const openExecution = executions.find((execution) => execution.id === lot.openExecutionId);
    if (!closeExecution || !openExecution) {
      continue;
    }

    const thirtyDaysLater = new Date(closeExecution.tradeDate);
    thirtyDaysLater.setUTCDate(thirtyDaysLater.getUTCDate() + 30);

    const replacementFound = executions.some((execution) => {
      return (
        execution.openingClosingEffect === "TO_OPEN" &&
        execution.instrumentKey === openExecution.instrumentKey &&
        execution.tradeDate > closeExecution.tradeDate &&
        execution.tradeDate <= thirtyDaysLater
      );
    });

    if (replacementFound) {
      lot.washSaleFlagged = true;
      warnings.push({
        code: "WASH_SALE_FLAGGED",
        message: `Potential wash sale for instrument ${openExecution.instrumentKey}.`,
        rowRef: `${lot.openExecutionId}:${lot.closeExecutionId}`,
      });
    }
  }
}

export function runFifoMatcher(executions: LedgerExecution[], asOfDate: Date): FifoMatchResult {
  const sorted = [...executions].sort((a, b) => {
    const timestampDiff = a.eventTimestamp.getTime() - b.eventTimestamp.getTime();
    if (timestampDiff !== 0) {
      return timestampDiff;
    }

    const priorityDiff = sameTimestampExecutionPriority(a) - sameTimestampExecutionPriority(b);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return a.id.localeCompare(b.id);
  });
  const openLotsByInstrument = new Map<string, OpenLot[]>();
  const matchedLots: MatchedLotCandidate[] = [];
  const syntheticExecutions: SyntheticExecutionCandidate[] = [];
  const warnings: LedgerWarning[] = [];

  for (const execution of sorted) {
    const key = execution.instrumentKey;
    const openLots = openLotsByInstrument.get(key) ?? [];
    const unknownEquityActsAsClose = shouldTreatUnknownEquityAsClose(execution, openLots);

    if (
      execution.openingClosingEffect === "TO_OPEN" ||
      (execution.openingClosingEffect === "UNKNOWN" && execution.assetClass === "EQUITY" && !unknownEquityActsAsClose)
    ) {
      openLots.push({ execution, remainingQty: execution.quantity });
      openLotsByInstrument.set(key, openLots);
      continue;
    }

    if (!isCloseExecution(execution) && !unknownEquityActsAsClose) {
      continue;
    }

    let closeRemaining = execution.quantity;
    const closePrice = effectiveClosePrice(execution);

    while (closeRemaining > 0 && openLots.length > 0) {
      const openLot = openLots[0];
      if (!matchesCloseSide(openLot.execution.side, execution.side)) {
        warnings.push({
          code: "SIDE_MISMATCH",
          message: `Close side ${execution.side} did not match open side ${openLot.execution.side} for ${key}.`,
          rowRef: `${openLot.execution.id}:${execution.id}`,
        });
        break;
      }

      const matchedQuantity = Math.min(closeRemaining, openLot.remainingQty);
      const realizedPnl = computePnl(openLot.execution, { side: execution.side, price: closePrice }, matchedQuantity);
      const holdingDays = computeHoldingDays(openLot.execution.tradeDate, execution.tradeDate);

      matchedLots.push({
        accountId: execution.accountId,
        openExecutionId: openLot.execution.id,
        closeExecutionId: execution.id,
        quantity: matchedQuantity,
        realizedPnl,
        holdingDays,
        outcome: computeOutcome(realizedPnl),
        washSaleFlagged: false,
      });

      closeRemaining -= matchedQuantity;
      openLot.remainingQty -= matchedQuantity;

      if (openLot.remainingQty <= 0) {
        openLots.shift();
      }
    }

    if (closeRemaining > 0) {
      warnings.push({
        code: "UNMATCHED_CLOSE_QUANTITY",
        message: `Unmatched close quantity ${closeRemaining} for instrument ${key}.`,
        rowRef: execution.id,
      });
    }

    openLotsByInstrument.set(key, openLots);
  }

  for (const [key, openLots] of Array.from(openLotsByInstrument.entries())) {
    for (const openLot of openLots) {
      if (openLot.execution.assetClass !== "OPTION" || !openLot.execution.expirationDate) {
        continue;
      }

      if (openLot.execution.expirationDate >= asOfDate) {
        continue;
      }

      if (openLot.remainingQty <= 0) {
        continue;
      }

      const syntheticCloseId = randomUUID();
      const syntheticCloseSide = openLot.execution.side === "BUY" ? "SELL" : "BUY";
      const syntheticTimestamp = new Date(openLot.execution.expirationDate);

      syntheticExecutions.push({
        id: syntheticCloseId,
        accountId: openLot.execution.accountId,
        importId: openLot.execution.importId,
        broker: openLot.execution.broker,
        eventTimestamp: syntheticTimestamp,
        tradeDate: syntheticTimestamp,
        eventType: "EXPIRATION_INFERRED",
        assetClass: "OPTION",
        symbol: openLot.execution.symbol,
        underlyingSymbol: deriveUnderlyingSymbol(openLot.execution),
        instrumentKey: openLot.execution.instrumentKey,
        side: syntheticCloseSide,
        quantity: openLot.remainingQty,
        price: 0,
        openingClosingEffect: "TO_CLOSE",
        expirationDate: openLot.execution.expirationDate,
        optionType: openLot.execution.optionType,
        strike: openLot.execution.strike,
        sourceRowRef: `synthetic-expiration-${openLot.execution.id}`,
      });

      const realizedPnl = computePnl(openLot.execution, { side: syntheticCloseSide, price: 0 }, openLot.remainingQty);
      const holdingDays = computeHoldingDays(openLot.execution.tradeDate, syntheticTimestamp);

      matchedLots.push({
        accountId: openLot.execution.accountId,
        openExecutionId: openLot.execution.id,
        closeExecutionId: syntheticCloseId,
        quantity: openLot.remainingQty,
        realizedPnl,
        holdingDays,
        outcome: computeOutcome(realizedPnl),
        washSaleFlagged: false,
      });

      warnings.push({
        code: "SYNTHETIC_EXPIRATION_INFERRED",
        message: `Synthetic expiration close created for ${key} quantity ${openLot.remainingQty}.`,
        rowRef: openLot.execution.id,
      });
    }
  }

  applyWashSaleFlag(matchedLots, sorted, warnings);

  return {
    matchedLots,
    syntheticExecutions,
    warnings,
  };
}
