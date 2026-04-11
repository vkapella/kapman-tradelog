import { describe, expect, it } from "vitest";
import { replaceImportCashEvents } from "./replace-import-cash-events";
import type { NormalizedCashEvent } from "@/lib/adapters/types";

interface StoredCashEvent {
  id: string;
  accountId: string;
  eventDate: Date;
  rowType: "FND" | "LIQ" | "RAD";
  refNumber: string;
  description: string;
  amount: number;
  sourceRef: string | null;
}

class InMemoryCashEventStore {
  private rowsByKey = new Map<string, StoredCashEvent>();
  private idCounter = 0;

  private buildKey(accountId: string, refNumber: string): string {
    return `${accountId}|${refNumber}`;
  }

  public cashEventCount(): number {
    return this.rowsByKey.size;
  }

  public getRow(accountId: string, refNumber: string): StoredCashEvent | undefined {
    return this.rowsByKey.get(this.buildKey(accountId, refNumber));
  }

  public seed(row: Omit<StoredCashEvent, "id">) {
    this.idCounter += 1;
    const created: StoredCashEvent = { id: `cash-event-${this.idCounter}`, ...row };
    this.rowsByKey.set(this.buildKey(row.accountId, row.refNumber), created);
  }

  public get tx() {
    return {
      cashEvent: {
        deleteMany: async ({
          where,
        }: {
          where: {
            accountId: string;
            sourceRef: string;
            refNumber?: { notIn: string[] };
          };
        }) => {
          const notIn = where.refNumber?.notIn ?? null;
          const keysToDelete = Array.from(this.rowsByKey.values())
            .filter((row) => {
              if (row.accountId !== where.accountId) return false;
              if (row.sourceRef !== where.sourceRef) return false;
              if (!notIn) return true;
              return !notIn.includes(row.refNumber);
            })
            .map((row) => this.buildKey(row.accountId, row.refNumber));

          for (const key of keysToDelete) {
            this.rowsByKey.delete(key);
          }

          return { count: keysToDelete.length };
        },
        upsert: async ({
          where,
          update,
          create,
        }: {
          where: { accountId_refNumber: { accountId: string; refNumber: string } };
          update: {
            eventDate: Date;
            rowType: "FND" | "LIQ" | "RAD";
            description: string;
            amount: number;
            sourceRef: string;
          };
          create: {
            accountId: string;
            eventDate: Date;
            rowType: "FND" | "LIQ" | "RAD";
            refNumber: string;
            description: string;
            amount: number;
            sourceRef: string;
          };
        }) => {
          const key = this.buildKey(where.accountId_refNumber.accountId, where.accountId_refNumber.refNumber);
          const existing = this.rowsByKey.get(key);
          if (existing) {
            const updated: StoredCashEvent = {
              ...existing,
              eventDate: update.eventDate,
              rowType: update.rowType,
              description: update.description,
              amount: update.amount,
              sourceRef: update.sourceRef,
            };
            this.rowsByKey.set(key, updated);
            return updated;
          }

          this.idCounter += 1;
          const createdRow: StoredCashEvent = {
            id: `cash-event-${this.idCounter}`,
            accountId: create.accountId,
            eventDate: create.eventDate,
            rowType: create.rowType,
            refNumber: create.refNumber,
            description: create.description,
            amount: create.amount,
            sourceRef: create.sourceRef,
          };
          this.rowsByKey.set(key, createdRow);
          return createdRow;
        },
      },
    };
  }
}

function cashEvents(rows: Array<[string, string, "FND" | "LIQ" | "RAD", string, string, number]>): NormalizedCashEvent[] {
  return rows.map((row) => ({
    eventDate: new Date(row[1]),
    rowType: row[2],
    refNumber: row[3],
    description: row[4],
    amount: row[5],
  }));
}

describe("replaceImportCashEvents", () => {
  it("upserts cash events and stays idempotent for re-commits", async () => {
    const store = new InMemoryCashEventStore();
    const importId = "import-a";
    const accountId = "account-1";
    const rows = cashEvents([
      [accountId, "2026-03-01T00:00:00.000Z", "LIQ", "REF-1", "Cash liquidation", 1000],
      [accountId, "2026-03-02T00:00:00.000Z", "FND", "REF-2", "Position adjustment", -250],
    ]);

    const first = await replaceImportCashEvents(store.tx as never, importId, accountId, rows);
    expect(first.parsed).toBe(2);
    expect(first.upserted).toBe(2);
    expect(store.cashEventCount()).toBe(2);

    const second = await replaceImportCashEvents(store.tx as never, importId, accountId, rows);
    expect(second.parsed).toBe(2);
    expect(second.upserted).toBe(2);
    expect(store.cashEventCount()).toBe(2);
  });

  it("deletes stale cash events attributed to the same import", async () => {
    const store = new InMemoryCashEventStore();
    const importId = "import-a";
    const accountId = "account-1";

    store.seed({
      accountId,
      eventDate: new Date("2026-03-01T00:00:00.000Z"),
      rowType: "LIQ",
      refNumber: "REF-1",
      description: "Cash liquidation",
      amount: 1000,
      sourceRef: importId,
    });
    store.seed({
      accountId,
      eventDate: new Date("2026-03-02T00:00:00.000Z"),
      rowType: "FND",
      refNumber: "REF-2",
      description: "Position adjustment",
      amount: -250,
      sourceRef: importId,
    });

    const result = await replaceImportCashEvents(
      store.tx as never,
      importId,
      accountId,
      cashEvents([[accountId, "2026-03-02T00:00:00.000Z", "FND", "REF-2", "Position adjustment", -250]]),
    );

    expect(result.deleted).toBe(1);
    expect(store.cashEventCount()).toBe(1);
    expect(store.getRow(accountId, "REF-1")).toBeUndefined();
  });

  it("does not delete cash events sourced from another import", async () => {
    const store = new InMemoryCashEventStore();
    const importId = "import-a";
    const otherImportId = "import-b";
    const accountId = "account-1";

    store.seed({
      accountId,
      eventDate: new Date("2026-03-01T00:00:00.000Z"),
      rowType: "LIQ",
      refNumber: "REF-1",
      description: "Cash liquidation",
      amount: 1000,
      sourceRef: otherImportId,
    });

    const result = await replaceImportCashEvents(store.tx as never, importId, accountId, []);

    expect(result.deleted).toBe(0);
    expect(store.cashEventCount()).toBe(1);
    expect(store.getRow(accountId, "REF-1")?.sourceRef).toBe(otherImportId);
  });
});
