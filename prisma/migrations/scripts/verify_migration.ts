import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function loadLatestDedupMetrics() {
  const backupsDir = join(process.cwd(), "backups");
  const files = readdirSync(backupsDir)
    .filter((file) => file.startsWith("dedup_execution_metrics_") && file.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    throw new Error("No dedup metrics file found in backups/. Run deduplicate_executions.ts first.");
  }

  const latest = files[files.length - 1];
  const payload = JSON.parse(readFileSync(join(backupsDir, latest), "utf8")) as {
    beforeCount: number;
    afterCount: number;
  };

  return {
    file: latest,
    beforeCount: payload.beforeCount,
    afterCount: payload.afterCount,
  };
}

async function main() {
  const metrics = loadLatestDedupMetrics();

  const executionRows = await prisma.execution.findMany({
    select: {
      id: true,
      accountId: true,
      brokerTxId: true,
    },
  });

  const nullBrokerTxIdCount = executionRows.filter((row) => !row.brokerTxId).length;

  const pairCounts = new Map<string, number>();
  for (const row of executionRows) {
    if (!row.brokerTxId) {
      continue;
    }

    const key = `${row.accountId}|${row.brokerTxId}`;
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }
  const duplicatePairCount = Array.from(pairCounts.values()).filter((count) => count > 1).length;

  const allMatchedLots = await prisma.matchedLot.findMany({
    select: {
      id: true,
      openExecutionId: true,
      closeExecutionId: true,
    },
  });

  const executionIdSet = new Set(
    executionRows.map((row) => row.id),
  );

  const orphanedMatchedLots = allMatchedLots.filter((lot) => {
    const openExists = executionIdSet.has(lot.openExecutionId);
    const closeExists = lot.closeExecutionId ? executionIdSet.has(lot.closeExecutionId) : true;
    return !openExists || !closeExists;
  }).length;

  console.log(`[verify_migration] metrics_file=${metrics.file}`);
  console.log(`[verify_migration] null_broker_tx_id_count=${nullBrokerTxIdCount}`);
  console.log(`[verify_migration] duplicate_account_broker_tx_id_pairs=${duplicatePairCount}`);
  console.log(`[verify_migration] orphaned_matched_lots=${orphanedMatchedLots}`);
  console.log(
    `[verify_migration] execution_count_before_dedup=${metrics.beforeCount} execution_count_after_dedup=${metrics.afterCount}`,
  );

  if (nullBrokerTxIdCount !== 0) {
    throw new Error("Verification failed: brokerTxId contains null values.");
  }
  if (duplicatePairCount !== 0) {
    throw new Error("Verification failed: duplicate (accountId, brokerTxId) pairs remain.");
  }
  if (orphanedMatchedLots !== 0) {
    throw new Error("Verification failed: orphaned matched_lots rows detected.");
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    await prisma.$disconnect();
    throw error;
  });
