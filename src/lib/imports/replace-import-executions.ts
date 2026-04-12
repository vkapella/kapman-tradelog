import type { Prisma } from "@prisma/client";
import { ingestExecutions, type IngestExecutionsResult, type LedgerIngestExecution } from "../ledger/ingest";
import { linkImportToExecutionInputs, listLinkedExecutionIdsForImport, releaseImportExecutionLinks } from "./import-execution-links";

export async function replaceImportExecutions(
  tx: Prisma.TransactionClient,
  importId: string,
  executions: LedgerIngestExecution[],
): Promise<IngestExecutionsResult> {
  const linkedExecutionIds = await listLinkedExecutionIdsForImport(tx, importId);
  await releaseImportExecutionLinks(tx, importId, linkedExecutionIds);

  const result = await ingestExecutions(tx, executions);
  await linkImportToExecutionInputs(tx, importId, executions);
  return result;
}
