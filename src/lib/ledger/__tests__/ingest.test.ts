import fixtureA from "../../../../fixtures/dedup/fixture-a.json";
import fixtureB from "../../../../fixtures/dedup/fixture-b.json";
import fixtureC from "../../../../fixtures/dedup/fixture-c.json";
import fixtureD from "../../../../fixtures/dedup/fixture-d.json";
import { describe, expect, it } from "vitest";
import { computeBrokerTxId, ingestExecutions, type LedgerIngestExecution } from "../ingest";

interface StoredExecution {
  id: string;
  accountId: string;
  brokerTxId: string;
  importId: string;
  rawRowJson: unknown;
}

class InMemoryExecutionStore {
  private rowsById = new Map<string, StoredExecution>();
  private rowsByKey = new Map<string, StoredExecution>();
  private idCounter = 0;

  private buildKey(accountId: string, brokerTxId: string): string {
    return `${accountId}|${brokerTxId}`;
  }

  public get tx() {
    return {
      execution: {
        findFirst: async ({ where }: { where: { accountId: string; brokerTxId: string } }) => {
          const row = this.rowsByKey.get(this.buildKey(where.accountId, where.brokerTxId));
          return row ? { id: row.id } : null;
        },
        update: async ({ where, data }: { where: { id: string }; data: { importId: string; rawRowJson: unknown } }) => {
          const existing = this.rowsById.get(where.id);
          if (!existing) {
            throw new Error(`Missing execution id ${where.id}`);
          }

          const updated: StoredExecution = {
            ...existing,
            importId: data.importId,
            rawRowJson: data.rawRowJson,
          };
          this.rowsById.set(where.id, updated);
          this.rowsByKey.set(this.buildKey(updated.accountId, updated.brokerTxId), updated);
          return updated;
        },
        create: async ({
          data,
        }: {
          data: {
            accountId: string;
            brokerTxId: string;
            importId: string;
            rawRowJson: unknown;
          };
        }) => {
          this.idCounter += 1;
          const id = `execution-${this.idCounter}`;
          const created: StoredExecution = {
            id,
            accountId: data.accountId,
            brokerTxId: data.brokerTxId,
            importId: data.importId,
            rawRowJson: data.rawRowJson,
          };
          this.rowsById.set(id, created);
          this.rowsByKey.set(this.buildKey(created.accountId, created.brokerTxId), created);
          return created;
        },
      },
    };
  }
}

function asLedgerExecutions(rows: unknown[]): LedgerIngestExecution[] {
  return rows.map((row) => {
    const entry = row as Record<string, unknown>;
    return {
      importId: String(entry.importId),
      accountId: String(entry.accountId),
      broker: entry.broker as LedgerIngestExecution["broker"],
      eventTimestamp: new Date(String(entry.eventTimestamp)),
      tradeDate: new Date(String(entry.tradeDate)),
      eventType: entry.eventType as LedgerIngestExecution["eventType"],
      assetClass: entry.assetClass as LedgerIngestExecution["assetClass"],
      symbol: String(entry.symbol),
      instrumentKey: (entry.instrumentKey as string | null) ?? null,
      side: entry.side as LedgerIngestExecution["side"],
      quantity: Number(entry.quantity),
      price: entry.price === null ? null : Number(entry.price),
      grossAmount: entry.grossAmount === null ? null : Number(entry.grossAmount),
      netAmount: entry.netAmount === null ? null : Number(entry.netAmount),
      openingClosingEffect: entry.openingClosingEffect as LedgerIngestExecution["openingClosingEffect"],
      underlyingSymbol: (entry.underlyingSymbol as string | null) ?? null,
      optionType: (entry.optionType as string | null) ?? null,
      strike: entry.strike === null ? null : Number(entry.strike),
      expirationDate: entry.expirationDate ? new Date(String(entry.expirationDate)) : null,
      spreadGroupId: (entry.spreadGroupId as string | null) ?? null,
      brokerRefNumber: (entry.brokerRefNumber as string | null) ?? null,
      sourceRowRef: (entry.sourceRowRef as string | null) ?? null,
      rawRowJson: (entry.rawRowJson as LedgerIngestExecution["rawRowJson"]) ?? null,
    };
  });
}

describe("computeBrokerTxId", () => {
  const baseInput = {
    accountId: "account-1",
    eventTimestamp: "2026-03-01T14:30:00.000Z",
    eventType: "TRADE" as const,
    assetClass: "OPTION" as const,
    instrumentKey: "SPY|CALL|500|2026-03-20",
    symbol: "SPY",
    side: "BUY" as const,
    quantity: 1,
    rawPrice: "100.00",
    openingClosingEffect: "TO_OPEN" as const,
    optionType: "CALL",
    strike: 500,
    expirationDate: "2026-03-20T00:00:00.000Z",
  };

  it("is stable across identical input", () => {
    expect(computeBrokerTxId(baseInput)).toBe(computeBrokerTxId(baseInput));
  });

  it("changes when exec_time differs", () => {
    const a = computeBrokerTxId(baseInput);
    const b = computeBrokerTxId({ ...baseInput, eventTimestamp: "2026-03-02T14:30:00.000Z" });
    expect(a).not.toBe(b);
  });

  it("changes when symbol differs", () => {
    const a = computeBrokerTxId(baseInput);
    const b = computeBrokerTxId({ ...baseInput, symbol: "QQQ" });
    expect(a).not.toBe(b);
  });

  it("changes when quantity differs", () => {
    const a = computeBrokerTxId(baseInput);
    const b = computeBrokerTxId({ ...baseInput, quantity: 2 });
    expect(a).not.toBe(b);
  });

  it("changes when account_id differs", () => {
    const a = computeBrokerTxId(baseInput);
    const b = computeBrokerTxId({ ...baseInput, accountId: "account-2" });
    expect(a).not.toBe(b);
  });

  it("uses broker reference as dedupe tiebreaker when present", () => {
    const baseWithRef = { ...baseInput, brokerRefNumber: "5278319313" };
    const sameRefDifferentPrice = { ...baseWithRef, rawPrice: "101.25" };
    const differentRefSamePrice = { ...baseWithRef, brokerRefNumber: "5278319395" };

    expect(computeBrokerTxId(baseWithRef)).toBe(computeBrokerTxId(sameRefDifferentPrice));
    expect(computeBrokerTxId(baseWithRef)).not.toBe(computeBrokerTxId(differentRefSamePrice));
  });

  it("matches for same canonical trade across brokers", () => {
    const a = asLedgerExecutions(fixtureA)[0];
    const b = asLedgerExecutions(fixtureB)[0];
    if (!a || !b) {
      throw new Error("Missing fixture data for broker comparison.");
    }

    const hashA = computeBrokerTxId({
      accountId: a.accountId,
      eventTimestamp: a.eventTimestamp,
      eventType: a.eventType,
      assetClass: a.assetClass,
      instrumentKey: a.instrumentKey,
      symbol: a.symbol,
      side: a.side,
      quantity: a.quantity,
      rawPrice: typeof a.rawRowJson === "object" && a.rawRowJson && !Array.isArray(a.rawRowJson) ? String(a.rawRowJson.price ?? "") : "",
      openingClosingEffect: a.openingClosingEffect,
      optionType: a.optionType,
      strike: a.strike,
      expirationDate: a.expirationDate,
    });
    const hashB = computeBrokerTxId({
      accountId: b.accountId,
      eventTimestamp: b.eventTimestamp,
      eventType: b.eventType,
      assetClass: b.assetClass,
      instrumentKey: b.instrumentKey,
      symbol: b.symbol,
      side: b.side,
      quantity: b.quantity,
      rawPrice: typeof b.rawRowJson === "object" && b.rawRowJson && !Array.isArray(b.rawRowJson) ? String(b.rawRowJson.price ?? "") : "",
      openingClosingEffect: b.openingClosingEffect,
      optionType: b.optionType,
      strike: b.strike,
      expirationDate: b.expirationDate,
    });

    expect(hashA).toBe(hashB);
  });

});

describe("ingestExecutions fixtures", () => {
  it("Fixture A ingested once: 4 inserted, 0 skipped_duplicate", async () => {
    const store = new InMemoryExecutionStore();
    const result = await ingestExecutions(store.tx as never, asLedgerExecutions(fixtureA));
    expect(result.parsed).toBe(4);
    expect(result.inserted).toBe(4);
    expect(result.skipped_duplicate).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("Fixture B after A: 0 inserted, 4 skipped_duplicate", async () => {
    const store = new InMemoryExecutionStore();
    await ingestExecutions(store.tx as never, asLedgerExecutions(fixtureA));
    const result = await ingestExecutions(store.tx as never, asLedgerExecutions(fixtureB));
    expect(result.parsed).toBe(4);
    expect(result.inserted).toBe(0);
    expect(result.skipped_duplicate).toBe(4);
    expect(result.failed).toBe(0);
  });

  it("keeps the original import lineage when duplicates are skipped", async () => {
    const store = new InMemoryExecutionStore();
    await ingestExecutions(store.tx as never, asLedgerExecutions(fixtureA));
    await ingestExecutions(store.tx as never, asLedgerExecutions(fixtureB));

    const rows = Array.from((store as unknown as { rowsById: Map<string, StoredExecution> }).rowsById.values());
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.importId === "import-a")).toBe(true);
  });

  it("Fixture C after A: 2 inserted, 2 skipped_duplicate", async () => {
    const store = new InMemoryExecutionStore();
    await ingestExecutions(store.tx as never, asLedgerExecutions(fixtureA));
    const result = await ingestExecutions(store.tx as never, asLedgerExecutions(fixtureC));
    expect(result.parsed).toBe(4);
    expect(result.inserted).toBe(2);
    expect(result.skipped_duplicate).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("Fixture D after A: 2 inserted, 2 skipped_duplicate", async () => {
    const store = new InMemoryExecutionStore();
    await ingestExecutions(store.tx as never, asLedgerExecutions(fixtureA));
    const result = await ingestExecutions(store.tx as never, asLedgerExecutions(fixtureD));
    expect(result.parsed).toBe(4);
    expect(result.inserted).toBe(2);
    expect(result.skipped_duplicate).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("skips duplicates when only source_row_ref and spread_group_id differ", async () => {
    const store = new InMemoryExecutionStore();
    const execution: LedgerIngestExecution = {
      importId: "import-a",
      accountId: "account-1",
      broker: "SCHWAB_THINKORSWIM",
      eventTimestamp: new Date("2026-03-01T14:30:00.000Z"),
      tradeDate: new Date("2026-03-01T00:00:00.000Z"),
      eventType: "TRADE",
      assetClass: "OPTION",
      symbol: "SPY",
      instrumentKey: "SPY|CALL|500|2026-03-20",
      side: "BUY",
      quantity: 1,
      price: 100,
      grossAmount: 100,
      netAmount: 100,
      openingClosingEffect: "TO_OPEN",
      underlyingSymbol: "SPY",
      optionType: "CALL",
      strike: 500,
      expirationDate: new Date("2026-03-20T00:00:00.000Z"),
      spreadGroupId: "account-1-100",
      sourceRowRef: "100",
      rawRowJson: { price: "100.00" },
    };

    const first = await ingestExecutions(store.tx as never, [execution]);
    const second = await ingestExecutions(store.tx as never, [
      {
        ...execution,
        importId: "import-b",
        spreadGroupId: "account-1-129",
        sourceRowRef: "129",
      },
    ]);

    expect(first.inserted).toBe(1);
    expect(second.inserted).toBe(0);
    expect(second.skipped_duplicate).toBe(1);
  });

  it("keeps same-timestamp executions when broker reference numbers differ", async () => {
    const store = new InMemoryExecutionStore();
    const baseExecution: LedgerIngestExecution = {
      importId: "import-a",
      accountId: "account-1",
      broker: "SCHWAB_THINKORSWIM",
      eventTimestamp: new Date("2025-12-23T09:31:01.000Z"),
      tradeDate: new Date("2025-12-23T00:00:00.000Z"),
      eventType: "TRADE",
      assetClass: "OPTION",
      symbol: "RKLB",
      instrumentKey: "RKLB|CALL|55|2026-03-20",
      side: "SELL",
      quantity: 2,
      price: 23,
      grossAmount: 46,
      netAmount: 46,
      openingClosingEffect: "TO_CLOSE",
      underlyingSymbol: "RKLB",
      optionType: "CALL",
      strike: 55,
      expirationDate: new Date("2026-03-20T00:00:00.000Z"),
      spreadGroupId: null,
      brokerRefNumber: "5278319313",
      sourceRowRef: "1868",
      rawRowJson: { price: "23.00", refNumber: "5278319313" },
    };

    const first = await ingestExecutions(store.tx as never, [baseExecution, { ...baseExecution, brokerRefNumber: "5278319395", sourceRowRef: "1869", rawRowJson: { price: "23.00", refNumber: "5278319395" } }]);
    const second = await ingestExecutions(store.tx as never, [{ ...baseExecution, importId: "import-b", sourceRowRef: "9999", rawRowJson: { price: "23.00", refNumber: "5278319313" } }]);

    expect(first.inserted).toBe(2);
    expect(first.skipped_duplicate).toBe(0);
    expect(second.inserted).toBe(0);
    expect(second.skipped_duplicate).toBe(1);
  });
});
