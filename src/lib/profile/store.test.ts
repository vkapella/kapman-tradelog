// #344: the optimistic CAS write path, with the interleaving of concurrent
// writers driven deterministically through an injected store stub.

import { describe, expect, it } from "vitest";
import { classifyStoredSettings, cloneDefaultProfile } from "@/lib/profile/schema";
import { putProfile, type ProfileRow, type ProfileStore } from "@/lib/profile/store";
import type { ProfileSettingsV1 } from "@/types/api";

const EMAIL = "victor.kapella@kapmancapital.com";

/** In-memory store with hooks to force specific interleavings. */
function memoryStore(initial?: { settings: unknown; revision?: bigint }) {
  let row: ProfileRow | null = initial
    ? { email: EMAIL, settings: initial.settings, revision: initial.revision ?? BigInt(0), updatedAt: new Date(0) }
    : null;

  const hooks = {
    /** Runs after each find(); lets a test commit a competing write mid-CAS. */
    afterFind: [] as Array<() => void>,
    createShouldConflictOnce: false,
  };

  const store: ProfileStore = {
    async find() {
      const hook = hooks.afterFind.shift();
      const snapshot = row ? { ...row } : null;
      hook?.();
      return snapshot;
    },
    async create(email, settings) {
      if (hooks.createShouldConflictOnce) {
        hooks.createShouldConflictOnce = false;
        // The concurrent creator's row materializes as part of losing the race.
        row = { email, settings: cloneDefaultProfile(), revision: BigInt(0), updatedAt: new Date(1) };
        const error = new Error("Unique constraint failed") as Error & { code: string };
        error.code = "P2002";
        throw error;
      }
      row = { email, settings, revision: BigInt(0), updatedAt: new Date(1) };
      return { ...row };
    },
    async casUpdate(email, expectedRevision, settings) {
      if (!row || row.email !== email || row.revision !== expectedRevision) {
        return 0;
      }
      row = { ...row, settings, revision: row.revision + BigInt(1), updatedAt: new Date(2) };
      return 1;
    },
  };

  return {
    store,
    hooks,
    get row() {
      return row;
    },
    set row(next: ProfileRow | null) {
      row = next;
    },
    settings(): ProfileSettingsV1 {
      const classified = classifyStoredSettings(row?.settings);
      if (classified.kind !== "valid") throw new Error("stored settings not valid");
      return classified.settings;
    },
  };
}

describe("putProfile", () => {
  it("lazily creates from defaults with the patch applied", async () => {
    const db = memoryStore();
    const result = await putProfile(db.store, EMAIL, { range: { preset: "ytd", startDate: null, endDate: null } });

    expect(result.kind).toBe("ok");
    expect(db.settings().range.preset).toBe("ytd");
    expect(db.settings().accounts.selected).toEqual(["18528700SCHW"]); // default base
  });

  it("retries after a concurrent-create unique violation and merges into the winner", async () => {
    const db = memoryStore();
    db.hooks.createShouldConflictOnce = true;

    const result = await putProfile(db.store, EMAIL, { accounts: { selected: ["A1"] } });

    expect(result.kind).toBe("ok");
    expect(db.settings().accounts.selected).toEqual(["A1"]);
    expect(db.row?.revision).toBe(BigInt(1)); // winner's row updated via CAS
  });

  it("deterministic concurrency: two leaf writes interleaved through a CAS miss both survive", async () => {
    const db = memoryStore({ settings: cloneDefaultProfile() });

    // Writer B commits its range change between writer A's read and A's CAS,
    // so A's first casUpdate sees a stale revision (count 0) and must
    // re-read + re-merge before winning.
    db.hooks.afterFind.push(() => {
      const current = classifyStoredSettings(db.row?.settings);
      if (current.kind !== "valid") throw new Error("unexpected");
      db.row = {
        ...db.row!,
        settings: { ...current.settings, range: { preset: "30d", startDate: null, endDate: null } },
        revision: db.row!.revision + BigInt(1),
      };
    });

    const result = await putProfile(db.store, EMAIL, { dashboard: { kpis: ["realized-pnl"] } });

    expect(result.kind).toBe("ok");
    // BOTH leaves survive: B's range AND A's kpis.
    expect(db.settings().range.preset).toBe("30d");
    expect(db.settings().dashboard.kpis).toEqual(["realized-pnl"]);
    // Revision advanced twice: once for B, once for A's winning CAS.
    expect(db.row?.revision).toBe(BigInt(2));
  });

  it("exhausted CAS retries return conflict", async () => {
    const db = memoryStore({ settings: cloneDefaultProfile() });
    // Every read is followed by a competing commit, so every CAS misses.
    const bump = () => {
      db.row = { ...db.row!, revision: db.row!.revision + BigInt(1) };
    };
    db.hooks.afterFind.push(bump, bump, bump);

    const result = await putProfile(db.store, EMAIL, { range: { preset: "7d", startDate: null, endDate: null } });
    expect(result.kind).toBe("conflict");
  });

  it("never merges into or overwrites a newer-version document", async () => {
    const futureDoc = { version: 2, somethingNew: true };
    const db = memoryStore({ settings: futureDoc });

    const result = await putProfile(db.store, EMAIL, { range: { preset: "7d", startDate: null, endDate: null } });

    expect(result.kind).toBe("unsupported_version");
    expect(db.row?.settings).toEqual(futureDoc); // untouched
    expect(db.row?.revision).toBe(BigInt(0));
  });

  it("merges into DEFAULT_PROFILE when the stored row is malformed", async () => {
    const db = memoryStore({ settings: { garbage: true } });

    const result = await putProfile(db.store, EMAIL, { accounts: { selected: ["A9"] } });

    expect(result.kind).toBe("ok");
    expect(db.settings().accounts.selected).toEqual(["A9"]);
    expect(db.settings().range).toEqual(cloneDefaultProfile().range);
  });

  it("rejects a merged document over 64 KiB", async () => {
    const db = memoryStore();
    const bigColumns = Array.from({ length: 128 }, (_v, i) => `col-${String(i)}`.padEnd(120, "x"));
    const tables: Record<string, string[] | null> = {};
    for (let i = 0; i < 5; i += 1) {
      tables[`table-${String(i)}`] = bigColumns;
    }

    const result = await putProfile(db.store, EMAIL, { tables: { hiddenColumns: tables } });
    expect(result.kind).toBe("too_large");
    expect(db.row).toBeNull();
  });
});
