import { beforeEach, describe, expect, it } from "vitest";
import { buildStorageKey, openPositionsStore } from "@/store/openPositionsStore";

describe("openPositionsStore.invalidateAccount", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
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
});
