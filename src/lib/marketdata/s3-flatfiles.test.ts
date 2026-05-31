import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildDayAggsKey, downloadDayAggsCsvForDate, listAvailableDatesInRange, type S3LikeClient } from "./s3-flatfiles";

class MockS3Client implements S3LikeClient {
  public readonly calls: Array<{ name: string; input: Record<string, unknown> }> = [];

  public constructor(private readonly responder: (command: ListObjectsV2Command | GetObjectCommand) => Promise<unknown>) {}

  public async send(command: ListObjectsV2Command | GetObjectCommand): Promise<unknown> {
    this.calls.push({
      name: command.constructor.name,
      input: ((command as unknown as { input?: Record<string, unknown> }).input ?? {}),
    });
    return this.responder(command);
  }
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

describe("s3-flatfiles", () => {
  it("builds day aggregate keys using year/month/date layout", () => {
    expect(buildDayAggsKey(dateOnly("2024-02-09"), "us_stocks_sip/day_aggs_v1")).toBe("us_stocks_sip/day_aggs_v1/2024/02/2024-02-09.csv.gz");
  });

  it("lists available dates by month prefix with pagination", async () => {
    const responses: Record<string, { Contents?: Array<{ Key?: string }>; NextContinuationToken?: string }> = {
      "us_stocks_sip/day_aggs_v1/2024/01/|": {
        Contents: [
          { Key: "us_stocks_sip/day_aggs_v1/2024/01/2024-01-01.csv.gz" },
          { Key: "us_stocks_sip/day_aggs_v1/2024/01/2024-01-02.csv.gz" },
          { Key: "us_stocks_sip/day_aggs_v1/2024/01/readme.txt" },
        ],
        NextContinuationToken: "jan-page-2",
      },
      "us_stocks_sip/day_aggs_v1/2024/01/|jan-page-2": {
        Contents: [{ Key: "us_stocks_sip/day_aggs_v1/2024/01/2024-01-15.csv.gz" }],
      },
      "us_stocks_sip/day_aggs_v1/2024/02/|": {
        Contents: [
          { Key: "us_stocks_sip/day_aggs_v1/2024/02/2024-02-03.csv.gz" },
          { Key: "us_stocks_sip/day_aggs_v1/2024/02/2024-02-07.csv.gz" },
        ],
      },
    };

    const client = new MockS3Client(async (command) => {
      if (!(command instanceof ListObjectsV2Command)) {
        throw new Error("Expected ListObjectsV2Command");
      }

      const prefix = command.input.Prefix as string;
      const token = (command.input.ContinuationToken as string | undefined) ?? "";
      return responses[`${prefix}|${token}`] ?? { Contents: [] };
    });

    const dates = await listAvailableDatesInRange(client, {
      bucket: "flatfiles",
      prefix: "us_stocks_sip/day_aggs_v1",
      startDate: dateOnly("2024-01-02"),
      endDate: dateOnly("2024-02-05"),
    });

    expect(dates.map((entry) => entry.toISOString().slice(0, 10))).toEqual(["2024-01-02", "2024-01-15", "2024-02-03"]);

    const listCalls = client.calls.filter((call) => call.name === "ListObjectsV2Command");
    expect(listCalls).toHaveLength(3);
    expect(listCalls.map((call) => call.input.Prefix)).toEqual([
      "us_stocks_sip/day_aggs_v1/2024/01/",
      "us_stocks_sip/day_aggs_v1/2024/01/",
      "us_stocks_sip/day_aggs_v1/2024/02/",
    ]);
  });

  it("downloads and gunzips a day file", async () => {
    const csv = "ticker,o,h,l,c,v\nAAPL,180,182,179,181,1000\n";

    const client = new MockS3Client(async (command) => {
      if (!(command instanceof GetObjectCommand)) {
        throw new Error("Expected GetObjectCommand");
      }
      return { Body: Readable.from([gzipSync(Buffer.from(csv, "utf8"))]) };
    });

    const text = await downloadDayAggsCsvForDate(client, {
      bucket: "flatfiles",
      prefix: "us_stocks_sip/day_aggs_v1",
      markDate: dateOnly("2024-01-03"),
    });

    expect(text).toBe(csv);
  });

  it("returns null for missing keys", async () => {
    const client = new MockS3Client(async (command) => {
      if (!(command instanceof GetObjectCommand)) {
        throw new Error("Expected GetObjectCommand");
      }

      const error = new Error("missing");
      (error as Error & { name: string }).name = "NoSuchKey";
      throw error;
    });

    const text = await downloadDayAggsCsvForDate(client, {
      bucket: "flatfiles",
      prefix: "us_stocks_sip/day_aggs_v1",
      markDate: dateOnly("2024-01-04"),
    });

    expect(text).toBeNull();
  });
});
