import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { parseCashBalanceSnapshots } from "../src/lib/adapters/thinkorswim/cash-balance";
import { parseAccountMetadataFromCsv } from "../src/lib/accounts/parse-account-metadata";
import { parseThinkorswimTradeHistory } from "../src/lib/adapters/thinkorswim/trade-history";
import { rebuildAccountSetups } from "../src/lib/analytics/rebuild-account-setups";
import { deriveInstrumentKeyFromNormalizedExecution } from "../src/lib/ledger/instrument-key";
import { ingestExecutions } from "../src/lib/ledger/ingest";
import { rebuildAccountLedger } from "../src/lib/ledger/rebuild-account-ledger";

const prisma = new PrismaClient();

const seedFiles = [
  "fixtures/2026-04-06-AccountStatement.csv",
  "fixtures/2026-04-06-AccountStatement-2.csv",
];

async function main() {
  for (const fixturePath of seedFiles) {
    const csvText = readFileSync(join(process.cwd(), fixturePath), "utf8");
    const metadata = parseAccountMetadataFromCsv(csvText);
    const parsedTradeHistory = parseThinkorswimTradeHistory(csvText);

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

    const filename = fixturePath.split("/").pop() ?? fixturePath;
    const seededImport = await prisma.import.upsert({
      where: {
        accountId_filename: {
          accountId: account.id,
          filename,
        },
      },
      update: {
        broker: metadata.broker,
        status: "COMMITTED",
        parsedRows: 0,
        persistedRows: 0,
        skippedRows: parsedTradeHistory.skippedRows,
        skippedDuplicateRows: 0,
        failedRows: 0,
        sourceFileText: csvText,
        warnings: parsedTradeHistory.warnings as unknown as Prisma.InputJsonValue,
      },
      create: {
        filename,
        broker: metadata.broker,
        status: "COMMITTED",
        parsedRows: 0,
        persistedRows: 0,
        skippedRows: parsedTradeHistory.skippedRows,
        skippedDuplicateRows: 0,
        failedRows: 0,
        warnings: parsedTradeHistory.warnings as unknown as Prisma.InputJsonValue,
        sourceFileText: csvText,
        accountId: account.id,
      },
    });

    const snapshots = parseCashBalanceSnapshots(csvText);

    for (const snapshot of snapshots) {
      await prisma.dailyAccountSnapshot.upsert({
        where: {
          accountId_snapshotDate: {
            accountId: account.id,
            snapshotDate: snapshot.snapshotDate,
          },
        },
        update: {
          balance: snapshot.balance,
          sourceRef: seededImport.id,
        },
        create: {
          accountId: account.id,
          snapshotDate: snapshot.snapshotDate,
          balance: snapshot.balance,
          sourceRef: seededImport.id,
        },
      });
    }

    await prisma.$transaction(async (tx) => {
      const ingestResult = await ingestExecutions(
        tx,
        parsedTradeHistory.executions.map((execution) => ({
          importId: seededImport.id,
          accountId: account.id,
          broker: metadata.broker,
          eventTimestamp: execution.eventTimestamp,
          tradeDate: execution.tradeDate,
          eventType: execution.eventType,
          assetClass: execution.assetClass,
          symbol: execution.symbol,
          instrumentKey: deriveInstrumentKeyFromNormalizedExecution(execution),
          side: execution.side,
          quantity: execution.quantity,
          price: execution.price,
          grossAmount: execution.grossAmount,
          netAmount: execution.netAmount,
          openingClosingEffect: execution.openingClosingEffect,
          underlyingSymbol: execution.underlyingSymbol,
          optionType: execution.optionType,
          strike: execution.strike,
          expirationDate: execution.expirationDate,
          spreadGroupId: execution.spreadGroupId,
          sourceRowRef: execution.sourceRowRef,
          rawRowJson: execution.rawRowJson,
        })),
      );

      const rebuilt = await rebuildAccountLedger(tx, account.id, new Date());
      const setupResult = await rebuildAccountSetups(tx, account.id);
      await tx.import.update({
        where: { id: seededImport.id },
        data: {
          parsedRows: ingestResult.parsed,
          persistedRows: ingestResult.inserted,
          skippedRows: parsedTradeHistory.skippedRows,
          skippedDuplicateRows: ingestResult.skipped_duplicate,
          failedRows: ingestResult.failed,
          warnings: [
            ...parsedTradeHistory.warnings,
            ...ingestResult.failures.map((message, index) => ({
              code: "INGEST_ROW_FAILED",
              message,
              rowRef: String(index + 1),
            })),
            ...rebuilt.warnings,
            ...(setupResult.uncategorizedCount > 0
              ? [
                  {
                    code: "SETUP_UNCATEGORIZED_COUNT",
                    message: `${setupResult.uncategorizedCount} setup groups were inferred as uncategorized.`,
                  },
                ]
              : []),
          ] as unknown as Prisma.InputJsonValue,
        },
      });
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
