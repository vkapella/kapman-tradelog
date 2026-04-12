import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AssetClass, Broker, EventType, OpeningClosingEffect, Side } from "@prisma/client";

export interface LedgerIngestExecution {
  importId: string;
  accountId: string;
  broker: Broker;
  eventTimestamp: Date;
  tradeDate: Date;
  eventType: EventType;
  assetClass: AssetClass;
  symbol: string;
  instrumentKey: string | null;
  side: Side;
  quantity: number;
  price: number | null;
  grossAmount: number | null;
  netAmount: number | null;
  openingClosingEffect: OpeningClosingEffect;
  underlyingSymbol: string | null;
  optionType: string | null;
  strike: number | null;
  expirationDate: Date | null;
  spreadGroupId: string | null;
  brokerRefNumber?: string | null;
  sourceRowRef: string | null;
  rawRowJson: Prisma.JsonObject | Prisma.JsonArray | null;
}

export interface BrokerTxHashInput {
  accountId: string;
  eventTimestamp: Date | string;
  eventType: EventType | `${EventType}`;
  assetClass: AssetClass | `${AssetClass}`;
  instrumentKey: string | null;
  dedupeDiscriminator?: string | null;
  brokerRefNumber?: string | null;
  symbol: string;
  side: Side | "BUY" | "SELL";
  quantity: number | string;
  rawPrice: string | null;
  openingClosingEffect: OpeningClosingEffect | `${OpeningClosingEffect}` | null;
  optionType: string | null;
  strike: number | string | null;
  expirationDate: Date | string | null;
}

export interface IngestExecutionsResult {
  parsed: number;
  inserted: number;
  skipped_duplicate: number;
  failed: number;
  failures: string[];
}

function toPrismaRawRowJson(
  value: Prisma.JsonObject | Prisma.JsonArray | null,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null) {
    return Prisma.DbNull;
  }

  return value as Prisma.InputJsonValue;
}

function normalizeQuantity(quantity: number | string): string {
  const parsed = Number(quantity);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid quantity '${String(quantity)}' for broker_tx_id.`);
  }

  return Math.abs(parsed).toString();
}

function normalizePriceRaw(rawPrice: string | null): string {
  if (rawPrice === null || rawPrice === undefined) {
    return "";
  }

  const normalized = rawPrice.trim();
  if (!normalized) {
    return "";
  }

  const numericCandidate = normalized.replace(/[,$]/g, "");
  const parsed = Number(numericCandidate);
  if (Number.isFinite(parsed)) {
    return parsed.toString();
  }

  return normalized.toUpperCase();
}

function normalizeSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) {
    throw new Error("Empty symbol cannot be hashed for broker_tx_id.");
  }

  return normalized;
}

function normalizeToken(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function normalizeStrike(value: number | string | null): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return String(value).trim().toUpperCase();
  }

  return parsed.toString();
}

function normalizeExpirationDate(value: Date | string | null): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  return new Date(value).toISOString();
}

function normalizeSide(side: string): "BUY" | "SELL" {
  const normalized = side.trim().toUpperCase();
  if (normalized !== "BUY" && normalized !== "SELL") {
    throw new Error(`Unsupported side '${side}' for broker_tx_id.`);
  }

  return normalized;
}

function resolveRawPriceFromExecution(execution: LedgerIngestExecution): string | null {
  if (execution.rawRowJson && typeof execution.rawRowJson === "object" && !Array.isArray(execution.rawRowJson)) {
    const rowPrice = execution.rawRowJson.price;
    if (typeof rowPrice === "string") {
      return rowPrice;
    }
  }

  if (execution.price === null || execution.price === undefined) {
    return null;
  }

  return execution.price.toString();
}

function resolveBrokerReferenceFromExecution(execution: LedgerIngestExecution): string | null {
  const directRef = execution.brokerRefNumber?.trim();
  if (directRef) {
    return directRef;
  }

  if (execution.rawRowJson && typeof execution.rawRowJson === "object" && !Array.isArray(execution.rawRowJson)) {
    const rowRef = execution.rawRowJson.refNumber;
    if (typeof rowRef === "string" && rowRef.trim()) {
      return rowRef.trim();
    }
  }

  return null;
}

export function computeBrokerTxId(input: BrokerTxHashInput): string {
  const normalizedBrokerRef = normalizeToken(input.brokerRefNumber);
  if (normalizedBrokerRef) {
    const refKeyFields = [
      input.accountId.trim(),
      new Date(input.eventTimestamp).toISOString(),
      normalizeSymbol(input.symbol),
      normalizedBrokerRef,
    ];

    return createHash("sha256").update(refKeyFields.join("|")).digest("hex");
  }

  const canonicalFields = [
    input.accountId.trim(),
    new Date(input.eventTimestamp).toISOString(),
    normalizeToken(input.eventType),
    normalizeToken(input.assetClass),
    normalizeToken(input.instrumentKey),
    normalizeSymbol(input.symbol),
    normalizeSide(input.side),
    normalizeQuantity(input.quantity),
    normalizePriceRaw(input.rawPrice),
    normalizeToken(input.openingClosingEffect),
    normalizeToken(input.optionType),
    normalizeStrike(input.strike),
    normalizeExpirationDate(input.expirationDate),
    normalizeToken(input.dedupeDiscriminator),
  ];

  return createHash("sha256").update(canonicalFields.join("|")).digest("hex");
}

export async function ingestExecutions(
  tx: Prisma.TransactionClient,
  executions: LedgerIngestExecution[],
): Promise<IngestExecutionsResult> {
  const result: IngestExecutionsResult = {
    parsed: executions.length,
    inserted: 0,
    skipped_duplicate: 0,
    failed: 0,
    failures: [],
  };

  for (const execution of executions) {
    try {
      const brokerTxId = computeBrokerTxId({
        accountId: execution.accountId,
        eventTimestamp: execution.eventTimestamp,
        eventType: execution.eventType,
        assetClass: execution.assetClass,
        instrumentKey: execution.instrumentKey,
        brokerRefNumber: resolveBrokerReferenceFromExecution(execution),
        symbol: execution.symbol,
        side: execution.side,
        quantity: execution.quantity,
        rawPrice: resolveRawPriceFromExecution(execution),
        openingClosingEffect: execution.openingClosingEffect,
        optionType: execution.optionType,
        strike: execution.strike,
        expirationDate: execution.expirationDate,
      });

      const existing = await tx.execution.findFirst({
        where: {
          accountId: execution.accountId,
          brokerTxId,
        },
        select: { id: true },
      });

      if (existing) {
        result.skipped_duplicate += 1;
        continue;
      }

      await tx.execution.create({
        data: {
          importId: execution.importId,
          accountId: execution.accountId,
          broker: execution.broker,
          eventTimestamp: execution.eventTimestamp,
          tradeDate: execution.tradeDate,
          eventType: execution.eventType,
          assetClass: execution.assetClass,
          symbol: execution.symbol,
          brokerTxId,
          instrumentKey: execution.instrumentKey,
          side: execution.side,
          quantity: execution.quantity,
          price: execution.price,
          grossAmount: execution.grossAmount,
          netAmount: execution.netAmount,
          openingClosingEffect: execution.openingClosingEffect,
          underlyingSymbol: execution.underlyingSymbol,
          optionType: execution.optionType,
          strike: execution.strike,
          expirationDate: execution.expirationDate,
          spreadGroupId: execution.spreadGroupId,
          sourceRowRef: execution.sourceRowRef,
          rawRowJson: toPrismaRawRowJson(execution.rawRowJson),
        },
      });
      result.inserted += 1;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        result.skipped_duplicate += 1;
        continue;
      }

      result.failed += 1;
      result.failures.push(error instanceof Error ? error.message : "Unknown ingest failure");
    }
  }

  return result;
}
