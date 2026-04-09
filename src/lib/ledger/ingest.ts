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
  sourceRowRef: string | null;
  rawRowJson: Prisma.JsonObject | Prisma.JsonArray | null;
}

export interface BrokerTxHashInput {
  accountId: string;
  eventTimestamp: Date | string;
  symbol: string;
  side: Side | "BUY" | "SELL";
  quantity: number | string;
  rawPrice: string | null;
  spreadGroupId: string | null;
  sourceRowRef: string | null;
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

export function computeBrokerTxId(input: BrokerTxHashInput): string {
  const canonicalFields = [
    input.accountId.trim(),
    new Date(input.eventTimestamp).toISOString(),
    normalizeSymbol(input.symbol),
    normalizeSide(input.side),
    normalizeQuantity(input.quantity),
    normalizePriceRaw(input.rawPrice),
    input.spreadGroupId?.trim() ?? "",
    input.sourceRowRef?.trim() ?? "",
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
        symbol: execution.symbol,
        side: execution.side,
        quantity: execution.quantity,
        rawPrice: resolveRawPriceFromExecution(execution),
        spreadGroupId: execution.spreadGroupId,
        sourceRowRef: execution.sourceRowRef,
      });

      const existing = await tx.execution.findFirst({
        where: {
          accountId: execution.accountId,
          brokerTxId,
        },
        select: { id: true },
      });

      if (existing) {
        await tx.execution.update({
          where: { id: existing.id },
          data: {
            importId: execution.importId,
            rawRowJson: toPrismaRawRowJson(execution.rawRowJson),
          },
        });
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
      result.failed += 1;
      result.failures.push(error instanceof Error ? error.message : "Unknown ingest failure");
    }
  }

  return result;
}
