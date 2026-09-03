import { describe, expect, it } from "vitest";
import { recommendationIngestSchema, scopeIncompleteRecIds } from "./types";

const baseRow = {
  recId: "VS-20260901-1400-01-R1/P2-01",
  lineageId: "VS-20260901-1400-01",
  localRecId: "P2-01",
  pass: "PASS2",
  disposition: "VALIDATED",
  asOf: "2026-09-01",
  ticker: "MSFT",
};

describe("recommendationIngestSchema scope (#349)", () => {
  it("accepts an unscoped row unchanged (LEGACY_UNSCOPED back-compat)", () => {
    const parsed = recommendationIngestSchema.parse(baseRow);
    expect(parsed.runId).toBeUndefined();
    expect(parsed.legalEntitySlug).toBeUndefined();
    expect(parsed.environment).toBeUndefined();
  });

  it("accepts a fully scoped row and normalizes the kb lowercase environment", () => {
    const parsed = recommendationIngestSchema.parse({
      ...baseRow,
      runId: "VS-20260901-1400-01-R1",
      legalEntitySlug: "personal-vkapella",
      environment: "live",
    });
    expect(parsed.environment).toBe("LIVE");
  });

  it("rejects an environment outside live/paper", () => {
    expect(recommendationIngestSchema.safeParse({ ...baseRow, environment: "sandbox" }).success).toBe(false);
  });
});

describe("scopeIncompleteRecIds", () => {
  it("names rows that carry some but not all of runId, legalEntitySlug, environment", () => {
    expect(
      scopeIncompleteRecIds([
        { recId: "full", runId: "r", legalEntitySlug: "e", environment: "LIVE" },
        { recId: "none", runId: null, legalEntitySlug: null, environment: null },
        { recId: "run-only", runId: "r", legalEntitySlug: null, environment: null },
        { recId: "no-env", runId: "r", legalEntitySlug: "e", environment: undefined },
      ]),
    ).toEqual(["run-only", "no-env"]);
  });
});
