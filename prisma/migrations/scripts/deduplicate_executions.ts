import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface DuplicateGroup {
  accountId: string;
  brokerTxId: string;
  executions: Array<{
    id: string;
    importId: string;
    importCreatedAt: Date;
    createdAt: Date;
  }>;
}

function getMetricsPath(): string {
  mkdirSync("backups", { recursive: true });
  return `backups/dedup_execution_metrics_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
}

async function findDuplicateGroups(): Promise<DuplicateGroup[]> {
  const rows = await prisma.execution.findMany({
    select: {
      id: true,
      accountId: true,
      brokerTxId: true,
      importId: true,
      createdAt: true,
    },
    orderBy: [{ accountId: "asc" }, { brokerTxId: "asc" }, { createdAt: "asc" }],
  });

  const importIds = Array.from(new Set(rows.map((row) => row.importId)));
  const imports = await prisma.import.findMany({
    where: {
      id: {
        in: importIds,
      },
    },
    select: {
      id: true,
      createdAt: true,
    },
  });
  const importCreatedAtById = new Map(imports.map((row) => [row.id, row.createdAt]));

  const grouped = new Map<string, DuplicateGroup>();

  for (const row of rows) {
    const brokerTxId = row.brokerTxId;
    if (!brokerTxId) {
      continue;
    }

    const key = `${row.accountId}|${brokerTxId}`;
    const existing = grouped.get(key) ?? {
      accountId: row.accountId,
      brokerTxId,
      executions: [],
    };

    existing.executions.push({
      id: row.id,
      importId: row.importId,
      importCreatedAt: importCreatedAtById.get(row.importId) ?? new Date(0),
      createdAt: row.createdAt,
    });
    grouped.set(key, existing);
  }

  return Array.from(grouped.values()).filter((group) => group.executions.length > 1);
}

async function main() {
  const beforeCount = await prisma.execution.count();
  const duplicateGroups = await findDuplicateGroups();

  let deletedCount = 0;

  for (const group of duplicateGroups) {
    const sorted = [...group.executions].sort((left, right) => {
      const importDiff = right.importCreatedAt.getTime() - left.importCreatedAt.getTime();
      if (importDiff !== 0) {
        return importDiff;
      }

      const createdDiff = right.createdAt.getTime() - left.createdAt.getTime();
      if (createdDiff !== 0) {
        return createdDiff;
      }

      return right.id.localeCompare(left.id);
    });

    const keep = sorted[0];
    if (!keep) {
      continue;
    }

    const duplicateIds = sorted.slice(1).map((entry) => entry.id);
    if (duplicateIds.length === 0) {
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const reassignedOpen = await tx.matchedLot.updateMany({
        where: {
          openExecutionId: {
            in: duplicateIds,
          },
        },
        data: {
          openExecutionId: keep.id,
        },
      });

      const reassignedClose = await tx.matchedLot.updateMany({
        where: {
          closeExecutionId: {
            in: duplicateIds,
          },
        },
        data: {
          closeExecutionId: keep.id,
        },
      });

      const deleted = await tx.execution.deleteMany({
        where: {
          id: {
            in: duplicateIds,
          },
        },
      });

      deletedCount += deleted.count;

      console.log(
        `[deduplicate_executions] account=${group.accountId} broker_tx_id=${group.brokerTxId} keep=${keep.id} removed=${duplicateIds.join(",")} reassigned_open=${reassignedOpen.count} reassigned_close=${reassignedClose.count}`,
      );
    });
  }

  const afterCount = await prisma.execution.count();
  const metrics = {
    beforeCount,
    afterCount,
    deletedCount,
    groupsProcessed: duplicateGroups.length,
    generatedAt: new Date().toISOString(),
  };

  const metricsPath = getMetricsPath();
  writeFileSync(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, "utf8");

  console.log(
    `[deduplicate_executions] groups=${duplicateGroups.length} deleted=${deletedCount} before=${beforeCount} after=${afterCount}`,
  );
  console.log(`[deduplicate_executions] metrics_file=${metricsPath}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    await prisma.$disconnect();
    throw error;
  });
