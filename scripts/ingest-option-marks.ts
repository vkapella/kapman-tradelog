import { ingestOptionMarks, type OptionMarksIngestSource } from "../src/lib/marketdata/ingest-option-marks";

interface ParsedArgs {
  startDate?: Date;
  endDate?: Date;
  contracts?: string[];
  source?: OptionMarksIngestSource;
}

function parseDateOnly(value: string, flagName: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${flagName} date format: ${value}. Expected YYYY-MM-DD.`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${flagName} date value: ${value}.`);
  }

  return parsed;
}

function parseContracts(value: string): string[] {
  return value
    .split(",")
    .map((contract) => contract.trim())
    .filter((contract) => contract.length > 0);
}

function parseSource(value: string): OptionMarksIngestSource {
  if (value === "s3" || value === "rest") {
    return value;
  }

  throw new Error(`Invalid --source value: ${value}. Expected s3 or rest.`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

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

    if (token === "--contracts") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --contracts");
      }
      parsed.contracts = parseContracts(value);
      index += 1;
      continue;
    }

    if (token === "--source") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --source");
      }
      parsed.source = parseSource(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const summary = await ingestOptionMarks({
    startDate: args.startDate,
    endDate: args.endDate,
    contracts: args.contracts,
    source: args.source,
  });

  console.log("[ingest:option-marks] summary", summary);
}

main().catch((error) => {
  console.error("[ingest:option-marks] failed", error);
  process.exit(1);
});
