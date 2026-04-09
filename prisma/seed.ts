import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { parseCashBalanceSnapshots } from "../src/lib/adapters/thinkorswim/cash-balance";
import { parseAccountMetadataFromCsv } from "../src/lib/accounts/parse-account-metadata";
import { parseThinkorswimTradeHistory } from "../src/lib/adapters/thinkorswim/trade-history";
import { deriveInstrumentKeyFromNormalizedExecution } from "../src/lib/ledger/instrument-key";
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
        parsedRows: parsedTradeHistory.parsedRows,
        persistedRows: parsedTradeHistory.executions.length,
        skippedRows: parsedTradeHistory.skippedRows,
        sourceFileText: csvText,
        warnings: parsedTradeHistory.warnings as unknown as Prisma.InputJsonValue,
      },
      create: {
        filename,
        broker: metadata.broker,
        status: "COMMITTED",
        parsedRows: parsedTradeHistory.parsedRows,
        persistedRows: parsedTradeHistory.executions.length,
        skippedRows: parsedTradeHistory.skippedRows,
        warnings: parsedTradeHistory.warnings as unknown as Prisma.InputJsonValue,
        sourceFileText: csvText,
        accountId: account.id,
      },
    });

    await prisma.execution.deleteMany({ where: { importId: seededImport.id } });

    if (parsedTradeHistory.executions.length > 0) {
      await prisma.execution.createMany({
        data: parsedTradeHistory.executions.map((execution) => ({
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
      });
    }

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
      const rebuilt = await rebuildAccountLedger(tx, account.id, new Date());
      await tx.import.update({
        where: { id: seededImport.id },
        data: {
          warnings: [...parsedTradeHistory.warnings, ...rebuilt.warnings] as unknown as Prisma.InputJsonValue,
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
