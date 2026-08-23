import { z } from "zod";

/**
 * Zod twins of the record grammar in kapman-kb
 * engineering_only/HITL_QUEUE_CONTRACT_v4.0.md. Contract discipline:
 * present / null / absent are three distinct states inside the proposal
 * snapshot — the snapshot is stored verbatim and never normalized; nothing
 * is synthesized for null lineage fields.
 */

const isoDateTime = z.string().datetime({ offset: true });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

export const QUEUE_STATEMENTS = ["ACCEPT", "OVERRIDE", "ESTIMATE", "DEFER"] as const;
export const QUEUE_RESOLUTIONS = [
  "PIPELINE_ACCEPTED_FRESH",
  "DECLARED_ACCEPT",
  "DECLARED_OVERRIDE",
  "ESTIMATION_PATH",
  "DEFERRED",
  "RETURNED_DIVERGED",
] as const;

export const queueItemIngestSchema = z.object({
  queue_schema_version: z.string().min(1),
  queue_item_id: z.string().min(1),
  kind: z.literal("WYCKOFF_FLAGGED"),
  created_at: isoDateTime,
  source: z.object({
    lineage_id: z.string().min(1),
    rec_id: z.string().min(1).nullable(),
    exported_at: isoDateTime,
    as_of: isoDate,
    viewer_schema_version: z.string().min(1).nullable(),
  }),
  ticker: z.string().min(1).regex(/^[A-Z.$^]+$/, "ticker must be uppercase"),
  proposal_snapshot: z.object({
    proposal_status: z.literal("pipeline-flagged"),
    operator_prompt: z.string().min(1),
    decision_inputs: z.record(z.unknown()),
    evaluation: z.object({
      gating_confidence: z.number().nullable(),
      gate_result: z.literal("pipeline-flagged"),
      flag_reasons: z.array(z.string().min(1)).min(1),
      freshness_valid: z.boolean(),
    }).passthrough(),
  }).passthrough(),
  proposal_hash: z.string().regex(/^[0-9a-f]{64}$/, "lowercase-hex sha256"),
});

export type QueueItemIngest = z.infer<typeof queueItemIngestSchema>;

export const declarationCreateSchema = z
  .object({
    declaration_id: z.string().min(1).optional(),
    proposal_hash: z.string().regex(/^[0-9a-f]{64}$/),
    statement: z.enum(QUEUE_STATEMENTS),
    override_reading: z
      .object({
        regime: z.string().min(1),
        phase: z.string().min(1).nullable(),
      })
      .nullable(),
    operator_note: z.string().nullable(),
    stated_at: isoDateTime.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.statement === "OVERRIDE" && val.override_reading === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "override_reading must be non-null when statement is OVERRIDE",
        path: ["override_reading"],
      });
    }
    if (val.statement !== "OVERRIDE" && val.override_reading !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "override_reading must be null unless statement is OVERRIDE",
        path: ["override_reading"],
      });
    }
  });

export type DeclarationCreate = z.infer<typeof declarationCreateSchema>;

export const outcomeCreateSchema = z.object({
  outcome_id: z.string().min(1),
  queue_item_id: z.string().min(1),
  declaration_id: z.string().min(1).nullable(),
  consumed_at: isoDateTime,
  consuming_lineage_id: z.string().min(1),
  comparison: z.object({
    matches: z.boolean(),
    diverged_fields: z.array(z.string()),
  }),
  resolution: z.enum(QUEUE_RESOLUTIONS),
  resulting_status: z.string().min(1),
});

export type OutcomeCreate = z.infer<typeof outcomeCreateSchema>;

/** Derived — never stored on the item (contract: status is derived state). */
export type QueueDerivedStatus = "PENDING" | "DECLARED" | "CONSUMED";

export function deriveStatus(declarationCount: number, hasOutcome: boolean): QueueDerivedStatus {
  if (hasOutcome) return "CONSUMED";
  return declarationCount > 0 ? "DECLARED" : "PENDING";
}
