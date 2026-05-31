import { ingestEquityMarks } from "../src/lib/marketdata/ingest-equity-marks";

interface ParsedArgs {
  startDate?: Date;
  endDate?: Date;
  symbols?: string[];
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

function parseSymbols(value: string): string[] {
  return value
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => symbol.length > 0);
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

    if (token === "--symbols") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --symbols");
      }
      parsed.symbols = parseSymbols(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const summary = await ingestEquityMarks({
    startDate: args.startDate,
    endDate: args.endDate,
    symbols: args.symbols,
  });

  console.log("[ingest:equity-marks] summary", summary);
}

main().catch((error) => {
  console.error("[ingest:equity-marks] failed", error);
  process.exit(1);
});
