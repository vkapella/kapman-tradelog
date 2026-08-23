/**
 * MD→Postgres recommendation ingest (KB_4.0_DESIGN §6, tradelog #326).
 *
 * Walks a local kapman-journal clone (env KAPMAN_JOURNAL_DIR) and upserts every
 * parseable pass1/pass2 log row into trade_recommendations, keyed on rec_id —
 * idempotent, so a re-run never double-logs. Unparseable rows are reported and
 * skipped, never guessed.
 *
 * Usage:
 *   KAPMAN_JOURNAL_DIR=/path/to/kapman-journal npm run ingest:recommendations
 *   ... [--dry-run] [--dir log/pass2]
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { prisma } from "../src/lib/db/prisma";
import { parseJournalLogFile } from "../src/lib/recommendations/journal-md";
import { upsertRecommendations } from "../src/lib/recommendations/upsert";
import { recommendationIngestSchema } from "../src/lib/recommendations/types";

function walkMarkdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      out.push(...walkMarkdownFiles(full));
    } else if (entry.endsWith(".md") && !entry.startsWith("README")) {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  const journalDir = process.env.KAPMAN_JOURNAL_DIR;
  if (!journalDir) {
    console.error("KAPMAN_JOURNAL_DIR is required (path to a local kapman-journal clone).");
    process.exitCode = 1;
    return;
  }

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const dirFlagIndex = args.indexOf("--dir");
  const subDirs =
    dirFlagIndex >= 0 && args[dirFlagIndex + 1] ? [args[dirFlagIndex + 1]] : ["log/pass1", "log/pass2"];

  let totalParsed = 0;
  let totalSkipped = 0;
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalInvalid = 0;

  for (const subDir of subDirs) {
    const root = join(journalDir, subDir);
    let files: string[] = [];
    try {
      files = walkMarkdownFiles(root).sort();
    } catch {
      console.warn(`skip: ${subDir} not present under ${journalDir}`);
      continue;
    }

    for (const file of files) {
      const relPath = relative(journalDir, file);
      const { rows, skipped } = parseJournalLogFile(readFileSync(file, "utf8"), relPath);

      const valid = [];
      for (const row of rows) {
        const check = recommendationIngestSchema.safeParse(row);
        if (check.success) {
          valid.push(check.data);
        } else {
          totalInvalid += 1;
          console.warn(
            `  INVALID ${relPath} ${row.recId}: ${check.error.issues.map((issue) => issue.message).join("; ")}`,
          );
        }
      }

      totalParsed += valid.length;
      totalSkipped += skipped.length;

      let created = 0;
      let updated = 0;
      if (!dryRun && valid.length > 0) {
        const result = await upsertRecommendations(valid);
        created = result.created;
        updated = result.updated;
        totalCreated += created;
        totalUpdated += updated;
      }

      console.log(
        `${relPath}: parsed ${valid.length}, skipped ${skipped.length}` +
          (dryRun ? " (dry-run)" : `, created ${created}, updated ${updated}`),
      );
      if (valid.length === 0 && skipped.length === 0) {
        console.warn(
          "  NOTE: no rec_id-keyed table found — file does not follow the §A4 record-header grammar; nothing ingested",
        );
      }
      for (const skip of skipped) {
        console.warn(`  SKIP line ${skip.line}: ${skip.reason}`);
      }
    }
  }

  console.log(
    `\nTotal: parsed ${totalParsed}, skipped ${totalSkipped}, invalid ${totalInvalid}` +
      (dryRun ? " (dry-run — nothing written)" : `, created ${totalCreated}, updated ${totalUpdated}`),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
