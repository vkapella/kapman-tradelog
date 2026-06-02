import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { detectAdapter } from "../src/lib/adapters/registry";
import { getBrokerDisplayName, getDefaultStartingCapital } from "../src/lib/accounts/defaults";
import { backfillLotExcursions } from "../src/lib/analysis/backfill-lot-excursions";
import { rebuildAccountSetups } from "../src/lib/analytics/rebuild-account-setups";
import { hydrateFidelityCashSnapshots } from "../src/lib/imports/hydrate-fidelity-cash-snapshots";
import { replaceImportCashEvents } from "../src/lib/imports/replace-import-cash-events";
import { replaceImportExecutions } from "../src/lib/imports/replace-import-executions";
import { replaceImportSnapshots } from "../src/lib/imports/replace-import-snapshots";
import { deriveInstrumentKeyFromNormalizedExecution } from "../src/lib/ledger/instrument-key";
import { rebuildAccountLedger } from "../src/lib/ledger/rebuild-account-ledger";

const prisma = new PrismaClient();

// Seed the full fixture set committed in-repo for both brokers.
const seedFiles = [
  "fixtures/2026-05-29-AccountStatement53.csv",
  "fixtures/2026-05-29-AccountStatement54.csv",
  "fixtures/History_for_Account_X19467537-20-2024.csv",
  "fixtures/History_for_Account_X19467537-20-2025.csv",
  "fixtures/History_for_Account_X19467537-20-2026-05-29.csv",
];

async function seedCorporateActionAdjustments(accountInternalId: string, externalAccountId: string) {
  if (externalAccountId !== "D-68011053") {
    return;
  }

  const entries = [
    {
      symbol: "SDS",
      effectiveDate: "2025-11-20T00:00:00.000Z",
      payload: { from: 5, to: 1 },
      reason: "ProShares 1-for-5 reverse split effective 2025-11-20",
      evidenceRef: "https://www.proshares.com/press-releases/proshares-announces-etf-share-splits5",
    },
    {
      symbol: "XLU",
      effectiveDate: "2025-12-05T00:00:00.000Z",
      payload: { from: 1, to: 2 },
      reason: "State Street 2-for-1 forward split effective 2025-12-05",
      evidenceRef:
        "https://investors.statestreet.com/investor-news-events/press-releases/news-details/2025/State-Street-Investment-Management-Announces-Share-Splits-for-Five-Select-Sector-SPDR-ETFs/default.aspx",
    },
  ] as const;

  for (const entry of entries) {
    const existing = await prisma.manualAdjustment.findFirst({
      where: {
        accountId: accountInternalId,
        symbol: entry.symbol,
        adjustmentType: "SPLIT",
        effectiveDate: new Date(entry.effectiveDate),
        status: "ACTIVE",
      },
    });

    if (!existing) {
      await prisma.manualAdjustment.create({
        data: {
          createdBy: "seed",
          accountId: accountInternalId,
          symbol: entry.symbol,
          effectiveDate: new Date(entry.effectiveDate),
          adjustmentType: "SPLIT",
          payloadJson: entry.payload as unknown as Prisma.InputJsonValue,
          reason: entry.reason,
          evidenceRef: entry.evidenceRef,
          status: "ACTIVE",
        },
      });
    }
  }
}

async function main() {
  for (const fixturePath of seedFiles) {
    const csvText = readFileSync(join(process.cwd(), fixturePath), "utf8");
    const filename = fixturePath.split("/").pop() ?? fixturePath;
    const matched = detectAdapter({
      name: filename,
      content: csvText,
      mimeType: "text/csv",
      size: csvText.length,
    });
    if (!matched) {
      throw new Error(`No adapter matched fixture ${fixturePath}`);
    }

    const parsed = matched.adapter.parse({
      name: filename,
      content: csvText,
      mimeType: "text/csv",
      size: csvText.length,
    });
    const broker = matched.adapter.id === "fidelity" ? "FIDELITY" : "SCHWAB_THINKORSWIM";
    const metadata = parsed.accountMetadata;

    const account = await prisma.account.upsert({
      where: { accountId: metadata.accountId },
      update: {
        label: metadata.label,
        broker,
        paperMoney: metadata.paperMoney,
      },
      create: {
        accountId: metadata.accountId,
        label: metadata.label,
        displayLabel: metadata.label,
        broker,
        brokerName: getBrokerDisplayName(broker),
        paperMoney: metadata.paperMoney,
        startingCapital: getDefaultStartingCapital(broker),
      },
    });

    const existingSeedImports = await prisma.import.findMany({
      where: {
        accountId: account.id,
        filename,
      },
      select: { id: true },
    });
    if (existingSeedImports.length > 0) {
      await prisma.import.deleteMany({
        where: {
          id: {
            in: existingSeedImports.map((row) => row.id),
          },
        },
      });
    }

    const seededImport = await prisma.import.create({
      data: {
        filename,
        broker,
        status: "COMMITTED",
        parsedRows: 0,
        persistedRows: 0,
        skippedRows: parsed.skippedRows,
        skippedDuplicateRows: 0,
        failedRows: 0,
        warnings: parsed.warnings as unknown as Prisma.InputJsonValue,
        sourceFileText: csvText,
        accountId: account.id,
      },
    });

    await prisma.$transaction(async (tx) => {
      await replaceImportSnapshots(tx, seededImport.id, account.id, parsed.snapshots);
      await replaceImportCashEvents(tx, seededImport.id, account.id, parsed.cashEvents);

      const ingestResult = await replaceImportExecutions(
        tx,
        seededImport.id,
        parsed.executions.map((execution) => ({
          importId: seededImport.id,
          accountId: account.id,
          broker,
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
      if (broker === "FIDELITY") {
        await hydrateFidelityCashSnapshots(tx, account.id);
      }

      const rebuilt = await rebuildAccountLedger(tx, account.id, new Date());
      const setupResult = await rebuildAccountSetups(tx, account.id);
      await tx.import.update({
        where: { id: seededImport.id },
        data: {
          parsedRows: ingestResult.parsed,
          persistedRows: ingestResult.inserted,
          skippedRows: parsed.skippedRows,
          skippedDuplicateRows: ingestResult.skipped_duplicate,
          failedRows: ingestResult.failed,
          warnings: [
            ...parsed.warnings,
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

    await seedCorporateActionAdjustments(account.id, metadata.accountId);
  }

  const historicalMarkCount = await prisma.historicalMark.count();
  if (historicalMarkCount > 0) {
    await backfillLotExcursions({
      prismaClient: prisma,
      logger: console,
    });
  } else {
    console.log("[seed] skipping lot-excursion backfill; no historical marks are loaded.");
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
