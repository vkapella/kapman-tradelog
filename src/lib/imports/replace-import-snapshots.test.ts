import { describe, expect, it } from "vitest";
import { replaceImportSnapshots } from "./replace-import-snapshots";
import type { NormalizedDailyAccountSnapshot } from "@/lib/adapters/types";

interface StoredSnapshot {
  id: string;
  accountId: string;
  snapshotDate: Date;
  balance: number;
  sourceRef: string | null;
}

class InMemorySnapshotStore {
  private rowsByKey = new Map<string, StoredSnapshot>();
  private idCounter = 0;

  private buildKey(accountId: string, snapshotDate: Date): string {
    return `${accountId}|${snapshotDate.toISOString()}`;
  }

  public snapshotCount(): number {
    return this.rowsByKey.size;
  }

  public getRow(accountId: string, snapshotDate: Date): StoredSnapshot | undefined {
    return this.rowsByKey.get(this.buildKey(accountId, snapshotDate));
  }

  public seed(row: Omit<StoredSnapshot, "id">) {
    this.idCounter += 1;
    const created: StoredSnapshot = { id: `snapshot-${this.idCounter}`, ...row };
    this.rowsByKey.set(this.buildKey(row.accountId, row.snapshotDate), created);
  }

  public get tx() {
    return {
      dailyAccountSnapshot: {
        deleteMany: async ({
          where,
        }: {
          where: {
            accountId: string;
            sourceRef: string;
            snapshotDate?: { notIn: Date[] };
          };
        }) => {
          const notIn = where.snapshotDate?.notIn ?? null;
          const keysToDelete = Array.from(this.rowsByKey.values())
            .filter((row) => {
              if (row.accountId !== where.accountId) return false;
              if (row.sourceRef !== where.sourceRef) return false;
              if (!notIn) return true;
              return notIn.every((value) => value.toISOString() !== row.snapshotDate.toISOString());
            })
            .map((row) => this.buildKey(row.accountId, row.snapshotDate));

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
          where: { accountId_snapshotDate: { accountId: string; snapshotDate: Date } };
          update: { balance: number; sourceRef: string };
          create: { accountId: string; snapshotDate: Date; balance: number; sourceRef: string };
        }) => {
          const key = this.buildKey(where.accountId_snapshotDate.accountId, where.accountId_snapshotDate.snapshotDate);
          const existing = this.rowsByKey.get(key);
          if (existing) {
            const updated: StoredSnapshot = {
              ...existing,
              balance: update.balance,
              sourceRef: update.sourceRef,
            };
            this.rowsByKey.set(key, updated);
            return updated;
          }

          this.idCounter += 1;
          const created: StoredSnapshot = {
            id: `snapshot-${this.idCounter}`,
            accountId: create.accountId,
            snapshotDate: create.snapshotDate,
            balance: create.balance,
            sourceRef: create.sourceRef,
          };
          this.rowsByKey.set(key, created);
          return created;
        },
      },
    };
  }
}

function snapshots(rows: Array<[string, string, number]>): NormalizedDailyAccountSnapshot[] {
  return rows.map((row) => ({
    snapshotDate: new Date(row[1]),
    balance: row[2],
  }));
}

describe("replaceImportSnapshots", () => {
  it("upserts daily snapshots and stays idempotent for re-commits", async () => {
    const store = new InMemorySnapshotStore();
    const importId = "import-a";
    const accountId = "account-1";
    const rows = snapshots([
      [accountId, "2026-03-01T00:00:00.000Z", 100000],
      [accountId, "2026-03-02T00:00:00.000Z", 99500],
    ]);

    const first = await replaceImportSnapshots(store.tx as never, importId, accountId, rows);
    expect(first.parsed).toBe(2);
    expect(first.upserted).toBe(2);
    expect(store.snapshotCount()).toBe(2);

    const second = await replaceImportSnapshots(store.tx as never, importId, accountId, rows);
    expect(second.parsed).toBe(2);
    expect(second.upserted).toBe(2);
    expect(store.snapshotCount()).toBe(2);

    const updated = store.getRow(accountId, new Date("2026-03-02T00:00:00.000Z"));
    expect(updated?.balance).toBe(99500);
    expect(updated?.sourceRef).toBe(importId);
  });

  it("deletes stale snapshots previously attributed to the same import", async () => {
    const store = new InMemorySnapshotStore();
    const importId = "import-a";
    const accountId = "account-1";

    store.seed({
      accountId,
      snapshotDate: new Date("2026-03-01T00:00:00.000Z"),
      balance: 100000,
      sourceRef: importId,
    });
    store.seed({
      accountId,
      snapshotDate: new Date("2026-03-02T00:00:00.000Z"),
      balance: 99000,
      sourceRef: importId,
    });

    const result = await replaceImportSnapshots(store.tx as never, importId, accountId, [
      { snapshotDate: new Date("2026-03-02T00:00:00.000Z"), balance: 99500 },
    ]);

    expect(result.deleted).toBe(1);
    expect(store.snapshotCount()).toBe(1);
    expect(store.getRow(accountId, new Date("2026-03-01T00:00:00.000Z"))).toBeUndefined();
  });

  it("does not delete snapshots that were superseded by another import", async () => {
    const store = new InMemorySnapshotStore();
    const importId = "import-a";
    const otherImportId = "import-b";
    const accountId = "account-1";

    store.seed({
      accountId,
      snapshotDate: new Date("2026-03-01T00:00:00.000Z"),
      balance: 100000,
      sourceRef: otherImportId,
    });

    const result = await replaceImportSnapshots(store.tx as never, importId, accountId, []);

    expect(result.deleted).toBe(0);
    expect(store.snapshotCount()).toBe(1);
    expect(store.getRow(accountId, new Date("2026-03-01T00:00:00.000Z"))?.sourceRef).toBe(otherImportId);
  });
});

