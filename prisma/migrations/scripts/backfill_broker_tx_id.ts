import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const ingestModule = await import(new URL("../../../src/lib/ledger/ingest.ts", import.meta.url).href);
  const computeBrokerTxId = ingestModule.computeBrokerTxId as (
    input: Parameters<typeof import("../../../src/lib/ledger/ingest").computeBrokerTxId>[0],
  ) => string;

  const executions = await prisma.execution.findMany({
    select: {
      id: true,
      accountId: true,
      brokerTxId: true,
      eventTimestamp: true,
      eventType: true,
      assetClass: true,
      instrumentKey: true,
      symbol: true,
      side: true,
      quantity: true,
      price: true,
      openingClosingEffect: true,
      optionType: true,
      strike: true,
      expirationDate: true,
      sourceRowRef: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  let updated = 0;
  let failed = 0;

  for (const execution of executions) {
    try {
      if (!execution.brokerTxId) {
        if (!execution.side) {
          throw new Error(`Execution ${execution.id} has null side.`);
        }

        const brokerTxId = computeBrokerTxId({
          accountId: execution.accountId,
          eventTimestamp: execution.eventTimestamp,
          eventType: execution.eventType,
          assetClass: execution.assetClass,
          instrumentKey: execution.instrumentKey,
          dedupeDiscriminator: execution.eventType === "TRADE" ? null : execution.sourceRowRef,
          symbol: execution.symbol,
          side: execution.side,
          quantity: execution.quantity.toString(),
          rawPrice: execution.price?.toString() ?? null,
          openingClosingEffect: execution.openingClosingEffect,
          optionType: execution.optionType,
          strike: execution.strike?.toString() ?? null,
          expirationDate: execution.expirationDate,
        });

        await prisma.execution.update({
          where: { id: execution.id },
          data: { brokerTxId },
        });
        updated += 1;
      }
    } catch (error) {
      failed += 1;
      console.error(
        `[backfill_broker_tx_id] failed execution=${execution.id} account=${execution.accountId}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
      throw error;
    }
  }

  console.log(
    `[backfill_broker_tx_id] total=${executions.length} updated=${updated} failed=${failed}`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    await prisma.$disconnect();
    throw error;
  });
