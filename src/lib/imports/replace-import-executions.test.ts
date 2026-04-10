import fixtureA from "../../../fixtures/dedup/fixture-a.json";
import { describe, expect, it } from "vitest";
import { replaceImportExecutions } from "./replace-import-executions";
import type { LedgerIngestExecution } from "@/lib/ledger/ingest";

interface StoredExecution {
  id: string;
  importId: string;
  accountId: string;
  brokerTxId: string;
}

class InMemoryExecutionStore {
  private rowsById = new Map<string, StoredExecution>();
  private rowsByKey = new Map<string, StoredExecution>();
  private idCounter = 0;

  private buildKey(accountId: string, brokerTxId: string): string {
    return `${accountId}|${brokerTxId}`;
  }

  public executionCount(): number {
    return this.rowsById.size;
  }

  public get tx() {
    return {
      execution: {
        deleteMany: async ({ where }: { where: { importId: string } }) => {
          const idsToDelete = Array.from(this.rowsById.values())
            .filter((row) => row.importId === where.importId)
            .map((row) => row.id);

          for (const id of idsToDelete) {
            const existing = this.rowsById.get(id);
            if (!existing) {
              continue;
            }

            this.rowsById.delete(id);
            this.rowsByKey.delete(this.buildKey(existing.accountId, existing.brokerTxId));
          }

          return { count: idsToDelete.length };
        },
        findFirst: async ({ where }: { where: { accountId: string; brokerTxId: string } }) => {
          const row = this.rowsByKey.get(this.buildKey(where.accountId, where.brokerTxId));
          return row ? { id: row.id } : null;
        },
        create: async ({
          data,
        }: {
          data: {
            importId: string;
            accountId: string;
            brokerTxId: string;
          };
        }) => {
          this.idCounter += 1;
          const id = `execution-${this.idCounter}`;
          const created: StoredExecution = {
            id,
            importId: data.importId,
            accountId: data.accountId,
            brokerTxId: data.brokerTxId,
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

describe("replaceImportExecutions", () => {
  it("recommits the same import without accumulating duplicate rows", async () => {
    const store = new InMemoryExecutionStore();
    const executions = asLedgerExecutions(fixtureA);
    const importId = executions[0]?.importId;

    if (!importId) {
      throw new Error("Missing import id in fixture.");
    }

    const first = await replaceImportExecutions(store.tx as never, importId, executions);
    expect(first.inserted).toBe(4);
    expect(store.executionCount()).toBe(4);

    const second = await replaceImportExecutions(store.tx as never, importId, executions);
    expect(second.inserted).toBe(4);
    expect(second.skipped_duplicate).toBe(0);
    expect(store.executionCount()).toBe(4);
  });
});
