import type { Prisma } from "@prisma/client";
import { ingestExecutions, type IngestExecutionsResult, type LedgerIngestExecution } from "../ledger/ingest";

export async function replaceImportExecutions(
  tx: Prisma.TransactionClient,
  importId: string,
  executions: LedgerIngestExecution[],
): Promise<IngestExecutionsResult> {
  await tx.execution.deleteMany({
    where: { importId },
  });

  return ingestExecutions(tx, executions);
}
