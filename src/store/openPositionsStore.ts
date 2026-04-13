"use client";

import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import type {
  OpenPosition,
  PositionSnapshotApiResponse,
  PositionSnapshotComputeApiResponse,
  PositionSnapshotOpenPosition,
} from "@/types/api";

export interface AccountSnapshot {
  positions: OpenPosition[];
  quotes: Record<string, number>;
  lastRefreshedAt: number | null;
  isLoading: boolean;
  error: string | null;
}

export interface OpenPositionsStore {
  hydrate(accountIds: string[]): void;
  refresh(accountIds: string[]): Promise<void>;
  getSnapshot(accountIds: string | string[]): AccountSnapshot;
  subscribe(listener: () => void): () => void;
}

interface PersistedAccountSnapshot {
  positions: OpenPosition[];
  quotes: Record<string, number>;
  lastRefreshedAt: number | null;
}

const EMPTY_ACCOUNT_SNAPSHOT: AccountSnapshot = {
  positions: [],
  quotes: {},
  lastRefreshedAt: null,
  isLoading: false,
  error: null,
};

function normalizeAccountIds(accountIds: string | string[]): string[] {
  const values = Array.isArray(accountIds) ? accountIds : [accountIds];
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))).sort((left, right) => left.localeCompare(right));
}

function buildStorageKey(accountId: string): string {
  return `kapman_positions_${accountId}`;
}

function cloneEmptySnapshot(): AccountSnapshot {
  return {
    positions: [],
    quotes: {},
    lastRefreshedAt: null,
    isLoading: false,
    error: null,
  };
}

function sortOpenPositions(left: OpenPosition, right: OpenPosition): number {
  const symbolOrder = left.underlyingSymbol.localeCompare(right.underlyingSymbol);
  if (symbolOrder !== 0) {
    return symbolOrder;
  }

  const instrumentOrder = left.instrumentKey.localeCompare(right.instrumentKey);
  if (instrumentOrder !== 0) {
    return instrumentOrder;
  }

  return left.accountId.localeCompare(right.accountId);
}

function parsePersistedAccountSnapshot(raw: string | null): PersistedAccountSnapshot | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedAccountSnapshot>;
    if (!Array.isArray(parsed.positions) || typeof parsed.quotes !== "object" || parsed.quotes === null) {
      return null;
    }

    const quotes = Object.fromEntries(
      Object.entries(parsed.quotes).flatMap(([instrumentKey, value]) =>
        typeof value === "number" && Number.isFinite(value) ? [[instrumentKey, value] as const] : [],
      ),
    );

    return {
      positions: parsed.positions as OpenPosition[],
      quotes,
      lastRefreshedAt: typeof parsed.lastRefreshedAt === "number" ? parsed.lastRefreshedAt : null,
    };
  } catch {
    return null;
  }
}

function toPersistedSnapshot(snapshot: AccountSnapshot): PersistedAccountSnapshot {
  return {
    positions: snapshot.positions,
    quotes: snapshot.quotes,
    lastRefreshedAt: snapshot.lastRefreshedAt,
  };
}

function splitSnapshotByAccount(positions: PositionSnapshotOpenPosition[], accountIds: string[], snapshotAt: string): Map<string, AccountSnapshot> {
  const grouped = new Map<string, AccountSnapshot>();

  for (const accountId of accountIds) {
    grouped.set(accountId, {
      positions: [],
      quotes: {},
      lastRefreshedAt: Date.parse(snapshotAt),
      isLoading: false,
      error: null,
    });
  }

  for (const position of positions) {
    const current = grouped.get(position.accountId) ?? cloneEmptySnapshot();
    current.positions.push({
      symbol: position.symbol,
      underlyingSymbol: position.underlyingSymbol,
      assetClass: position.assetClass,
      optionType: position.optionType,
      strike: position.strike,
      expirationDate: position.expirationDate,
      instrumentKey: position.instrumentKey,
      netQty: position.netQty,
      costBasis: position.costBasis,
      accountId: position.accountId,
    });
    if (typeof position.mark === "number") {
      current.quotes[position.instrumentKey] = position.mark;
    }
    grouped.set(position.accountId, current);
  }

  for (const [accountId, snapshot] of Array.from(grouped.entries())) {
    grouped.set(accountId, {
      ...snapshot,
      positions: [...snapshot.positions].sort(sortOpenPositions),
    });
  }

  return grouped;
}

async function fetchSnapshot(accountIds: string[], snapshotId?: string): Promise<PositionSnapshotApiResponse> {
  const query = new URLSearchParams();
  if (snapshotId) {
    query.set("snapshotId", snapshotId);
  } else {
    applyAccountIdsToSearchParams(query, accountIds);
  }

  const response = await fetch(`/api/positions/snapshot?${query.toString()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load position snapshot.");
  }

  return (await response.json()) as PositionSnapshotApiResponse;
}

function createOpenPositionsStore(): OpenPositionsStore {
  const snapshotsByAccount = new Map<string, AccountSnapshot>();
  const listeners = new Set<() => void>();
  const scopedSnapshotCache = new Map<string, { version: number; snapshot: AccountSnapshot }>();
  let version = 0;

  function emitChange() {
    version += 1;
    scopedSnapshotCache.clear();
    for (const listener of Array.from(listeners)) {
      listener();
    }
  }

  function readAccountSnapshot(accountId: string): AccountSnapshot {
    return snapshotsByAccount.get(accountId) ?? EMPTY_ACCOUNT_SNAPSHOT;
  }

  function writeAccountSnapshot(accountId: string, snapshot: AccountSnapshot) {
    snapshotsByAccount.set(accountId, snapshot);
  }

  function persistAccountSnapshot(accountId: string, snapshot: AccountSnapshot) {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(buildStorageKey(accountId), JSON.stringify(toPersistedSnapshot(snapshot)));
    } catch {
      // Ignore localStorage errors.
    }
  }

  function applySnapshot(accountIds: string[], positions: PositionSnapshotOpenPosition[], snapshotAt: string) {
    const grouped = splitSnapshotByAccount(positions, accountIds, snapshotAt);

    for (const accountId of accountIds) {
      const nextSnapshot = grouped.get(accountId) ?? {
        positions: [],
        quotes: {},
        lastRefreshedAt: Date.parse(snapshotAt),
        isLoading: false,
        error: null,
      };

      writeAccountSnapshot(accountId, nextSnapshot);
      persistAccountSnapshot(accountId, nextSnapshot);
    }

    emitChange();
  }

  async function syncFromApi(accountIds: string[]): Promise<void> {
    const payload = await fetchSnapshot(accountIds);
    if ("error" in payload) {
      throw new Error(payload.error.message);
    }

    if (!payload.data) {
      return;
    }

    if (payload.data.status === "FAILED") {
      throw new Error(payload.data.errorMessage ?? "Position snapshot failed.");
    }

    if (payload.data.status === "COMPLETE") {
      applySnapshot(accountIds, payload.data.positions, payload.data.snapshotAt);
    }
  }

  return {
    hydrate(accountIds) {
      if (typeof window === "undefined") {
        return;
      }

      const scopedAccountIds = normalizeAccountIds(accountIds);
      let changed = false;

      for (const accountId of scopedAccountIds) {
        const persisted = parsePersistedAccountSnapshot(window.localStorage.getItem(buildStorageKey(accountId)));
        const current = readAccountSnapshot(accountId);
        const nextSnapshot: AccountSnapshot = persisted
          ? {
              positions: persisted.positions,
              quotes: persisted.quotes,
              lastRefreshedAt: persisted.lastRefreshedAt,
              isLoading: current.isLoading,
              error: current.error,
            }
          : current === EMPTY_ACCOUNT_SNAPSHOT
            ? cloneEmptySnapshot()
            : current;

        if (nextSnapshot !== current) {
          writeAccountSnapshot(accountId, nextSnapshot);
          changed = true;
        }
      }

      if (changed) {
        emitChange();
      }

      if (scopedAccountIds.length > 0) {
        void syncFromApi(scopedAccountIds).catch(() => {});
      }
    },

    async refresh(accountIds) {
      const scopedAccountIds = normalizeAccountIds(accountIds);
      if (scopedAccountIds.length === 0) {
        return;
      }

      for (const accountId of scopedAccountIds) {
        const current = readAccountSnapshot(accountId);
        writeAccountSnapshot(accountId, {
          positions: current.positions,
          quotes: current.quotes,
          lastRefreshedAt: current.lastRefreshedAt,
          isLoading: true,
          error: null,
        });
      }
      emitChange();

      try {
        const computeResponse = await fetch("/api/positions/snapshot/compute", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ accountIds: scopedAccountIds }),
        });

        if (!computeResponse.ok) {
          throw new Error("Unable to start position snapshot compute.");
        }

        const computePayload = (await computeResponse.json()) as PositionSnapshotComputeApiResponse;
        if ("error" in computePayload) {
          throw new Error(computePayload.error.message);
        }

        let attemptsRemaining = 60;
        while (attemptsRemaining > 0) {
          const payload = await fetchSnapshot(scopedAccountIds, computePayload.data.snapshotId);
          if ("error" in payload) {
            throw new Error(payload.error.message);
          }

          if (!payload.data) {
            throw new Error("Position snapshot was not found.");
          }

          if (payload.data.status === "FAILED") {
            throw new Error(payload.data.errorMessage ?? "Position snapshot failed.");
          }

          if (payload.data.status === "COMPLETE") {
            applySnapshot(scopedAccountIds, payload.data.positions, payload.data.snapshotAt);
            return;
          }

          attemptsRemaining -= 1;
          await new Promise((resolve) => window.setTimeout(resolve, 2000));
        }

        throw new Error("Position snapshot did not complete in time.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to refresh open positions.";
        for (const accountId of scopedAccountIds) {
          const current = readAccountSnapshot(accountId);
          writeAccountSnapshot(accountId, {
            positions: current.positions,
            quotes: current.quotes,
            lastRefreshedAt: current.lastRefreshedAt,
            isLoading: false,
            error: message,
          });
        }
        emitChange();
        return;
      }

      for (const accountId of scopedAccountIds) {
        const current = readAccountSnapshot(accountId);
        writeAccountSnapshot(accountId, {
          positions: current.positions,
          quotes: current.quotes,
          lastRefreshedAt: current.lastRefreshedAt,
          isLoading: false,
          error: null,
        });
      }
      emitChange();
    },

    getSnapshot(accountIds) {
      const scopedAccountIds = normalizeAccountIds(accountIds);
      if (scopedAccountIds.length === 0) {
        return EMPTY_ACCOUNT_SNAPSHOT;
      }

      const cacheKey = scopedAccountIds.join(",");
      const cached = scopedSnapshotCache.get(cacheKey);
      if (cached && cached.version === version) {
        return cached.snapshot;
      }

      const accountSnapshots = scopedAccountIds.map((accountId) => readAccountSnapshot(accountId));
      const snapshot: AccountSnapshot = {
        positions: accountSnapshots.flatMap((accountSnapshot) => accountSnapshot.positions).sort(sortOpenPositions),
        quotes: Object.assign({}, ...accountSnapshots.map((accountSnapshot) => accountSnapshot.quotes)),
        lastRefreshedAt: accountSnapshots.reduce<number | null>(
          (latest, accountSnapshot) =>
            accountSnapshot.lastRefreshedAt !== null && (latest === null || accountSnapshot.lastRefreshedAt > latest)
              ? accountSnapshot.lastRefreshedAt
              : latest,
          null,
        ),
        isLoading: accountSnapshots.some((accountSnapshot) => accountSnapshot.isLoading),
        error: accountSnapshots.find((accountSnapshot) => accountSnapshot.error)?.error ?? null,
      };

      scopedSnapshotCache.set(cacheKey, { version, snapshot });
      return snapshot;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const openPositionsStore = createOpenPositionsStore();
