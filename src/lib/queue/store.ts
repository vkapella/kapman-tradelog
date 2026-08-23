import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { proposalHash } from "@/lib/queue/jcs";
import { deriveStatus, type DeclarationCreate, type OutcomeCreate, type QueueItemIngest } from "@/lib/queue/types";

/**
 * Queue persistence per kapman-kb engineering_only/HITL_QUEUE_CONTRACT_v4.0.md:
 * - queue_item_id is the idempotency key; same id + same hash = no-op,
 *   same id + different hash = conflict, rejected, never an update;
 * - queue items and declarations are immutable/append-only; status is derived;
 * - a declaration's proposal_hash must match the item's (tamper evidence);
 * - one outcome per queue item — consumed at most once.
 */

export class QueueConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueConflictError";
  }
}

export class QueueValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueValidationError";
  }
}

export class QueueNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueNotFoundError";
  }
}

export async function ingestQueueItem(item: QueueItemIngest): Promise<{ status: "created" | "duplicate" }> {
  const computed = proposalHash(item.proposal_snapshot);
  if (computed !== item.proposal_hash) {
    throw new QueueValidationError(
      `proposal_hash mismatch: payload declares ${item.proposal_hash} but the snapshot canonicalizes to ${computed}`,
    );
  }
  const existing = await prisma.queueItem.findUnique({
    where: { queueItemId: item.queue_item_id },
    select: { proposalHash: true },
  });
  if (existing) {
    if (existing.proposalHash === item.proposal_hash) {
      return { status: "duplicate" }; // re-delivery no-op
    }
    throw new QueueConflictError(
      `queue_item_id ${item.queue_item_id} already exists with a different proposal_hash — contract conflict, never an update`,
    );
  }
  await prisma.queueItem.create({
    data: {
      queueItemId: item.queue_item_id,
      queueSchemaVersion: item.queue_schema_version,
      kind: item.kind,
      createdAtSource: new Date(item.created_at),
      ticker: item.ticker,
      lineageId: item.source.lineage_id,
      recId: item.source.rec_id,
      exportedAt: new Date(item.source.exported_at),
      asOf: new Date(`${item.source.as_of}T00:00:00.000Z`),
      viewerSchemaVersion: item.source.viewer_schema_version,
      proposalSnapshot: item.proposal_snapshot as Prisma.InputJsonValue,
      proposalHash: item.proposal_hash,
    },
  });
  return { status: "created" };
}

export async function createDeclaration(queueItemId: string, body: DeclarationCreate) {
  const item = await prisma.queueItem.findUnique({
    where: { queueItemId },
    select: { proposalHash: true, outcomes: { select: { id: true } } },
  });
  if (!item) throw new QueueNotFoundError(`queue item ${queueItemId} not found`);
  if (item.proposalHash !== body.proposal_hash) {
    throw new QueueValidationError(
      "proposal_hash does not match the queue item — the declaration must echo the proposal the operator saw; rejected, never repaired",
    );
  }
  if (item.outcomes.length > 0) {
    throw new QueueConflictError(
      `queue item ${queueItemId} already has a fresh-run outcome — it is consumed; a new proposal requires a new queue item`,
    );
  }
  return prisma.queueDeclaration.create({
    data: {
      declarationId: body.declaration_id ?? randomUUID(),
      queueItemId,
      proposalHash: body.proposal_hash,
      statement: body.statement,
      overrideReading: body.override_reading === null ? Prisma.JsonNull : (body.override_reading as Prisma.InputJsonValue),
      operatorNote: body.operator_note,
      statedAt: body.stated_at ? new Date(body.stated_at) : new Date(),
    },
  });
}

export async function createOutcome(body: OutcomeCreate) {
  const item = await prisma.queueItem.findUnique({
    where: { queueItemId: body.queue_item_id },
    select: {
      outcomes: { select: { outcomeId: true } },
      declarations: { select: { declarationId: true } },
    },
  });
  if (!item) throw new QueueNotFoundError(`queue item ${body.queue_item_id} not found`);
  if (item.outcomes.length > 0) {
    if (item.outcomes[0].outcomeId === body.outcome_id) return { status: "duplicate" as const };
    throw new QueueConflictError(
      `queue item ${body.queue_item_id} is already consumed — one outcome per item`,
    );
  }
  if (body.declaration_id !== null &&
      !item.declarations.some((d) => d.declarationId === body.declaration_id)) {
    throw new QueueValidationError(
      `declaration ${body.declaration_id} does not belong to queue item ${body.queue_item_id}`,
    );
  }
  await prisma.queueOutcome.create({
    data: {
      outcomeId: body.outcome_id,
      queueItemId: body.queue_item_id,
      declarationId: body.declaration_id,
      consumedAt: new Date(body.consumed_at),
      consumingLineageId: body.consuming_lineage_id,
      comparison: body.comparison as Prisma.InputJsonValue,
      resolution: body.resolution,
      resultingStatus: body.resulting_status,
    },
  });
  return { status: "created" as const };
}

export interface QueueItemView {
  queueItemId: string;
  kind: string;
  ticker: string;
  lineageId: string;
  recId: string | null;
  asOf: string;
  createdAtSource: string;
  proposalSnapshot: unknown;
  proposalHash: string;
  status: "PENDING" | "DECLARED" | "CONSUMED";
  effectiveDeclaration: {
    declarationId: string;
    statement: string;
    overrideReading: unknown;
    operatorNote: string | null;
    statedAt: string;
    supersededCount: number;
  } | null;
  outcome: { resolution: string; resultingStatus: string; consumedAt: string } | null;
}

function toView(row: {
  queueItemId: string; kind: string; ticker: string; lineageId: string;
  recId: string | null; asOf: Date; createdAtSource: Date;
  proposalSnapshot: Prisma.JsonValue; proposalHash: string;
  declarations: { declarationId: string; statement: string; overrideReading: Prisma.JsonValue;
    operatorNote: string | null; statedAt: Date }[];
  outcomes: { resolution: string; resultingStatus: string; consumedAt: Date }[];
}): QueueItemView {
  // Effective declaration = latest stated_at; earlier ones are superseded history.
  const sorted = [...row.declarations].sort((a, b) => b.statedAt.getTime() - a.statedAt.getTime());
  const effective = sorted[0] ?? null;
  const outcome = row.outcomes[0] ?? null;
  return {
    queueItemId: row.queueItemId,
    kind: row.kind,
    ticker: row.ticker,
    lineageId: row.lineageId,
    recId: row.recId,
    asOf: row.asOf.toISOString().slice(0, 10),
    createdAtSource: row.createdAtSource.toISOString(),
    proposalSnapshot: row.proposalSnapshot,
    proposalHash: row.proposalHash,
    status: deriveStatus(row.declarations.length, row.outcomes.length > 0),
    effectiveDeclaration: effective
      ? {
          declarationId: effective.declarationId,
          statement: effective.statement,
          overrideReading: effective.overrideReading,
          operatorNote: effective.operatorNote,
          statedAt: effective.statedAt.toISOString(),
          supersededCount: sorted.length - 1,
        }
      : null,
    outcome: outcome
      ? {
          resolution: outcome.resolution,
          resultingStatus: outcome.resultingStatus,
          consumedAt: outcome.consumedAt.toISOString(),
        }
      : null,
  };
}

export async function listQueueItems(filter: {
  status?: "PENDING" | "DECLARED" | "CONSUMED";
  ticker?: string;
  lineageId?: string;
}): Promise<QueueItemView[]> {
  const rows = await prisma.queueItem.findMany({
    where: {
      ...(filter.ticker ? { ticker: filter.ticker.toUpperCase() } : {}),
      ...(filter.lineageId ? { lineageId: filter.lineageId } : {}),
    },
    include: {
      declarations: {
        select: { declarationId: true, statement: true, overrideReading: true,
                  operatorNote: true, statedAt: true },
      },
      outcomes: { select: { resolution: true, resultingStatus: true, consumedAt: true } },
    },
    orderBy: { createdAtSource: "desc" },
  });
  const views = rows.map(toView);
  return filter.status ? views.filter((v) => v.status === filter.status) : views;
}
