import { backfillValueSnapshots } from "../src/lib/analysis/backfill-value-snapshots";

interface ParsedArgs {
  accountIds?: string[];
  startDate?: Date;
  endDate?: Date;
}

function parseDateOnly(value: string, flagName: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${flagName} date format: ${value}. Expected YYYY-MM-DD.`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`Invalid ${flagName} date value: ${value}.`);
  }

  return parsed;
}

function parseAccountIds(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((accountId) => accountId.trim())
        .filter((accountId) => accountId.length > 0),
    ),
  );
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--accountIds") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --accountIds");
      }
      parsed.accountIds = parseAccountIds(value);
      index += 1;
      continue;
    }

    if (token === "--start") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --start");
      }
      parsed.startDate = parseDateOnly(value, "--start");
      index += 1;
      continue;
    }

    if (token === "--end") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --end");
      }
      parsed.endDate = parseDateOnly(value, "--end");
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const summary = await backfillValueSnapshots({
    accountIds: args.accountIds,
    startDate: args.startDate,
    endDate: args.endDate,
  });

  console.log("[backfill:value-snapshots] summary", summary);
}

main().catch((error) => {
  console.error("[backfill:value-snapshots] failed", error);
  process.exit(1);
});
