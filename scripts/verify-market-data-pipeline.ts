import { PrismaScheduledPipelineStore } from "../src/lib/marketdata/scheduled-pipeline-store";
import { prisma } from "../src/lib/db/prisma";

async function main(): Promise<void> {
  const now = new Date();
  const store = new PrismaScheduledPipelineStore(prisma);
  const [progress, activeLease] = await Promise.all([
    store.loadProgress(),
    store.loadActiveLease(now),
  ]);

  console.log(JSON.stringify({
    checkedAt: now.toISOString(),
    latestEquityMarkDate: progress.latestEquityMarkDate?.toISOString().slice(0, 10) ?? null,
    latestOptionMarkDate: progress.latestOptionMarkDate?.toISOString().slice(0, 10) ?? null,
    latestValueSnapshotDate: progress.latestValueSnapshotDate?.toISOString().slice(0, 10) ?? null,
    activeLease: activeLease
      ? {
          owner: activeLease.owner,
          expiresAt: activeLease.expiresAt.toISOString(),
        }
      : null,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error("[verify:market-data-pipeline] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
