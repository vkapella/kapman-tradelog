import { describe, expect, it } from "vitest";
import { proposalHash } from "./jcs";
import { declarationCreateSchema, deriveStatus, queueItemIngestSchema } from "./types";

const SNAPSHOT = {
  proposal_status: "pipeline-flagged",
  operator_prompt: "LEU flagged: dealer regime reversal. Accept / Override / Estimate / Defer?",
  decision_inputs: {
    regime: "accumulation",
    phase: null,
    regime_confidence: 0.62,
    // last_event deliberately ABSENT — three-state contract
  },
  evaluation: {
    gating_confidence: 0.62,
    gate_result: "pipeline-flagged",
    flag_reasons: ["material dealer regime reversal: +45.98 -> -43.72"],
    freshness_valid: true,
  },
};

function validItem() {
  return {
    queue_schema_version: "1.0",
    queue_item_id: "VS-20260821-1425-01/P1-016/Q1",
    kind: "WYCKOFF_FLAGGED" as const,
    created_at: "2026-08-21T15:05:00.000-04:00",
    source: {
      lineage_id: "VS-20260821-1425-01",
      rec_id: "VS-20260821-1425-01/P1-016",
      exported_at: "2026-08-21T14:25:03.000Z",
      as_of: "2026-08-21",
      viewer_schema_version: "2.1",
    },
    ticker: "LEU",
    proposal_snapshot: SNAPSHOT,
    proposal_hash: proposalHash(SNAPSHOT),
  };
}

describe("queueItemIngestSchema", () => {
  it("accepts a contract-shaped item", () => {
    expect(queueItemIngestSchema.safeParse(validItem()).success).toBe(true);
  });

  it("accepts explicit-null lineage fields but not their absence", () => {
    const item = validItem();
    item.source.rec_id = null as never;
    item.source.viewer_schema_version = null as never;
    expect(queueItemIngestSchema.safeParse(item).success).toBe(true);
    const missing = validItem() as Record<string, unknown>;
    delete (missing.source as Record<string, unknown>).rec_id;
    expect(queueItemIngestSchema.safeParse(missing).success).toBe(false);
  });

  it("rejects the wrong kind, empty flag_reasons, and malformed hashes", () => {
    const wrongKind = { ...validItem(), kind: "PORTFOLIO_HOLD" };
    expect(queueItemIngestSchema.safeParse(wrongKind).success).toBe(false);

    const noReasons = validItem();
    noReasons.proposal_snapshot = {
      ...SNAPSHOT,
      evaluation: { ...SNAPSHOT.evaluation, flag_reasons: [] },
    };
    expect(queueItemIngestSchema.safeParse(noReasons).success).toBe(false);

    const badHash = { ...validItem(), proposal_hash: "NOT-A-HASH" };
    expect(queueItemIngestSchema.safeParse(badHash).success).toBe(false);
  });
});

describe("declarationCreateSchema", () => {
  const base = {
    proposal_hash: proposalHash(SNAPSHOT),
    operator_note: null,
  };

  it("requires override_reading exactly when statement is OVERRIDE", () => {
    expect(
      declarationCreateSchema.safeParse({ ...base, statement: "OVERRIDE", override_reading: null }).success,
    ).toBe(false);
    expect(
      declarationCreateSchema.safeParse({
        ...base,
        statement: "OVERRIDE",
        override_reading: { regime: "markup", phase: null },
      }).success,
    ).toBe(true);
    expect(
      declarationCreateSchema.safeParse({
        ...base,
        statement: "ACCEPT",
        override_reading: { regime: "markup", phase: null },
      }).success,
    ).toBe(false);
    expect(
      declarationCreateSchema.safeParse({ ...base, statement: "DEFER", override_reading: null }).success,
    ).toBe(true);
  });
});

describe("deriveStatus", () => {
  it("derives, never stores", () => {
    expect(deriveStatus(0, false)).toBe("PENDING");
    expect(deriveStatus(2, false)).toBe("DECLARED");
    expect(deriveStatus(1, true)).toBe("CONSUMED");
    expect(deriveStatus(0, true)).toBe("CONSUMED");
  });
});
