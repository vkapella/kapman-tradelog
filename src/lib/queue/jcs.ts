import { createHash } from "node:crypto";

/**
 * RFC 8785 (JCS) canonical JSON + SHA-256 — the proposal_hash construction
 * pinned by kapman-kb engineering_only/HITL_QUEUE_CONTRACT_v4.0.md.
 *
 * JCS is defined on ECMAScript serialization semantics: JSON.stringify's
 * number and string formatting IS the canonical form; canonicalization
 * reduces to recursive lexicographic key ordering (UTF-16 code-unit sort,
 * which is JavaScript's default sort). Keys with undefined values are
 * dropped, matching JSON.stringify. Golden-tested against RFC 8785 sample
 * behavior in jcs.test.ts.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (value === undefined) {
      throw new Error("cannot canonicalize undefined at top level");
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error("cannot canonicalize non-finite number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    // JSON.stringify serializes undefined array elements as null; mirror it.
    return "[" + value.map((v) => (v === undefined ? "null" : canonicalize(v))).join(",") + "]";
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(record[k])).join(",") + "}";
}

export function proposalHash(snapshot: unknown): string {
  return createHash("sha256").update(canonicalize(snapshot), "utf8").digest("hex");
}
