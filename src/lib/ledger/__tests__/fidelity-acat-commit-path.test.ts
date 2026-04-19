import { describe, expect, it } from "vitest";
import { fidelityAdapter } from "@/lib/adapters/fidelity";
import type { UploadedFile } from "@/lib/adapters/types";
import { replaceImportExecutions } from "@/lib/imports/replace-import-executions";
import type { LedgerIngestExecution } from "@/lib/ledger/ingest";
import { deriveInstrumentKeyFromNormalizedExecution } from "@/lib/ledger/instrument-key";

interface StoredExecution {
  id: string;
  importId: string;
  accountId: string;
  brokerTxId: string;
  symbol: string;
  assetClass: LedgerIngestExecution["assetClass"];
  side: LedgerIngestExecution["side"];
  quantity: number;
  openingClosingEffect: LedgerIngestExecution["openingClosingEffect"];
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

  public listExecutions(): StoredExecution[] {
    return Array.from(this.rowsById.values());
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
            symbol: string;
            assetClass: LedgerIngestExecution["assetClass"];
            side: LedgerIngestExecution["side"];
            quantity: number;
            openingClosingEffect: LedgerIngestExecution["openingClosingEffect"];
          };
        }) => {
          this.idCounter += 1;
          const id = `execution-${this.idCounter}`;
          const created: StoredExecution = {
            id,
            importId: data.importId,
            accountId: data.accountId,
            brokerTxId: data.brokerTxId,
            symbol: data.symbol,
            assetClass: data.assetClass,
            side: data.side,
            quantity: data.quantity,
            openingClosingEffect: data.openingClosingEffect,
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

function normalizeDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function normalizeNumberKey(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return String(value);
  }

  return parsed.toString();
}

function buildExecutionAmountDedupKey(input: {
  accountId: string;
  executionDate: Date;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number | string;
  amount: number | string | null;
}): string {
  return [
    input.accountId,
    normalizeDateKey(input.executionDate),
    input.symbol.trim().toUpperCase(),
    input.side,
    normalizeNumberKey(input.quantity),
    normalizeNumberKey(input.amount),
  ].join("|");
}

describe("fidelity share-bearing ACAT commit path", () => {
  it("persists ACAT share transfer execution as EQUITY BUY TO_OPEN through dedupe and ingest", async () => {
    const file: UploadedFile = {
      name: "History_for_Account_T12345678-11.csv",
      mimeType: "text/csv",
      size: 0,
      content: [
        "History for Account",
        "Generated for tests",
        "Run Date,Action,Symbol,Description,Type,Price ($),Quantity,Commission ($),Fees ($),Accrued Interest ($),Amount ($),Cash Balance ($),Settlement Date",
        "10/23/2024,TRANSFER OF ASSETS ACAT RECEIVE SELECT SECTOR SPDR TRUST STATE STREET (XLE) (Margin),XLE,SELECT SECTOR SPDR TRUST STATE STREET,Margin,,100,,,,8981,1485.54,",
      ].join("\n"),
    };

    const parsed = fidelityAdapter.parse(file);
    expect(parsed.executions).toHaveLength(1);

    const importId = "import-fidelity-acat";
    const accountId = "account-fidelity";
    const executionData: LedgerIngestExecution[] = parsed.executions.map((execution) => ({
      importId,
      accountId,
      broker: "FIDELITY",
      eventTimestamp: execution.eventTimestamp,
      tradeDate: execution.tradeDate,
      eventType: execution.eventType,
      assetClass: execution.assetClass,
      symbol: execution.symbol,
      instrumentKey: deriveInstrumentKeyFromNormalizedExecution(execution),
      side: execution.side,
      quantity: execution.quantity,
      price: execution.price,
      grossAmount: execution.grossAmount,
      netAmount: execution.netAmount,
      openingClosingEffect: execution.openingClosingEffect,
      underlyingSymbol: execution.underlyingSymbol,
      optionType: execution.optionType,
      strike: execution.strike,
      expirationDate: execution.expirationDate,
      spreadGroupId: execution.spreadGroupId,
      brokerRefNumber: execution.brokerRefNumber,
      sourceRowRef: execution.sourceRowRef,
      rawRowJson: execution.rawRowJson,
    }));

    const existingExecutionAmountKeys = new Set<string>();
    const dedupedExecutions = executionData.filter((row) => {
      const amountKey = buildExecutionAmountDedupKey({
        accountId,
        executionDate: row.tradeDate,
        symbol: row.symbol,
        side: row.side,
        quantity: row.quantity,
        amount: row.netAmount,
      });
      if (existingExecutionAmountKeys.has(amountKey)) {
        return false;
      }
      existingExecutionAmountKeys.add(amountKey);
      return true;
    });

    expect(dedupedExecutions).toHaveLength(1);

    const store = new InMemoryExecutionStore();
    const result = await replaceImportExecutions(store.tx as never, importId, dedupedExecutions);

    expect(result.inserted).toBe(1);
    expect(result.skipped_duplicate).toBe(0);

    const persistedXle = store.listExecutions().find((row) => row.symbol === "XLE");
    expect(persistedXle).toMatchObject({
      assetClass: "EQUITY",
      side: "BUY",
      quantity: 100,
      openingClosingEffect: "TO_OPEN",
    });
  });
});
