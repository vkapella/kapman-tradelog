import { Prisma } from "@prisma/client";
import { detailResponse, errorResponse } from "@/lib/api/responses";
import { detectAdapter } from "@/lib/adapters/registry";
import { prisma } from "@/lib/db/prisma";
import type { UploadImportResponse } from "@/types/api";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return errorResponse("INVALID_FILE", "A file is required.", ["Missing multipart field: file"]);
  }

  const csvText = await file.text();
  const matched = detectAdapter({
    name: file.name,
    content: csvText,
    mimeType: file.type || "text/csv",
    size: file.size,
  });

  if (!matched) {
    return errorResponse("UNSUPPORTED_BROKER", "No registered adapter matched this file.", [
      "Detection failed for all registered adapters.",
    ]);
  }

  try {
    const parsed = matched.adapter.parse({
      name: file.name,
      content: csvText,
      mimeType: file.type || "text/csv",
      size: file.size,
    });

    const broker = matched.adapter.id === "fidelity" ? "FIDELITY" : "SCHWAB_THINKORSWIM";
    const account = await prisma.account.upsert({
      where: { accountId: parsed.accountMetadata.accountId },
      update: {
        label: parsed.accountMetadata.label,
        broker,
        paperMoney: parsed.accountMetadata.paperMoney,
      },
      create: {
        accountId: parsed.accountMetadata.accountId,
        label: parsed.accountMetadata.label,
        broker,
        paperMoney: parsed.accountMetadata.paperMoney,
      },
    });

    const warningsJson = [...matched.detection.warnings, ...parsed.warnings] as unknown as Prisma.InputJsonValue;

    const createdImport = await prisma.import.create({
      data: {
        filename: file.name,
        broker,
        status: "UPLOADED",
        accountId: account.id,
        parsedRows: 0,
        persistedRows: 0,
        skippedRows: 0,
        skippedDuplicateRows: 0,
        failedRows: 0,
        warnings: warningsJson,
        sourceFileText: csvText,
      },
    });

    const payload: UploadImportResponse = {
      importId: createdImport.id,
      detection: {
        adapterId: matched.adapter.id,
        broker: matched.adapter.id,
        confidence: matched.detection.confidence,
        formatVersion: matched.detection.formatVersion,
        rowEstimate: csvText.split(/\r?\n/).length,
        reason: matched.detection.reason,
        warnings: [...matched.detection.warnings, ...parsed.warnings].map((warning) => ({
          code: warning.code,
          message: warning.message,
          rowRef: warning.rowRef,
        })),
      },
      previewRows: parsed.executions.slice(0, 10).map((row) => ({
        eventTimestamp: row.eventTimestamp.toISOString(),
        symbol: row.symbol,
        side: row.side,
        quantity: row.quantity,
        price: row.price,
        spread: row.spread,
        openingClosingEffect: row.openingClosingEffect,
      })),
    };

    return detailResponse(payload);
  } catch (error) {
    return errorResponse("PARSE_ERROR", "Unable to parse uploaded file.", [
      error instanceof Error ? error.message : "Unknown parsing error",
    ]);
  }
}
