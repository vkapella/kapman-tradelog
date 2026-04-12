import type { Prisma } from "@prisma/client";
import { computeBrokerTxIdFromExecution, type LedgerIngestExecution } from "@/lib/ledger/ingest";

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

export async function ensureLegacyImportExecutionLinks(tx: Prisma.TransactionClient, importId: string): Promise<void> {
  const ownedRows = await tx.execution.findMany({
    where: { importId },
    select: { id: true },
  });

  if (ownedRows.length === 0) {
    return;
  }

  await tx.importExecution.createMany({
    data: ownedRows.map((row) => ({
      importId,
      executionId: row.id,
    })),
    skipDuplicates: true,
  });
}

export async function listLinkedExecutionIdsForImport(tx: Prisma.TransactionClient, importId: string): Promise<string[]> {
  await ensureLegacyImportExecutionLinks(tx, importId);

  const linkedRows = await tx.importExecution.findMany({
    where: { importId },
    select: { executionId: true },
  });

  return uniqueStrings(linkedRows.map((row) => row.executionId));
}

export interface ReleaseImportExecutionLinksResult {
  deletedLinkCount: number;
  deletedExecutionIds: string[];
  reassignedExecutionIds: string[];
}

export async function releaseImportExecutionLinks(
  tx: Prisma.TransactionClient,
  importId: string,
  executionIds: string[],
): Promise<ReleaseImportExecutionLinksResult> {
  const uniqueExecutionIds = uniqueStrings(executionIds);
  if (uniqueExecutionIds.length === 0) {
    return {
      deletedLinkCount: 0,
      deletedExecutionIds: [],
      reassignedExecutionIds: [],
    };
  }

  const { count: deletedLinkCount } = await tx.importExecution.deleteMany({
    where: { importId },
  });

  const executionRows = await tx.execution.findMany({
    where: {
      id: {
        in: uniqueExecutionIds,
      },
    },
    select: {
      id: true,
      importId: true,
    },
  });

  const deletedExecutionIds: string[] = [];
  const reassignedExecutionIds: string[] = [];

  for (const execution of executionRows) {
    if (execution.importId !== importId) {
      continue;
    }

    const fallbackLink = await tx.importExecution.findFirst({
      where: { executionId: execution.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { importId: true },
    });

    if (!fallbackLink) {
      deletedExecutionIds.push(execution.id);
      continue;
    }

    if (fallbackLink.importId !== importId) {
      await tx.execution.update({
        where: { id: execution.id },
        data: { importId: fallbackLink.importId },
      });
      reassignedExecutionIds.push(execution.id);
    }
  }

  if (deletedExecutionIds.length > 0) {
    await tx.execution.deleteMany({
      where: {
        id: {
          in: deletedExecutionIds,
        },
      },
    });
  }

  return {
    deletedLinkCount,
    deletedExecutionIds,
    reassignedExecutionIds,
  };
}

export async function linkImportToExecutionInputs(
  tx: Prisma.TransactionClient,
  importId: string,
  executions: LedgerIngestExecution[],
): Promise<number> {
  if (executions.length === 0) {
    return 0;
  }

  const keyRows = uniqueStrings(
    executions.map((execution) => `${execution.accountId}|${computeBrokerTxIdFromExecution(execution)}`),
  );

  if (keyRows.length === 0) {
    return 0;
  }

  const accountBrokerPairs = keyRows.map((value) => {
    const separator = value.indexOf("|");
    return {
      accountId: value.slice(0, separator),
      brokerTxId: value.slice(separator + 1),
    };
  });

  const existing = await tx.execution.findMany({
    where: {
      OR: accountBrokerPairs,
    },
    select: {
      id: true,
    },
  });

  if (existing.length === 0) {
    return 0;
  }

  const created = await tx.importExecution.createMany({
    data: uniqueStrings(existing.map((row) => row.id)).map((executionId) => ({ importId, executionId })),
    skipDuplicates: true,
  });

  return created.count;
}
