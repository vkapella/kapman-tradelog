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

interface StoredImportExecution {
  id: string;
  importId: string;
  executionId: string;
  createdAt: Date;
}

class InMemoryExecutionStore {
  private rowsById = new Map<string, StoredExecution>();
  private rowsByKey = new Map<string, StoredExecution>();
  private importExecutionRows = new Map<string, StoredImportExecution>();
  private idCounter = 0;
  private importExecutionIdCounter = 0;

  private buildKey(accountId: string, brokerTxId: string): string {
    return `${accountId}|${brokerTxId}`;
  }

  public executionCount(): number {
    return this.rowsById.size;
  }

  public importExecutionCount(importId: string): number {
    return Array.from(this.importExecutionRows.values()).filter((row) => row.importId === importId).length;
  }

  public get tx() {
    return {
      execution: {
        deleteMany: async ({ where }: { where: { id?: { in: string[] }; importId?: string } }) => {
          const idsToDelete = Array.from(this.rowsById.values())
            .filter((row) => {
              if (where.id?.in) {
                return where.id.in.includes(row.id);
              }
              if (where.importId) {
                return row.importId === where.importId;
              }
              return false;
            })
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
        findMany: async ({
          where,
          select,
        }: {
          where: {
            importId?: string;
            OR?: Array<{ accountId: string; brokerTxId: string }>;
            id?: { in: string[] };
          };
          select: { id: boolean; importId?: boolean };
        }) => {
          if (where.importId) {
            return Array.from(this.rowsById.values())
              .filter((row) => row.importId === where.importId)
              .map((row) => {
                const mapped: { id: string; importId?: string } = { id: row.id };
                if (select.importId) {
                  mapped.importId = row.importId;
                }
                return mapped;
              });
          }

          if (where.id?.in) {
            return where.id.in
              .map((id) => this.rowsById.get(id))
              .filter((row): row is StoredExecution => Boolean(row))
              .map((row) => {
                const mapped: { id: string; importId?: string } = { id: row.id };
                if (select.importId) {
                  mapped.importId = row.importId;
                }
                return mapped;
              });
          }

          if (where.OR) {
            const seen = new Set<string>();
            const rows: Array<{ id: string }> = [];
            for (const candidate of where.OR) {
              const row = this.rowsByKey.get(this.buildKey(candidate.accountId, candidate.brokerTxId));
              if (row && !seen.has(row.id)) {
                seen.add(row.id);
                rows.push({ id: row.id });
              }
            }
            return rows;
          }

          return [];
        },
        findFirst: async ({ where }: { where: { accountId: string; brokerTxId: string } }) => {
          const row = this.rowsByKey.get(this.buildKey(where.accountId, where.brokerTxId));
          return row ? { id: row.id } : null;
        },
        update: async ({ where, data }: { where: { id: string }; data: { importId: string } }) => {
          const row = this.rowsById.get(where.id);
          if (!row) {
            throw new Error(`Execution not found: ${where.id}`);
          }
          row.importId = data.importId;
          return row;
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
      importExecution: {
        createMany: async ({
          data,
        }: {
          data: Array<{ importId: string; executionId: string }>;
          skipDuplicates?: boolean;
        }) => {
          let count = 0;
          for (const row of data) {
            const exists = Array.from(this.importExecutionRows.values()).some(
              (candidate) => candidate.importId === row.importId && candidate.executionId === row.executionId,
            );
            if (exists) {
              continue;
            }

            this.importExecutionIdCounter += 1;
            this.importExecutionRows.set(`link-${this.importExecutionIdCounter}`, {
              id: `link-${this.importExecutionIdCounter}`,
              importId: row.importId,
              executionId: row.executionId,
              createdAt: new Date(this.importExecutionIdCounter * 1000),
            });
            count += 1;
          }
          return { count };
        },
        findMany: async ({
          where,
          select,
        }: {
          where: { importId: string };
          select: { executionId: boolean };
        }) => {
          if (!select.executionId) {
            return [];
          }

          return Array.from(this.importExecutionRows.values())
            .filter((row) => row.importId === where.importId)
            .map((row) => ({ executionId: row.executionId }));
        },
        deleteMany: async ({ where }: { where: { importId: string } }) => {
          const idsToDelete = Array.from(this.importExecutionRows.values())
            .filter((row) => row.importId === where.importId)
            .map((row) => row.id);

          for (const id of idsToDelete) {
            this.importExecutionRows.delete(id);
          }

          return { count: idsToDelete.length };
        },
        findFirst: async (input: {
          where: { executionId: string };
          orderBy: Array<{ createdAt: "asc" | "desc" } | { id: "asc" | "desc" }>;
          select: { importId: boolean };
        }) => {
          const { where } = input;
          const rows = Array.from(this.importExecutionRows.values())
            .filter((row) => row.executionId === where.executionId)
            .sort((left, right) => {
              const createdOrder = left.createdAt.getTime() - right.createdAt.getTime();
              if (createdOrder !== 0) {
                return createdOrder;
              }
              return left.id.localeCompare(right.id);
            });

          const first = rows[0];
          return first ? { importId: first.importId } : null;
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
    expect(store.importExecutionCount(importId)).toBe(4);

    const second = await replaceImportExecutions(store.tx as never, importId, executions);
    expect(second.inserted).toBe(4);
    expect(second.skipped_duplicate).toBe(0);
    expect(store.executionCount()).toBe(4);
    expect(store.importExecutionCount(importId)).toBe(4);
  });
});
