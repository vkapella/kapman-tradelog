import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecommendationIngest } from "./types";

const upsertMocks = vi.hoisted(() => ({
  legalEntity: { findMany: vi.fn() },
  tradeRecommendation: { findMany: vi.fn(), upsert: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    legalEntity: upsertMocks.legalEntity,
    tradeRecommendation: upsertMocks.tradeRecommendation,
    $transaction: upsertMocks.$transaction,
  },
}));

function row(overrides: Partial<RecommendationIngest> = {}): RecommendationIngest {
  return {
    recId: "VS-20260901-1400-01-R1/P2-01",
    lineageId: "VS-20260901-1400-01",
    localRecId: "P2-01",
    pass: "PASS2",
    disposition: "VALIDATED",
    asOf: "2026-09-01",
    ticker: "MSFT",
    ...overrides,
  };
}

const scoped = {
  runId: "VS-20260901-1400-01-R1",
  legalEntitySlug: "personal-vkapella",
  environment: "LIVE" as const,
};

describe("upsertRecommendations scope rules (#349)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertMocks.legalEntity.findMany.mockResolvedValue([{ id: "le_personal", slug: "personal-vkapella" }]);
    upsertMocks.tradeRecommendation.findMany.mockResolvedValue([]);
    upsertMocks.tradeRecommendation.upsert.mockImplementation((args: unknown) => args);
    upsertMocks.$transaction.mockResolvedValue([]);
  });

  it("stamps a scoped row with the resolved legal entity id", async () => {
    const { upsertRecommendations } = await import("./upsert");
    const result = await upsertRecommendations([row(scoped)]);

    expect(result).toEqual({ received: 1, created: 1, updated: 0 });
    const [call] = upsertMocks.$transaction.mock.calls[0][0] as Array<{ create: Record<string, unknown> }>;
    expect(call.create).toMatchObject({ runId: scoped.runId, legalEntityId: "le_personal", environment: "LIVE" });
  });

  it("refuses an unknown legal entity slug", async () => {
    upsertMocks.legalEntity.findMany.mockResolvedValue([]);
    const { upsertRecommendations, RecommendationIngestError } = await import("./upsert");

    await expect(upsertRecommendations([row(scoped)])).rejects.toMatchObject({
      code: "UNKNOWN_LEGAL_ENTITY",
      details: ["unknown legal entity slug: personal-vkapella"],
    });
    await expect(upsertRecommendations([row(scoped)])).rejects.toBeInstanceOf(RecommendationIngestError);
    expect(upsertMocks.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a recId that already exists under a different run", async () => {
    upsertMocks.tradeRecommendation.findMany.mockResolvedValue([{ recId: row().recId, runId: "VS-20260901-1400-01-R2" }]);
    const { upsertRecommendations } = await import("./upsert");

    await expect(upsertRecommendations([row(scoped)])).rejects.toMatchObject({
      code: "REC_ID_RUN_MISMATCH",
      status: 409,
    });
    expect(upsertMocks.$transaction).not.toHaveBeenCalled();
  });

  it("lets a scoped re-POST stamp a legacy unscoped row once, counted as updated", async () => {
    upsertMocks.tradeRecommendation.findMany.mockResolvedValue([{ recId: row().recId, runId: null }]);
    const { upsertRecommendations } = await import("./upsert");

    const result = await upsertRecommendations([row(scoped)]);

    expect(result).toEqual({ received: 1, created: 0, updated: 1 });
    const [call] = upsertMocks.$transaction.mock.calls[0][0] as Array<{ update: Record<string, unknown> }>;
    expect(call.update).toMatchObject({ runId: scoped.runId, legalEntityId: "le_personal", environment: "LIVE" });
  });

  it("never strips an existing scope on an unscoped re-POST", async () => {
    upsertMocks.tradeRecommendation.findMany.mockResolvedValue([{ recId: row().recId, runId: scoped.runId }]);
    const { upsertRecommendations } = await import("./upsert");

    await upsertRecommendations([row()]);

    const [call] = upsertMocks.$transaction.mock.calls[0][0] as Array<{ update: Record<string, unknown> }>;
    expect("runId" in call.update).toBe(false);
    expect("legalEntityId" in call.update).toBe(false);
  });
});
