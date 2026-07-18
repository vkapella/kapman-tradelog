import { prisma } from "../src/lib/db/prisma";
import {
  DEFAULT_PIPELINE_LEASE_MINUTES,
  DEFAULT_PUBLICATION_LAG_DAYS,
  parsePositiveIntegerSetting,
  runScheduledMarketDataPipeline,
  sanitizePipelineError,
} from "../src/lib/marketdata/scheduled-pipeline";

interface ParsedArgs {
  startDate?: Date;
  endDate?: Date;
  publicationLagDays?: number;
}

function parseDateOnly(value: string, flagName: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${flagName} date format: ${value}. Expected YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid ${flagName} date value: ${value}.`);
  }
  return parsed;
}

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (token === "--start" || token === "--end" || token === "--publication-lag-days") {
      if (!value) {
        throw new Error(`Missing value for ${token}`);
      }
      if (token === "--start") {
        result.startDate = parseDateOnly(value, token);
      } else if (token === "--end") {
        result.endDate = parseDateOnly(value, token);
      } else {
        result.publicationLagDays = parsePositiveIntegerSetting(value, DEFAULT_PUBLICATION_LAG_DAYS, token);
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const publicationLagDays = args.publicationLagDays ?? parsePositiveIntegerSetting(
    process.env.MARKET_DATA_PUBLICATION_LAG_DAYS,
    DEFAULT_PUBLICATION_LAG_DAYS,
    "MARKET_DATA_PUBLICATION_LAG_DAYS",
  );
  const leaseMinutes = parsePositiveIntegerSetting(
    process.env.MARKET_DATA_PIPELINE_LEASE_MINUTES,
    DEFAULT_PIPELINE_LEASE_MINUTES,
    "MARKET_DATA_PIPELINE_LEASE_MINUTES",
  );

  const summary = await runScheduledMarketDataPipeline({
    ...args,
    publicationLagDays,
    leaseMinutes,
  });
  console.log(JSON.stringify({ component: "scheduled-market-data", event: "summary", ...summary }));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      component: "scheduled-market-data",
      event: "fatal",
      error: sanitizePipelineError(error),
    }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
