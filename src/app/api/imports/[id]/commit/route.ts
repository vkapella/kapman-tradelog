import { detailResponse, errorResponse } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import type { CommitImportResponse } from "@/types/api";

export async function POST(_request: Request, context: { params: { id: string } }) {
  const importId = context.params.id;

  const existingImport = await prisma.import.findUnique({ where: { id: importId } });
  if (!existingImport) {
    return errorResponse("NOT_FOUND", "Import not found.", [`Import ${importId} does not exist.`], 404);
  }

  const updated = await prisma.import.update({
    where: { id: importId },
    data: {
      status: "COMMITTED",
      parsedRows: existingImport.parsedRows,
      persistedRows: existingImport.persistedRows,
      skippedRows: existingImport.skippedRows,
    },
  });

  const payload: CommitImportResponse = {
    importId: updated.id,
    parsedRows: updated.parsedRows,
    persistedRows: updated.persistedRows,
    skippedRows: updated.skippedRows,
    warnings: [],
  };

  return detailResponse(payload);
}
