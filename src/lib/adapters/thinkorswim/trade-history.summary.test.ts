import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseThinkorswimTradeHistory } from "./trade-history";

describe("parseThinkorswimTradeHistory account summary snapshot enrichment", () => {
  it("attaches statement-date totalCash metadata to snapshots", () => {
    const fixture = readFileSync("fixtures/2026-04-06-AccountStatement-2.csv", "utf8");
    const parsed = parseThinkorswimTradeHistory(fixture);

    const statementSnapshot = parsed.snapshots.find((snapshot) => snapshot.snapshotDate.toISOString().startsWith("2026-04-06"));

    expect(statementSnapshot).toBeDefined();
    expect(statementSnapshot?.totalCash).toBe(91350.65);
    expect(statementSnapshot?.brokerNetLiquidationValue).toBe(90458.65);
  });
});
