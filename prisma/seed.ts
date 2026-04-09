import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseAccountMetadataFromCsv } from "../src/lib/accounts/parse-account-metadata";

const prisma = new PrismaClient();

const seedFiles = [
  "fixtures/2026-04-06-AccountStatement.csv",
  "fixtures/2026-04-06-AccountStatement-2.csv",
];

const today = new Date();

async function main() {
  for (const fixturePath of seedFiles) {
    const csvText = readFileSync(join(process.cwd(), fixturePath), "utf8");
    const metadata = parseAccountMetadataFromCsv(csvText);

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

    const seededImport = await prisma.import.create({
      data: {
        filename: fixturePath.split("/").pop() ?? fixturePath,
        broker: metadata.broker,
        status: "UPLOADED",
        parsedRows: 0,
        persistedRows: 0,
        skippedRows: 0,
        warnings: [],
        accountId: account.id,
      },
    });

    await prisma.dailyAccountSnapshot.upsert({
      where: {
        accountId_snapshotDate: {
          accountId: account.id,
          snapshotDate: new Date(today.toISOString().slice(0, 10)),
        },
      },
      update: {
        balance: 100000,
        sourceRef: seededImport.id,
      },
      create: {
        accountId: account.id,
        snapshotDate: new Date(today.toISOString().slice(0, 10)),
        balance: 100000,
        sourceRef: seededImport.id,
      },
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
