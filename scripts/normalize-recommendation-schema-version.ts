/**
 * One-off, idempotent repair for trade_recommendations.journal_schema_version
 * values that kept their YAML quotes (e.g. the literal `'4.0'`), kapman-tradelog
 * #367. Safe to re-run: rows already normalized are untouched.
 *
 *   npm run repair:recommendation-schema-version [-- --dry-run]
 */
import { prisma } from "../src/lib/db/prisma";
import { unquoteFrontmatterScalar } from "../src/lib/recommendations/journal-md";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const rows = await prisma.tradeRecommendation.findMany({
    where: { journalSchemaVersion: { not: null } },
    select: { id: true, recId: true, journalSchemaVersion: true },
  });
  let changed = 0;
  for (const row of rows) {
    const current = row.journalSchemaVersion ?? "";
    const normalized = unquoteFrontmatterScalar(current);
    if (normalized === current) {
      continue;
    }
    changed += 1;
    console.log(`${dryRun ? "[dry-run] " : ""}${row.recId}: ${JSON.stringify(current)} -> ${JSON.stringify(normalized)}`);
    if (!dryRun) {
      await prisma.tradeRecommendation.update({ where: { id: row.id }, data: { journalSchemaVersion: normalized } });
    }
  }
  console.log(`[repair:recommendation-schema-version] scanned=${rows.length} changed=${changed} dryRun=${dryRun}`);
}

main()
  .catch((error) => {
    console.error("[repair:recommendation-schema-version] failed", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
