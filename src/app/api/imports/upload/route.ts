import { detailResponse, errorResponse } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import { parseAccountMetadataFromCsv } from "@/lib/accounts/parse-account-metadata";
import type { UploadImportResponse } from "@/types/api";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return errorResponse("INVALID_FILE", "A file is required.", ["Missing multipart field: file"]);
  }

  const csvText = await file.text();

  try {
    const metadata = parseAccountMetadataFromCsv(csvText);
    const account = await prisma.account.upsert({
      where: { accountId: metadata.accountId },
      update: {
        label: metadata.label,
        broker: metadata.broker,
        paperMoney: metadata.paperMoney,
      },
      create: {
        accountId: metadata.accountId,
        label: metadata.label,
        broker: metadata.broker,
        paperMoney: metadata.paperMoney,
      },
    });

    const createdImport = await prisma.import.create({
      data: {
        filename: file.name,
        broker: metadata.broker,
        status: "UPLOADED",
        accountId: account.id,
      },
    });

    const payload: UploadImportResponse = {
      importId: createdImport.id,
      detection: {
        broker: "schwab_thinkorswim",
        confidence: 1,
        formatVersion: "tos-account-statement-v1",
        rowEstimate: csvText.split(/\r?\n/).length,
      },
    };

    return detailResponse(payload);
  } catch (error) {
    return errorResponse("PARSE_ERROR", "Unable to parse uploaded file.", [
      error instanceof Error ? error.message : "Unknown parsing error",
    ]);
  }
}
