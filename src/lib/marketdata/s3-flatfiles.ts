import { GetObjectCommand, ListObjectsV2Command, S3Client, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { gunzipSync } from "node:zlib";
import { Readable } from "node:stream";

const DEFAULT_REGION = "us-east-1";
export const DEFAULT_EQUITY_S3_PREFIX = "us_stocks_sip/day_aggs_v1";

export interface S3FlatfilesConfig {
  endpointUrl: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  equityPrefix: string;
}

export interface S3LikeClient {
  send(command: ListObjectsV2Command | GetObjectCommand): Promise<unknown>;
}

export function defaultS3FlatfilesConfig(env: NodeJS.ProcessEnv = process.env): S3FlatfilesConfig {
  const requiredVars = ["S3_ENDPOINT_URL", "S3_BUCKET", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"] as const;
  const missingVars = requiredVars.filter((key) => {
    const value = env[key];
    return typeof value !== "string" || value.trim().length === 0;
  });

  if (missingVars.length > 0) {
    throw new Error(`Missing required S3 env vars: ${missingVars.join(", ")}`);
  }

  return {
    endpointUrl: env.S3_ENDPOINT_URL as string,
    bucket: env.S3_BUCKET as string,
    accessKeyId: env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY as string,
    equityPrefix: env.POLYGON_S3_EQUITY_PREFIX?.trim() || DEFAULT_EQUITY_S3_PREFIX,
  };
}

export function createS3FlatfilesClient(config: S3FlatfilesConfig): S3Client {
  return new S3Client({
    endpoint: config.endpointUrl,
    region: DEFAULT_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function toDateOnlyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateOnlyUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isDateWithinRange(date: Date, startDate: Date, endDate: Date): boolean {
  const time = date.getTime();
  return time >= startDate.getTime() && time <= endDate.getTime();
}

function toUtcMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function listMonthPrefixes(startDate: Date, endDate: Date, prefix: string): string[] {
  const startMonth = toUtcMonthStart(startDate);
  const endMonth = toUtcMonthStart(endDate);
  const monthPrefixes: string[] = [];

  for (let cursor = startMonth; cursor.getTime() <= endMonth.getTime(); cursor = addUtcMonths(cursor, 1)) {
    const year = cursor.getUTCFullYear().toString().padStart(4, "0");
    const month = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    monthPrefixes.push(`${prefix}/${year}/${month}/`);
  }

  return monthPrefixes;
}

export function buildDayAggsKey(markDate: Date, prefix: string = DEFAULT_EQUITY_S3_PREFIX): string {
  const dateOnly = toDateOnlyUtc(markDate);
  const [year, month] = dateOnly.split("-");
  return `${prefix}/${year}/${month}/${dateOnly}.csv.gz`;
}

export async function listAvailableDatesInRange(client: S3LikeClient, params: {
  bucket: string;
  prefix: string;
  startDate: Date;
  endDate: Date;
}): Promise<Date[]> {
  const { bucket, prefix, startDate, endDate } = params;
  if (startDate.getTime() > endDate.getTime()) {
    return [];
  }

  const found = new Set<string>();

  for (const monthPrefix of listMonthPrefixes(startDate, endDate, prefix)) {
    let continuationToken: string | undefined;

    do {
      const response = (await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: monthPrefix,
          ContinuationToken: continuationToken,
        }),
      )) as {
        Contents?: Array<{ Key?: string }>;
        NextContinuationToken?: string;
      };

      for (const entry of response.Contents ?? []) {
        const key = entry.Key;
        if (!key) {
          continue;
        }
        const match = key.match(/(\d{4}-\d{2}-\d{2})\.csv\.gz$/);
        if (!match) {
          continue;
        }
        const dateOnly = match[1];
        const date = parseDateOnlyUtc(dateOnly);
        if (isDateWithinRange(date, startDate, endDate)) {
          found.add(dateOnly);
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
  }

  return Array.from(found)
    .sort((left, right) => left.localeCompare(right))
    .map((dateOnly) => parseDateOnlyUtc(dateOnly));
}

async function bodyToBuffer(body: GetObjectCommandOutput["Body"]): Promise<Buffer> {
  if (!body) {
    throw new Error("S3 object response body was empty.");
  }

  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
        continue;
      }
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  if (typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === "function") {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(bytes);
  }

  throw new Error("Unsupported S3 response body type.");
}

export async function downloadDayAggsCsvForDate(client: S3LikeClient, params: {
  bucket: string;
  prefix: string;
  markDate: Date;
}): Promise<string | null> {
  const key = buildDayAggsKey(params.markDate, params.prefix);

  let response: GetObjectCommandOutput;
  try {
    response = (await client.send(
      new GetObjectCommand({
        Bucket: params.bucket,
        Key: key,
      }),
    )) as GetObjectCommandOutput;
  } catch (error) {
    const errorName = (error as { name?: string }).name;
    if (errorName === "NoSuchKey" || errorName === "NotFound") {
      return null;
    }
    throw error;
  }

  const zippedBody = await bodyToBuffer(response.Body);
  try {
    return gunzipSync(zippedBody).toString("utf8");
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to gunzip S3 flat-file key ${key}: ${cause}`);
  }
}
