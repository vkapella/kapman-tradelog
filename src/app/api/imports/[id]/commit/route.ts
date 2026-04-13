import { Prisma } from "@prisma/client";
import { detailResponse, errorResponse } from "@/lib/api/responses";
import { detectAdapter } from "@/lib/adapters/registry";
import { rebuildAccountSetups } from "@/lib/analytics/rebuild-account-setups";
import { prisma } from "@/lib/db/prisma";
import { replaceImportCashEvents } from "@/lib/imports/replace-import-cash-events";
import { replaceImportExecutions } from "@/lib/imports/replace-import-executions";
import { hydrateFidelityCashSnapshots } from "@/lib/imports/hydrate-fidelity-cash-snapshots";
import { replaceImportSnapshots } from "@/lib/imports/replace-import-snapshots";
import { deriveInstrumentKeyFromNormalizedExecution } from "@/lib/ledger/instrument-key";
import { rebuildAccountLedger } from "@/lib/ledger/rebuild-account-ledger";
import type { CommitImportResponse } from "@/types/api";

function normalizeDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function normalizeNumberKey(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return String(value);
  }

  return parsed.toString();
}

function buildExecutionAmountDedupKey(input: {
  accountId: string;
  executionDate: Date;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number | string;
  amount: number | string | null;
}): string {
  return [
    input.accountId,
    normalizeDateKey(input.executionDate),
    input.symbol.trim().toUpperCase(),
    input.side,
    normalizeNumberKey(input.quantity),
    normalizeNumberKey(input.amount),
  ].join("|");
}

function buildExecutionSignatureDedupKey(input: {
  accountId: string;
  executionDate: Date;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number | string;
  price: number | string | null;
  openingClosingEffect: "TO_OPEN" | "TO_CLOSE" | "UNKNOWN";
}): string {
  return [
    input.accountId,
    normalizeDateKey(input.executionDate),
    input.symbol.trim().toUpperCase(),
    input.side,
    normalizeNumberKey(input.quantity),
    normalizeNumberKey(input.price),
    input.openingClosingEffect,
  ].join("|");
}

function buildExecutionCorrectionDedupKey(input: {
  accountId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number | string;
  price: number | string | null;
  openingClosingEffect: "TO_OPEN" | "TO_CLOSE" | "UNKNOWN";
}): string {
  return [
    input.accountId,
    input.symbol.trim().toUpperCase(),
    input.side,
    normalizeNumberKey(input.quantity),
    normalizeNumberKey(input.price),
    input.openingClosingEffect,
  ].join("|");
}

function buildCashEventDedupKey(input: {
  accountId: string;
  eventDate: Date;
  cashEventType: string;
  symbol: string | null;
  amount: number | string;
}): string {
  const normalizedSymbol = (input.symbol ?? "").trim().toUpperCase() || "NOSYM";
  return [
    input.accountId,
    normalizeDateKey(input.eventDate),
    input.cashEventType.trim().toUpperCase(),
    normalizedSymbol,
    normalizeNumberKey(input.amount),
  ].join("|");
}

export async function POST(request: Request, context: { params: { id: string } }) {
  const importId = context.params.id;

  const existingImport = await prisma.import.findUnique({ where: { id: importId } });
  if (!existingImport) {
    return errorResponse("NOT_FOUND", "Import not found.", [`Import ${importId} does not exist.`], 404);
  }

  if (!existingImport.sourceFileText) {
    return errorResponse("MISSING_SOURCE_FILE", "Import has no source file text to parse.", [
      `Import ${importId} does not contain source_file_text.`,
    ]);
  }

  const matched = detectAdapter({
    name: existingImport.filename,
    content: existingImport.sourceFileText,
    mimeType: "text/csv",
    size: existingImport.sourceFileText.length,
  });

  if (!matched) {
    return errorResponse("UNSUPPORTED_BROKER", "No registered adapter matched this import file.", [
      `Import ${importId} cannot be parsed by the registry.`,
    ]);
  }

  let parsed;
  try {
    parsed = matched.adapter.parse({
      name: existingImport.filename,
      content: existingImport.sourceFileText,
      mimeType: "text/csv",
      size: existingImport.sourceFileText.length,
    });
  } catch (error) {
    await prisma.import.update({
      where: { id: importId },
      data: {
        status: "FAILED",
        persistedRows: 0,
        skippedDuplicateRows: 0,
        failedRows: 0,
        warnings: [{ code: "PARSE_ERROR", message: error instanceof Error ? error.message : "Unknown parse error" }],
      },
    });

    return errorResponse("PARSE_ERROR", "Import parsing failed.", [
      error instanceof Error ? error.message : "Unknown parse error",
    ]);
  }

  const executionData = parsed.executions.map((execution) => ({
    importId: existingImport.id,
    accountId: existingImport.accountId,
    broker: existingImport.broker,
    eventTimestamp: execution.eventTimestamp,
    tradeDate: execution.tradeDate,
    eventType: execution.eventType,
    assetClass: execution.assetClass,
    symbol: execution.symbol,
    instrumentKey: deriveInstrumentKeyFromNormalizedExecution(execution),
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
    brokerRefNumber: execution.brokerRefNumber,
    sourceRowRef: execution.sourceRowRef,
    rawRowJson: execution.rawRowJson,
  }));

  let transactionResult;
  try {
    transactionResult = await prisma.$transaction(async (tx) => {
      let filteredExecutionData = executionData;
      let fidelitySkippedExecutionDuplicates = 0;

      let filteredCashEvents = parsed.cashEvents;
      let fidelitySkippedCashEventDuplicates = 0;

      if (matched.adapter.id === "fidelity") {
        const existingExecutions = await tx.execution.findMany({
          where: {
            accountId: existingImport.accountId,
            importId: {
              not: importId,
            },
          },
          select: {
            tradeDate: true,
            symbol: true,
            side: true,
            quantity: true,
            price: true,
            netAmount: true,
            openingClosingEffect: true,
          },
        });

        const existingExecutionAmountKeys = new Set<string>();
        const existingExecutionSignatureKeys = new Set<string>();
        const existingExecutionCorrectionKeys = new Set<string>();
        for (const row of existingExecutions) {
          if (!row.side) {
            continue;
          }

          existingExecutionAmountKeys.add(
            buildExecutionAmountDedupKey({
              accountId: existingImport.accountId,
              executionDate: row.tradeDate,
              symbol: row.symbol,
              side: row.side,
              quantity: row.quantity.toString(),
              amount: row.netAmount?.toString() ?? null,
            }),
          );
          existingExecutionSignatureKeys.add(
            buildExecutionSignatureDedupKey({
              accountId: existingImport.accountId,
              executionDate: row.tradeDate,
              symbol: row.symbol,
              side: row.side,
              quantity: row.quantity.toString(),
              price: row.price?.toString() ?? null,
              openingClosingEffect: row.openingClosingEffect ?? "UNKNOWN",
            }),
          );
          existingExecutionCorrectionKeys.add(
            buildExecutionCorrectionDedupKey({
              accountId: existingImport.accountId,
              symbol: row.symbol,
              side: row.side,
              quantity: row.quantity.toString(),
              price: row.price?.toString() ?? null,
              openingClosingEffect: row.openingClosingEffect ?? "UNKNOWN",
            }),
          );
        }

        const dedupedExecutions = [];
        for (const row of executionData) {
          const amountKey = buildExecutionAmountDedupKey({
            accountId: existingImport.accountId,
            executionDate: row.tradeDate,
            symbol: row.symbol,
            side: row.side,
            quantity: row.quantity,
            amount: row.netAmount,
          });
          const signatureKey = buildExecutionSignatureDedupKey({
            accountId: existingImport.accountId,
            executionDate: row.tradeDate,
            symbol: row.symbol,
            side: row.side,
            quantity: row.quantity,
            price: row.price,
            openingClosingEffect: row.openingClosingEffect,
          });
          const correctionKey = buildExecutionCorrectionDedupKey({
            accountId: existingImport.accountId,
            symbol: row.symbol,
            side: row.side,
            quantity: row.quantity,
            price: row.price,
            openingClosingEffect: row.openingClosingEffect,
          });
          const isCancelRebookRepresentative = row.rawRowJson?.cancelRebookCode === "CANCEL_REBOOK";
          const duplicate = isCancelRebookRepresentative
            ? existingExecutionSignatureKeys.has(signatureKey) || existingExecutionCorrectionKeys.has(correctionKey)
            : existingExecutionAmountKeys.has(amountKey);

          if (duplicate) {
            fidelitySkippedExecutionDuplicates += 1;
            continue;
          }

          existingExecutionAmountKeys.add(amountKey);
          existingExecutionSignatureKeys.add(signatureKey);
          existingExecutionCorrectionKeys.add(correctionKey);
          dedupedExecutions.push(row);
        }

        filteredExecutionData = dedupedExecutions;

        const existingCashEvents = await tx.cashEvent.findMany({
          where: {
            accountId: existingImport.accountId,
            sourceRef: {
              not: importId,
            },
            refNumber: {
              startsWith: "FIDELITY-",
            },
          },
          select: {
            eventDate: true,
            rowType: true,
            refNumber: true,
            description: true,
            amount: true,
          },
        });

        const existingCashEventKeys = new Set<string>();
        for (const row of existingCashEvents) {
          const match = row.refNumber.match(/\(([A-Z0-9.-]+)\)$/);
          const symbolFromDescription = match ? match[1] : null;
          existingCashEventKeys.add(
            buildCashEventDedupKey({
              accountId: existingImport.accountId,
              eventDate: row.eventDate,
              cashEventType: row.rowType,
              symbol: symbolFromDescription,
              amount: row.amount.toString(),
            }),
          );
        }

        const dedupedCashEvents = [];
        for (const row of parsed.cashEvents) {
          const key = buildCashEventDedupKey({
            accountId: existingImport.accountId,
            eventDate: row.eventDate,
            cashEventType: row.rowType,
            symbol: row.symbol ?? null,
            amount: row.amount,
          });

          if (existingCashEventKeys.has(key)) {
            fidelitySkippedCashEventDuplicates += 1;
            continue;
          }

          existingCashEventKeys.add(key);
          dedupedCashEvents.push(row);
        }

        filteredCashEvents = dedupedCashEvents;
      }

      const ingestResult = await replaceImportExecutions(tx, importId, filteredExecutionData);
      const snapshotResult = await replaceImportSnapshots(tx, importId, existingImport.accountId, parsed.snapshots);
      const cashEventResult = await replaceImportCashEvents(tx, importId, existingImport.accountId, filteredCashEvents);
      if (matched.adapter.id === "fidelity") {
        await hydrateFidelityCashSnapshots(tx, existingImport.accountId);
      }

      const rebuildResult = await rebuildAccountLedger(tx, existingImport.accountId, new Date());
      const setupResult = await rebuildAccountSetups(tx, existingImport.accountId);
      const combinedWarnings = [
        ...parsed.warnings,
        ...(matched.adapter.coverage().snapshots && snapshotResult.parsed === 0
          ? [
              {
                code: "NO_SNAPSHOT_ROWS",
                message: "No Cash Balance BAL rows were parsed into daily snapshots for this import.",
              },
            ]
          : []),
        ...ingestResult.failures.map((message, index) => ({
          code: "INGEST_ROW_FAILED",
          message,
          rowRef: String(index + 1),
        })),
        ...rebuildResult.warnings.map((warning) => ({
          code: warning.code,
          message: warning.message,
          rowRef: warning.rowRef,
        })),
        ...(setupResult.uncategorizedCount > 0
          ? [
              {
                code: "SETUP_UNCATEGORIZED_COUNT",
                message: `${setupResult.uncategorizedCount} setup groups were inferred as uncategorized.`,
              },
            ]
          : []),
      ];
      const warningsJson = combinedWarnings as unknown as Prisma.InputJsonValue;

      const executionSkippedDuplicates = ingestResult.skipped_duplicate + fidelitySkippedExecutionDuplicates;
      const cashEventSkippedDuplicates = fidelitySkippedCashEventDuplicates;

      const updatedImport = await tx.import.update({
        where: { id: importId },
        data: {
          status: "COMMITTED",
          parsedRows: parsed.parsedRows,
          persistedRows: ingestResult.inserted + cashEventResult.upserted,
          skippedRows: parsed.skippedRows,
          skippedDuplicateRows: executionSkippedDuplicates + cashEventSkippedDuplicates,
          failedRows: ingestResult.failed,
          warnings: warningsJson,
        },
      });

      return {
        updatedImport,
        combinedWarnings,
        inserted: {
          executions: ingestResult.inserted,
          cashEvents: cashEventResult.upserted,
        },
        skippedDuplicates: {
          executions: executionSkippedDuplicates,
          cashEvents: cashEventSkippedDuplicates,
        },
      };
    });
  } catch (error) {
    await prisma.import.update({
      where: { id: importId },
      data: {
        status: "FAILED",
        persistedRows: 0,
        skippedDuplicateRows: 0,
        failedRows: 0,
        warnings: [{ code: "COMMIT_ERROR", message: error instanceof Error ? error.message : "Unknown commit error" }],
      },
    });

    return errorResponse("COMMIT_ERROR", "Import commit failed without persisting partial data.", [
      error instanceof Error ? error.message : "Unknown commit error",
    ]);
  }

  const payload: CommitImportResponse = {
    importId: transactionResult.updatedImport.id,
    parsedRows: transactionResult.updatedImport.parsedRows,
    inserted: transactionResult.inserted,
    skippedDuplicates: transactionResult.skippedDuplicates,
    failed: transactionResult.updatedImport.failedRows,
    warnings: transactionResult.combinedWarnings.map((warning) => `${warning.code}: ${warning.message}`),
  };

  void fetch(new URL("/api/positions/snapshot/compute", request.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ accountIds: [existingImport.accountId] }),
  }).catch(() => {});

  return detailResponse(payload);
}
