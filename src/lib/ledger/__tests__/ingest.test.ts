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
      sourceRowRef: (entry.sourceRowRef as string | null) ?? null,
      rawRowJson: (entry.rawRowJson as LedgerIngestExecution["rawRowJson"]) ?? null,
    };
  });
}

describe("computeBrokerTxId", () => {
  const baseInput = {
    accountId: "account-1",
    eventTimestamp: "2026-03-01T14:30:00.000Z",
    symbol: "SPY",
    side: "BUY" as const,
    quantity: 1,
    rawPrice: "100.00",
    spreadGroupId: null,
    sourceRowRef: "1",
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

  it("matches for same canonical trade across brokers", () => {
    const a = asLedgerExecutions(fixtureA)[0];
    const b = asLedgerExecutions(fixtureB)[0];
    if (!a || !b) {
      throw new Error("Missing fixture data for broker comparison.");
    }

    const hashA = computeBrokerTxId({
      accountId: a.accountId,
      eventTimestamp: a.eventTimestamp,
      symbol: a.symbol,
      side: a.side,
      quantity: a.quantity,
      rawPrice: typeof a.rawRowJson === "object" && a.rawRowJson && !Array.isArray(a.rawRowJson) ? String(a.rawRowJson.price ?? "") : "",
      spreadGroupId: a.spreadGroupId,
      sourceRowRef: a.sourceRowRef,
    });
    const hashB = computeBrokerTxId({
      accountId: b.accountId,
      eventTimestamp: b.eventTimestamp,
      symbol: b.symbol,
      side: b.side,
      quantity: b.quantity,
      rawPrice: typeof b.rawRowJson === "object" && b.rawRowJson && !Array.isArray(b.rawRowJson) ? String(b.rawRowJson.price ?? "") : "",
      spreadGroupId: b.spreadGroupId,
      sourceRowRef: b.sourceRowRef,
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
});
