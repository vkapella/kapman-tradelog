import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildStorageKey, comparePrecedence, openPositionsStore, PERSISTED_SNAPSHOT_VERSION } from "@/store/openPositionsStore";
import type { OpenPosition } from "@/types/api";

function makePosition(accountId: string, overrides: Partial<OpenPosition> = {}): OpenPosition {
  return {
    symbol: "AAPL",
    underlyingSymbol: "AAPL",
    assetClass: "EQUITY",
    optionType: null,
    strike: null,
    expirationDate: null,
    instrumentKey: "AAPL",
    netQty: 1,
    costBasis: 100,
    accountId,
    ...overrides,
  };
}

function persistV2(accountId: string, entry: {
  positions?: OpenPosition[];
  quotes?: Record<string, { mark: number; markSource: "LIVE" | "HISTORICAL" | null; markAsOf: string | null }>;
  lastRefreshedAt?: number | null;
  precedence?: { snapshotAt: string; createdAt: string; snapshotId: string } | null;
}): void {
  window.localStorage.setItem(
    buildStorageKey(accountId),
    JSON.stringify({
      version: PERSISTED_SNAPSHOT_VERSION,
      positions: entry.positions ?? [],
      quotes: entry.quotes ?? {},
      lastRefreshedAt: entry.lastRefreshedAt ?? null,
      precedence: entry.precedence ?? null,
    }),
  );
}

function completePayload(overrides: {
  id: string;
  snapshotAt: string;
  createdAt?: string;
  scopeAccountIds: string[];
  positions?: unknown[];
  inputsRevisions?: Record<string, string>;
}) {
  return {
    data: {
      id: overrides.id,
      snapshotAt: overrides.snapshotAt,
      createdAt: overrides.createdAt ?? overrides.snapshotAt,
      scopeAccountIds: overrides.scopeAccountIds,
      status: "COMPLETE",
      positions: overrides.positions ?? [],
      accountValues: Object.entries(overrides.inputsRevisions ?? {}).map(([accountId, inputsRevision]) => ({ accountId, inputsRevision })),
      unrealizedPnl: "0.00",
      realizedPnl: "0.00",
      cashAdjustments: "0.00",
      manualAdjustments: "0.00",
      currentNlv: "0.00",
      startingCapital: "0.00",
      totalGain: "0.00",
      unexplainedDelta: "0.00",
    },
    meta: { snapshotExists: true, snapshotAge: 0 },
  };
}

function jsonResponse(payload: unknown): Response {
  return { ok: true, json: async () => payload } as Response;
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

describe("openPositionsStore", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.restoreAllMocks();
    storage.clear();
    (globalThis as { window?: { localStorage: Storage; setTimeout: typeof setTimeout } }).window = {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
        clear: () => {
          storage.clear();
        },
        key: (index: number) => Array.from(storage.keys())[index] ?? null,
        get length() {
          return storage.size;
        },
      } as Storage,
      setTimeout: setTimeout.bind(globalThis),
    } as never;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("comparePrecedence", () => {
    it("orders by snapshotAt, then createdAt, then snapshotId", () => {
      const base = { snapshotAt: "2026-08-28T00:56:01.000Z", createdAt: "2026-08-28T00:56:01.000Z", snapshotId: "b" };
      expect(comparePrecedence(base, { ...base, snapshotAt: "2026-08-28T00:58:34.000Z" })).toBeLessThan(0);
      expect(comparePrecedence(base, { ...base, createdAt: "2026-08-28T00:56:02.000Z" })).toBeLessThan(0);
      expect(comparePrecedence(base, { ...base, snapshotId: "a" })).toBeGreaterThan(0);
      expect(comparePrecedence(base, { ...base })).toBe(0);
    });
  });

  describe("invalidateAccount", () => {
    it("removes persisted snapshot for the given account", () => {
      const accountId = "test-account-123";
      persistV2(accountId, {});

      openPositionsStore.invalidateAccount(accountId);

      expect(window.localStorage.getItem(buildStorageKey(accountId))).toBeNull();
    });

    it("does not remove snapshots for other accounts", () => {
      persistV2("account-A", {});
      persistV2("account-B", {});

      openPositionsStore.invalidateAccount("account-A");

      expect(window.localStorage.getItem(buildStorageKey("account-B"))).not.toBeNull();
    });

    it("clears in-memory snapshot for the given account", () => {
      const accountId = "account-in-memory";
      persistV2(accountId, {
        positions: [makePosition(accountId)],
        quotes: { AAPL: { mark: 101, markSource: "LIVE", markAsOf: null } },
        lastRefreshedAt: Date.now(),
      });

      openPositionsStore.hydrate([accountId]);
      expect(openPositionsStore.getSnapshot(accountId).positions).toHaveLength(1);

      openPositionsStore.invalidateAccount(accountId);

      const snapshot = openPositionsStore.getSnapshot(accountId);
      expect(snapshot.positions).toHaveLength(0);
      expect(snapshot.lastRefreshedAt).toBeNull();
    });
  });

  describe("persisted schema versioning", () => {
    it("discards pre-versioned entries with numeric quotes instead of migrating them", () => {
      const accountId = "account-v1-legacy";
      window.localStorage.setItem(
        buildStorageKey(accountId),
        JSON.stringify({ positions: [makePosition(accountId)], quotes: { AAPL: 101 }, lastRefreshedAt: Date.now() }),
      );

      openPositionsStore.hydrate([accountId]);

      const snapshot = openPositionsStore.getSnapshot(accountId);
      expect(snapshot.positions).toHaveLength(0);
      expect(snapshot.quotes).toEqual({});
    });
  });

  describe("canonical precedence guard", () => {
    it("keeps fresher per-account state when passive hydration finds an older covering snapshot (the observed #338 bug)", async () => {
      const accountId = "account-import-clobber";
      const otherAccount = "account-import-clobber-other";
      const freshPosition = makePosition(accountId, { symbol: "SNSXX", underlyingSymbol: "SNSXX", instrumentKey: "SNSXX", netQty: 199960, costBasis: 199960 });
      persistV2(accountId, {
        positions: [freshPosition],
        quotes: { SNSXX: { mark: 1, markSource: "LIVE", markAsOf: null } },
        lastRefreshedAt: Date.parse("2026-08-28T00:58:34.860Z"),
        precedence: { snapshotAt: "2026-08-28T00:58:34.860Z", createdAt: "2026-08-28T00:58:34.860Z", snapshotId: "snapshot-fresh" },
      });

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse(
          completePayload({
            id: "snapshot-stale-covering",
            snapshotAt: "2026-08-28T00:56:01.000Z",
            scopeAccountIds: [accountId, otherAccount],
            positions: [{ ...freshPosition, netQty: 100000, costBasis: 100000, mark: 1, markSource: "LIVE", markAsOf: null }],
          }),
        ),
      );

      openPositionsStore.hydrate([accountId, otherAccount]);
      await flushAsync();

      const snapshot = openPositionsStore.getSnapshot(accountId);
      expect(snapshot.positions).toHaveLength(1);
      expect(snapshot.positions[0].netQty).toBe(199960);
      expect(snapshot.precedence?.snapshotId).toBe("snapshot-fresh");
    });

    it("treats an equal redelivery as an idempotent no-op, not an error", async () => {
      const accountId = "account-equal-redelivery";
      const payload = completePayload({
        id: "snapshot-same",
        snapshotAt: "2026-08-28T01:00:00.000Z",
        scopeAccountIds: [accountId],
        positions: [{ ...makePosition(accountId), mark: 101, markSource: "LIVE", markAsOf: null }],
      });
      vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

      await openPositionsStore.followSnapshot([accountId], "snapshot-same");
      const first = openPositionsStore.getSnapshot(accountId);
      await openPositionsStore.followSnapshot([accountId], "snapshot-same");
      const second = openPositionsStore.getSnapshot(accountId);

      expect(second.positions).toEqual(first.positions);
      expect(second.error).toBeNull();
      expect(second.isLoading).toBe(false);
    });

    it("converges to the same state for same-timestamp distinct ids regardless of arrival order", async () => {
      const timestamp = "2026-08-28T02:00:00.000Z";
      const payloadFor = (accountId: string, snapshotId: string, netQty: number) =>
        completePayload({
          id: snapshotId,
          snapshotAt: timestamp,
          scopeAccountIds: [accountId],
          positions: [{ ...makePosition(accountId, { netQty }), mark: 1, markSource: "LIVE", markAsOf: null }],
        });

      const accountAsc = "account-order-asc";
      const fetchMock = vi.spyOn(globalThis, "fetch");
      fetchMock.mockResolvedValueOnce(jsonResponse(payloadFor(accountAsc, "snap-a", 111)));
      await openPositionsStore.followSnapshot([accountAsc], "snap-a");
      fetchMock.mockResolvedValueOnce(jsonResponse(payloadFor(accountAsc, "snap-b", 222)));
      await openPositionsStore.followSnapshot([accountAsc], "snap-b");

      const accountDesc = "account-order-desc";
      fetchMock.mockResolvedValueOnce(jsonResponse(payloadFor(accountDesc, "snap-b", 222)));
      await openPositionsStore.followSnapshot([accountDesc], "snap-b");
      fetchMock.mockResolvedValueOnce(jsonResponse(payloadFor(accountDesc, "snap-a", 111)));
      await openPositionsStore.followSnapshot([accountDesc], "snap-a");

      expect(openPositionsStore.getSnapshot(accountAsc).positions[0].netQty).toBe(222);
      expect(openPositionsStore.getSnapshot(accountDesc).positions[0].netQty).toBe(222);
      expect(openPositionsStore.getSnapshot(accountAsc).precedence?.snapshotId).toBe("snap-b");
      expect(openPositionsStore.getSnapshot(accountDesc).precedence?.snapshotId).toBe("snap-b");
    });
  });

  describe("two-axis freshness (#339)", () => {
    it("lets an earlier-enqueued payload with a HIGHER inputs revision beat later-enqueued cached state — the #338 gap, closed", async () => {
      const accountId = "account-revision-beats-precedence";
      const fetchMock = vi.spyOn(globalThis, "fetch");

      // Later-enqueued computation, but it observed revision 41.
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          completePayload({
            id: "snap-late-stale",
            snapshotAt: "2026-08-28T10:00:00.000Z",
            scopeAccountIds: [accountId],
            positions: [{ ...makePosition(accountId, { netQty: 100000 }), mark: 1, markSource: "LIVE", markAsOf: null }],
            inputsRevisions: { [accountId]: "41" },
          }),
        ),
      );
      await openPositionsStore.followSnapshot([accountId], "snap-late-stale");
      expect(openPositionsStore.getSnapshot(accountId).positions[0].netQty).toBe(100000);

      // Earlier-enqueued (lower canonical precedence) but observed revision 42:
      // under #338's precedence-only policy this payload was discarded.
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          completePayload({
            id: "snap-early-fresh",
            snapshotAt: "2026-08-28T09:00:00.000Z",
            scopeAccountIds: [accountId],
            positions: [{ ...makePosition(accountId, { netQty: 199960 }), mark: 1, markSource: "LIVE", markAsOf: null }],
            inputsRevisions: { [accountId]: "42" },
          }),
        ),
      );
      await openPositionsStore.followSnapshot([accountId], "snap-early-fresh");

      const snapshot = openPositionsStore.getSnapshot(accountId);
      expect(snapshot.positions[0].netQty).toBe(199960);
      expect(snapshot.inputsRevision).toBe("42");
    });

    it("rejects a lower-revision payload even at higher canonical precedence", async () => {
      const accountId = "account-revision-guards-down";
      const fetchMock = vi.spyOn(globalThis, "fetch");

      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          completePayload({
            id: "snap-fresh",
            snapshotAt: "2026-08-28T09:00:00.000Z",
            scopeAccountIds: [accountId],
            positions: [{ ...makePosition(accountId, { netQty: 7 }), mark: 1, markSource: "LIVE", markAsOf: null }],
            inputsRevisions: { [accountId]: "42" },
          }),
        ),
      );
      await openPositionsStore.followSnapshot([accountId], "snap-fresh");

      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          completePayload({
            id: "snap-later-but-stale",
            snapshotAt: "2026-08-28T11:00:00.000Z",
            scopeAccountIds: [accountId],
            positions: [{ ...makePosition(accountId, { netQty: 1 }), mark: 1, markSource: "LIVE", markAsOf: null }],
            inputsRevisions: { [accountId]: "41" },
          }),
        ),
      );
      await openPositionsStore.followSnapshot([accountId], "snap-later-but-stale");

      expect(openPositionsStore.getSnapshot(accountId).positions[0].netQty).toBe(7);
      expect(openPositionsStore.getSnapshot(accountId).inputsRevision).toBe("42");
    });

    it("falls back to canonical precedence on equal revisions (fresher marks win) and persists the revision", async () => {
      const accountId = "account-equal-revision-precedence";
      const fetchMock = vi.spyOn(globalThis, "fetch");

      for (const [snapshotId, hour, netQty] of [["snap-r1", "09", 5], ["snap-r2", "10", 6]] as const) {
        fetchMock.mockResolvedValueOnce(
          jsonResponse(
            completePayload({
              id: snapshotId,
              snapshotAt: `2026-08-28T${hour}:00:00.000Z`,
              scopeAccountIds: [accountId],
              positions: [{ ...makePosition(accountId, { netQty }), mark: 1, markSource: "LIVE", markAsOf: null }],
              inputsRevisions: { [accountId]: "42" },
            }),
          ),
        );
        await openPositionsStore.followSnapshot([accountId], snapshotId);
      }

      expect(openPositionsStore.getSnapshot(accountId).positions[0].netQty).toBe(6);
      const persisted = JSON.parse(window.localStorage.getItem(buildStorageKey(accountId)) ?? "{}");
      expect(persisted.inputsRevision).toBe("42");
    });
  });

  describe("epoch gating", () => {
    it("prevents an obsolete request from replacing a newer success with an error", async () => {
      const accountId = "account-obsolete-error";
      let rejectFirstCompute: (error: Error) => void = () => {};
      const firstComputePromise = new Promise<Response>((_, reject) => {
        rejectFirstCompute = reject;
      });

      const fetchMock = vi.spyOn(globalThis, "fetch");
      // First refresh: compute POST hangs until we reject it later.
      fetchMock.mockReturnValueOnce(firstComputePromise);
      const firstRefresh = openPositionsStore.refresh([accountId]);

      // Second refresh begins (bumping epochs) and completes successfully.
      fetchMock.mockResolvedValueOnce(jsonResponse({ data: { snapshotId: "snap-2", status: "PENDING" } }));
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          completePayload({
            id: "snap-2",
            snapshotAt: "2026-08-28T03:00:00.000Z",
            scopeAccountIds: [accountId],
            positions: [{ ...makePosition(accountId, { netQty: 42 }), mark: 1, markSource: "LIVE", markAsOf: null }],
          }),
        ),
      );
      await openPositionsStore.refresh([accountId]);

      rejectFirstCompute(new Error("network down"));
      await firstRefresh;

      const snapshot = openPositionsStore.getSnapshot(accountId);
      expect(snapshot.error).toBeNull();
      expect(snapshot.isLoading).toBe(false);
      expect(snapshot.positions[0].netQty).toBe(42);
    });
  });

  describe("scope semantics", () => {
    it("flags data:null as scope-level metadata without touching per-account entries, and clears it on exact-scope success", async () => {
      const accountA = "account-null-a";
      const accountB = "account-null-b";
      persistV2(accountA, {
        positions: [makePosition(accountA)],
        quotes: {},
        lastRefreshedAt: Date.parse("2026-08-27T00:00:00.000Z"),
        precedence: { snapshotAt: "2026-08-27T00:00:00.000Z", createdAt: "2026-08-27T00:00:00.000Z", snapshotId: "snap-a-old" },
      });

      const fetchMock = vi.spyOn(globalThis, "fetch");
      fetchMock.mockResolvedValueOnce(jsonResponse({ data: null, meta: { snapshotExists: false } }));
      openPositionsStore.hydrate([accountA, accountB]);
      await flushAsync();

      const missing = openPositionsStore.getSnapshot([accountA, accountB]);
      expect(missing.noExactServerSnapshot).toBe(true);
      expect(openPositionsStore.getSnapshot(accountA).positions).toHaveLength(1);

      fetchMock.mockResolvedValueOnce(jsonResponse({ data: { snapshotId: "snap-ab", status: "PENDING" } }));
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          completePayload({ id: "snap-ab", snapshotAt: "2026-08-28T04:00:00.000Z", scopeAccountIds: [accountA, accountB] }),
        ),
      );
      await openPositionsStore.refresh([accountA, accountB]);

      expect(openPositionsStore.getSnapshot([accountA, accountB]).noExactServerSnapshot).toBe(false);
    });

    it("does not clear a requested account when the by-id payload's scope does not cover it", async () => {
      const accountId = "account-scope-mismatch";
      persistV2(accountId, {
        positions: [makePosition(accountId, { netQty: 7 })],
        quotes: {},
        lastRefreshedAt: Date.parse("2026-08-27T12:00:00.000Z"),
      });
      openPositionsStore.hydrate([accountId]);
      await flushAsync();

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse(
          completePayload({ id: "snap-unrelated", snapshotAt: "2026-08-28T05:00:00.000Z", scopeAccountIds: ["some-other-account"] }),
        ),
      );
      await openPositionsStore.followSnapshot([accountId], "snap-unrelated");

      const snapshot = openPositionsStore.getSnapshot(accountId);
      expect(snapshot.positions).toHaveLength(1);
      expect(snapshot.positions[0].netQty).toBe(7);
      expect(snapshot.isLoading).toBe(false);
    });
  });

  describe("quote provenance and cached-mark merging", () => {
    it("retains markSource and markAsOf through apply and persistence", async () => {
      const accountId = "account-provenance";
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse(
          completePayload({
            id: "snap-prov",
            snapshotAt: "2026-08-28T06:00:00.000Z",
            scopeAccountIds: [accountId],
            positions: [{ ...makePosition(accountId), mark: 99.5, markSource: "HISTORICAL", markAsOf: "2026-08-27" }],
          }),
        ),
      );

      await openPositionsStore.followSnapshot([accountId], "snap-prov");

      const quote = openPositionsStore.getSnapshot(accountId).quotes.AAPL;
      expect(quote).toEqual({ mark: 99.5, markSource: "HISTORICAL", markAsOf: "2026-08-27" });
      const persisted = JSON.parse(window.localStorage.getItem(buildStorageKey(accountId)) ?? "{}");
      expect(persisted.quotes.AAPL).toEqual({ mark: 99.5, markSource: "HISTORICAL", markAsOf: "2026-08-27" });
    });

    it("preserves cached marks with their provenance when the computed snapshot has unavailable marks", async () => {
      const accountId = "account-cached-marks";
      const previousTimestamp = Date.parse("2026-05-29T20:51:27.205Z");
      const position = makePosition(accountId);

      persistV2(accountId, {
        positions: [position],
        quotes: { AAPL: { mark: 101, markSource: "LIVE", markAsOf: null } },
        lastRefreshedAt: previousTimestamp,
      });
      openPositionsStore.hydrate([accountId]);
      await flushAsync();

      const fetchMock = vi.spyOn(globalThis, "fetch");
      fetchMock.mockResolvedValueOnce(jsonResponse({ data: { snapshotId: "snapshot-1", status: "PENDING" } }));
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          completePayload({
            id: "snapshot-1",
            snapshotAt: "2026-05-30T13:53:39.000Z",
            scopeAccountIds: [accountId],
            positions: [{ ...position, mark: null }],
          }),
        ),
      );

      await openPositionsStore.refresh([accountId]);

      const snapshot = openPositionsStore.getSnapshot(accountId);
      expect(snapshot.quotes).toEqual({ AAPL: { mark: 101, markSource: "LIVE", markAsOf: null } });
      expect(snapshot.lastRefreshedAt).toBe(previousTimestamp);
    });
  });

  describe("import-triggered follow", () => {
    it("follows an import-triggered snapshot and replaces stale open positions without starting another compute", async () => {
      const accountId = "account-import-refresh";
      const stalePosition = makePosition(accountId, {
        symbol: "VIX",
        underlyingSymbol: "VIX",
        assetClass: "OPTION",
        optionType: "CALL",
        strike: "22",
        expirationDate: "2026-07-22T00:00:00.000Z",
        instrumentKey: "VIX|CALL|22|2026-07-22",
        netQty: 6,
        costBasis: 1920,
      });

      persistV2(accountId, {
        positions: [stalePosition],
        quotes: { [stalePosition.instrumentKey]: { mark: 1.01, markSource: "LIVE", markAsOf: null } },
        lastRefreshedAt: Date.parse("2026-05-29T20:51:50.645Z"),
      });
      openPositionsStore.hydrate([accountId]);
      await flushAsync();

      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse(
          completePayload({ id: "snapshot-from-import", snapshotAt: "2026-06-29T20:06:20.000Z", scopeAccountIds: [accountId] }),
        ),
      );

      await openPositionsStore.followSnapshot([accountId], "snapshot-from-import");

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/positions/snapshot?snapshotId=snapshot-from-import",
        { cache: "no-store" },
      );
      expect(openPositionsStore.getSnapshot(accountId).positions).toEqual([]);
      expect(JSON.parse(window.localStorage.getItem(buildStorageKey(accountId)) ?? "{}").positions).toEqual([]);
    });
  });

  describe("composed freshness", () => {
    it("exposes the span and the accounts without data instead of a single fresh-looking timestamp", () => {
      const oldTime = Date.parse("2026-08-25T00:00:00.000Z");
      const newTime = Date.parse("2026-08-28T00:00:00.000Z");
      persistV2("account-span-old", { positions: [makePosition("account-span-old")], lastRefreshedAt: oldTime });
      persistV2("account-span-new", { positions: [makePosition("account-span-new")], lastRefreshedAt: newTime });

      openPositionsStore.hydrate(["account-span-old", "account-span-new", "account-span-missing"]);

      const snapshot = openPositionsStore.getSnapshot(["account-span-old", "account-span-new", "account-span-missing"]);
      expect(snapshot.freshness.oldestRefreshedAt).toBe(oldTime);
      expect(snapshot.freshness.newestRefreshedAt).toBe(newTime);
      expect(snapshot.freshness.accountsWithoutData).toEqual(["account-span-missing"]);
      expect(snapshot.lastRefreshedAt).toBe(oldTime);
    });
  });
});
