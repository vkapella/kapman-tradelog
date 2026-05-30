import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildStorageKey, openPositionsStore } from "@/store/openPositionsStore";

describe("openPositionsStore.invalidateAccount", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.restoreAllMocks();
    storage.clear();
    (globalThis as { window?: { localStorage: Storage } }).window = {
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
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("invalidateAccount removes persisted snapshot for the given account", () => {
    const accountId = "test-account-123";
    window.localStorage.setItem(buildStorageKey(accountId), JSON.stringify({ positions: [], quotes: {}, lastRefreshedAt: null }));

    openPositionsStore.invalidateAccount(accountId);

    expect(window.localStorage.getItem(buildStorageKey(accountId))).toBeNull();
  });

  it("invalidateAccount does not remove snapshots for other accounts", () => {
    window.localStorage.setItem(buildStorageKey("account-A"), JSON.stringify({ positions: [], quotes: {}, lastRefreshedAt: null }));
    window.localStorage.setItem(buildStorageKey("account-B"), JSON.stringify({ positions: [], quotes: {}, lastRefreshedAt: null }));

    openPositionsStore.invalidateAccount("account-A");

    expect(window.localStorage.getItem(buildStorageKey("account-B"))).not.toBeNull();
  });

  it("invalidateAccount clears in-memory snapshot for the given account", () => {
    const accountId = "account-in-memory";
    window.localStorage.setItem(
      buildStorageKey(accountId),
      JSON.stringify({
        positions: [
          {
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
          },
        ],
        quotes: { AAPL: 101 },
        lastRefreshedAt: Date.now(),
      }),
    );

    openPositionsStore.hydrate([accountId]);
    expect(openPositionsStore.getSnapshot(accountId).positions).toHaveLength(1);

    openPositionsStore.invalidateAccount(accountId);

    const snapshot = openPositionsStore.getSnapshot(accountId);
    expect(snapshot.positions).toHaveLength(0);
    expect(snapshot.lastRefreshedAt).toBeNull();
  });

  it("refresh preserves cached marks when the computed snapshot has unavailable marks", async () => {
    const accountId = "account-cached-marks";
    const previousTimestamp = Date.parse("2026-05-29T20:51:27.205Z");
    const position = {
      symbol: "AAPL",
      underlyingSymbol: "AAPL",
      assetClass: "EQUITY" as const,
      optionType: null,
      strike: null,
      expirationDate: null,
      instrumentKey: "AAPL",
      netQty: 1,
      costBasis: 100,
      accountId,
    };

    window.localStorage.setItem(
      buildStorageKey(accountId),
      JSON.stringify({
        positions: [position],
        quotes: { AAPL: 101 },
        lastRefreshedAt: previousTimestamp,
      }),
    );
    openPositionsStore.hydrate([accountId]);

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { snapshotId: "snapshot-1", status: "PENDING" } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: "snapshot-1",
            snapshotAt: "2026-05-30T13:53:39.000Z",
            status: "COMPLETE",
            positions: [{ ...position, mark: null }],
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
        }),
      } as Response);

    await openPositionsStore.refresh([accountId]);

    const snapshot = openPositionsStore.getSnapshot(accountId);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(snapshot.quotes).toEqual({ AAPL: 101 });
    expect(snapshot.lastRefreshedAt).toBe(previousTimestamp);
  });
});
