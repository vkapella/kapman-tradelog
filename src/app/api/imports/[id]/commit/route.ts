import { Prisma } from "@prisma/client";
import { detailResponse, errorResponse } from "@/lib/api/responses";
import { detectAdapter } from "@/lib/adapters/registry";
import { rebuildAccountSetups } from "@/lib/analytics/rebuild-account-setups";
import { prisma } from "@/lib/db/prisma";
import { replaceImportCashEvents } from "@/lib/imports/replace-import-cash-events";
import { replaceImportExecutions } from "@/lib/imports/replace-import-executions";
import { replaceImportSnapshots } from "@/lib/imports/replace-import-snapshots";
import { deriveInstrumentKeyFromNormalizedExecution } from "@/lib/ledger/instrument-key";
import { rebuildAccountLedger } from "@/lib/ledger/rebuild-account-ledger";
import type { CommitImportResponse } from "@/types/api";

export async function POST(_request: Request, context: { params: { id: string } }) {
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
      const ingestResult = await replaceImportExecutions(tx, importId, executionData);
      const snapshotResult = await replaceImportSnapshots(tx, importId, existingImport.accountId, parsed.snapshots);
      await replaceImportCashEvents(tx, importId, existingImport.accountId, parsed.cashEvents);

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

      const updatedImport = await tx.import.update({
        where: { id: importId },
        data: {
          status: "COMMITTED",
          parsedRows: ingestResult.parsed,
          persistedRows: ingestResult.inserted,
          skippedRows: parsed.skippedRows,
          skippedDuplicateRows: ingestResult.skipped_duplicate,
          failedRows: ingestResult.failed,
          warnings: warningsJson,
        },
      });

      return {
        updatedImport,
        combinedWarnings,
        ingestResult,
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
    inserted: transactionResult.updatedImport.persistedRows,
    skipped_duplicate: transactionResult.updatedImport.skippedDuplicateRows,
    failed: transactionResult.updatedImport.failedRows,
    warnings: transactionResult.combinedWarnings.map((warning) => `${warning.code}: ${warning.message}`),
  };

  return detailResponse(payload);
}
