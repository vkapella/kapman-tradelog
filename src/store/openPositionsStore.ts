"use client";

import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import type {
  OpenPosition,
  PositionExcursion,
  PositionSnapshotApiResponse,
  PositionSnapshotComputeApiResponse,
  PositionSnapshotOpenPosition,
} from "@/types/api";

/**
 * A market mark with its provenance. The numeric value alone is not enough:
 * the freshness display needs to distinguish a live quote from a retained
 * historical close, and merged views can legitimately combine both.
 */
export interface StoredQuote {
  mark: number;
  markSource: "LIVE" | "HISTORICAL" | null;
  markAsOf: string | null;
}

/**
 * Canonical enqueue precedence: (snapshotAt, createdAt, snapshotId), matching
 * the server's orderBy exactly. This is a deterministic total order, NOT a
 * proof of initiation order (same-millisecond ids across app machines sort
 * arbitrarily-but-stably) and NOT a proof of source-data freshness (a job
 * enqueued earlier can read inputs later). It is a "highest canonical
 * precedence wins" display policy — nothing stronger.
 */
export interface SnapshotPrecedence {
  snapshotAt: string;
  createdAt: string;
  snapshotId: string;
}

export function comparePrecedence(left: SnapshotPrecedence, right: SnapshotPrecedence): number {
  // ISO-8601 UTC timestamps compare lexicographically in chronological order.
  if (left.snapshotAt !== right.snapshotAt) {
    return left.snapshotAt < right.snapshotAt ? -1 : 1;
  }
  if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? -1 : 1;
  }
  if (left.snapshotId !== right.snapshotId) {
    return left.snapshotId < right.snapshotId ? -1 : 1;
  }
  return 0;
}

export interface ScopeFreshness {
  /** Oldest per-account refresh time among accounts that have data. */
  oldestRefreshedAt: number | null;
  /** Newest per-account refresh time among accounts that have data. */
  newestRefreshedAt: number | null;
  /** Selected accounts with no data at all — the composed view is incomplete. */
  accountsWithoutData: string[];
}

export interface AccountSnapshot {
  positions: OpenPosition[];
  quotes: Record<string, StoredQuote>;
  // Open-leg MAE/MFE keyed by accountId::instrumentKey. In-memory only.
  excursions: Record<string, PositionExcursion>;
  lastRefreshedAt: number | null;
  precedence: SnapshotPrecedence | null;
  isLoading: boolean;
  error: string | null;
  freshness: ScopeFreshness;
  /** True when the server reported no snapshot exists for exactly this scope. */
  noExactServerSnapshot: boolean;
}

export interface OpenPositionsStore {
  hydrate(accountIds: string[]): void;
  refresh(accountIds: string[]): Promise<void>;
  followSnapshot(accountIds: string[], snapshotId: string): Promise<void>;
  invalidateAccount(accountId: string): void;
  getSnapshot(accountIds: string | string[]): AccountSnapshot;
  subscribe(listener: () => void): () => void;
}

export const PERSISTED_SNAPSHOT_VERSION = 2;

interface PersistedAccountSnapshot {
  version: number;
  positions: OpenPosition[];
  quotes: Record<string, StoredQuote>;
  lastRefreshedAt: number | null;
  precedence: SnapshotPrecedence | null;
}

const EMPTY_FRESHNESS: ScopeFreshness = {
  oldestRefreshedAt: null,
  newestRefreshedAt: null,
  accountsWithoutData: [],
};

const EMPTY_ACCOUNT_SNAPSHOT: AccountSnapshot = {
  positions: [],
  quotes: {},
  excursions: {},
  lastRefreshedAt: null,
  precedence: null,
  isLoading: false,
  error: null,
  freshness: EMPTY_FRESHNESS,
  noExactServerSnapshot: false,
};

function normalizeAccountIds(accountIds: string | string[]): string[] {
  const values = Array.isArray(accountIds) ? accountIds : [accountIds];
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))).sort((left, right) => left.localeCompare(right));
}

export function buildStorageKey(accountId: string): string {
  return `kapman_positions_${accountId}`;
}

function cloneEmptySnapshot(): AccountSnapshot {
  return {
    positions: [],
    quotes: {},
    excursions: {},
    lastRefreshedAt: null,
    precedence: null,
    isLoading: false,
    error: null,
    freshness: EMPTY_FRESHNESS,
    noExactServerSnapshot: false,
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

function parseStoredQuote(value: unknown): StoredQuote | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<StoredQuote>;
  if (typeof candidate.mark !== "number" || !Number.isFinite(candidate.mark)) {
    return null;
  }
  return {
    mark: candidate.mark,
    markSource: candidate.markSource === "LIVE" || candidate.markSource === "HISTORICAL" ? candidate.markSource : null,
    markAsOf: typeof candidate.markAsOf === "string" ? candidate.markAsOf : null,
  };
}

function parsePrecedence(value: unknown): SnapshotPrecedence | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<SnapshotPrecedence>;
  if (typeof candidate.snapshotAt !== "string" || typeof candidate.createdAt !== "string" || typeof candidate.snapshotId !== "string") {
    return null;
  }
  return { snapshotAt: candidate.snapshotAt, createdAt: candidate.createdAt, snapshotId: candidate.snapshotId };
}

function parsePersistedAccountSnapshot(raw: string | null): PersistedAccountSnapshot | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedAccountSnapshot>;
    // Pre-versioned entries stored quotes as bare numbers with no precedence;
    // they are a cache, so discard rather than migrate.
    if (parsed.version !== PERSISTED_SNAPSHOT_VERSION) {
      return null;
    }
    if (!Array.isArray(parsed.positions) || typeof parsed.quotes !== "object" || parsed.quotes === null) {
      return null;
    }

    const quotes: Record<string, StoredQuote> = {};
    for (const [instrumentKey, value] of Object.entries(parsed.quotes)) {
      const quote = parseStoredQuote(value);
      if (quote) {
        quotes[instrumentKey] = quote;
      }
    }

    return {
      version: PERSISTED_SNAPSHOT_VERSION,
      positions: parsed.positions as OpenPosition[],
      quotes,
      lastRefreshedAt: typeof parsed.lastRefreshedAt === "number" ? parsed.lastRefreshedAt : null,
      precedence: parsePrecedence(parsed.precedence),
    };
  } catch {
    return null;
  }
}

function toPersistedSnapshot(snapshot: AccountSnapshot): PersistedAccountSnapshot {
  return {
    version: PERSISTED_SNAPSHOT_VERSION,
    positions: snapshot.positions,
    quotes: snapshot.quotes,
    lastRefreshedAt: snapshot.lastRefreshedAt,
    precedence: snapshot.precedence,
  };
}

function splitSnapshotByAccount(
  positions: PositionSnapshotOpenPosition[],
  accountIds: string[],
  snapshotAt: string,
  precedence: SnapshotPrecedence,
): Map<string, AccountSnapshot> {
  const grouped = new Map<string, AccountSnapshot>();

  for (const accountId of accountIds) {
    grouped.set(accountId, {
      ...cloneEmptySnapshot(),
      lastRefreshedAt: Date.parse(snapshotAt),
      precedence,
    });
  }

  for (const position of positions) {
    const current = grouped.get(position.accountId);
    if (!current) {
      // Positions for accounts outside the applied scope are ignored, not
      // written: a payload must never create state for an unrequested account.
      continue;
    }
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
    if (typeof position.mark === "number" && Number.isFinite(position.mark)) {
      current.quotes[position.instrumentKey] = {
        mark: position.mark,
        markSource: position.markSource ?? null,
        markAsOf: position.markAsOf ?? null,
      };
    }
    if (position.maePct !== undefined || position.mfePct !== undefined) {
      current.excursions[position.accountId + "::" + position.instrumentKey] = {
        maePct: position.maePct ?? null,
        mfePct: position.mfePct ?? null,
        pricedDays: position.pricedDays ?? 0,
        unpricedDays: position.unpricedDays ?? 0,
        excursionAsOf: position.excursionAsOf ?? null,
      };
    }
  }

  for (const [accountId, snapshot] of Array.from(grouped.entries())) {
    grouped.set(accountId, {
      ...snapshot,
      positions: [...snapshot.positions].sort(sortOpenPositions),
    });
  }

  return grouped;
}

function mergeCachedQuotes(current: AccountSnapshot, next: AccountSnapshot): AccountSnapshot {
  const activeInstrumentKeys = new Set(next.positions.map((position) => position.instrumentKey));
  const cachedQuotes = Object.fromEntries(
    Object.entries(current.quotes).filter(([instrumentKey]) => activeInstrumentKeys.has(instrumentKey)),
  );
  const freshQuoteCount = Object.keys(next.quotes).length;

  return {
    ...next,
    quotes: {
      ...cachedQuotes,
      ...next.quotes,
    },
    lastRefreshedAt: freshQuoteCount > 0 ? next.lastRefreshedAt : current.lastRefreshedAt,
  };
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
  // Epochs gate EVERY write from an async continuation — success, error,
  // timeout, and cleanup alike. An obsolete request must not be able to
  // replace a newer success with an error or clear a newer operation's
  // loading state.
  const accountEpochs = new Map<string, number>();
  const scopeEpochs = new Map<string, number>();
  // Scope-level: "the server has no snapshot for exactly this scope". This is
  // metadata about a scope key, not about any account — data:null for scope
  // [A,B] proves nothing about singleton snapshots for A or B.
  const noExactSnapshotScopes = new Set<string>();
  let version = 0;

  function emitChange() {
    version += 1;
    scopedSnapshotCache.clear();
    for (const listener of Array.from(listeners)) {
      listener();
    }
  }

  interface OpTokens {
    accounts: Map<string, number>;
    scopeKey: string;
    scopeToken: number;
  }

  function beginOp(accountIds: string[]): OpTokens {
    const accounts = new Map<string, number>();
    for (const accountId of accountIds) {
      const next = (accountEpochs.get(accountId) ?? 0) + 1;
      accountEpochs.set(accountId, next);
      accounts.set(accountId, next);
    }
    const scopeKey = accountIds.join(",");
    const scopeToken = (scopeEpochs.get(scopeKey) ?? 0) + 1;
    scopeEpochs.set(scopeKey, scopeToken);
    return { accounts, scopeKey, scopeToken };
  }

  function isAccountCurrent(tokens: OpTokens, accountId: string): boolean {
    return accountEpochs.get(accountId) === tokens.accounts.get(accountId);
  }

  function isScopeCurrent(tokens: OpTokens): boolean {
    return scopeEpochs.get(tokens.scopeKey) === tokens.scopeToken;
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
      // Best-effort cross-tab guard: skip the write if another tab has already
      // persisted a higher-precedence snapshot. localStorage has no atomic
      // compare-and-set, so two tabs can still interleave read-check-write;
      // the monotonicity guarantee is scoped to a single tab.
      const existing = parsePersistedAccountSnapshot(window.localStorage.getItem(buildStorageKey(accountId)));
      if (existing?.precedence && snapshot.precedence && comparePrecedence(existing.precedence, snapshot.precedence) > 0) {
        return;
      }
      window.localStorage.setItem(buildStorageKey(accountId), JSON.stringify(toPersistedSnapshot(snapshot)));
    } catch {
      // Ignore localStorage errors.
    }
  }

  function setLoading(accountIds: string[], tokens: OpTokens) {
    for (const accountId of accountIds) {
      if (!isAccountCurrent(tokens, accountId)) {
        continue;
      }
      const current = readAccountSnapshot(accountId);
      writeAccountSnapshot(accountId, { ...current, isLoading: true, error: null });
    }
    emitChange();
  }

  function clearLoading(accountIds: string[], tokens: OpTokens, error: string | null) {
    let changed = false;
    for (const accountId of accountIds) {
      if (!isAccountCurrent(tokens, accountId)) {
        continue;
      }
      const current = readAccountSnapshot(accountId);
      writeAccountSnapshot(accountId, { ...current, isLoading: false, error });
      changed = true;
    }
    if (changed) {
      emitChange();
    }
  }

  interface ApplyableSnapshot {
    id: string;
    snapshotAt: string;
    createdAt?: string;
    scopeAccountIds?: string[];
    positions: PositionSnapshotOpenPosition[];
  }

  function applySnapshot(requestedAccountIds: string[], data: ApplyableSnapshot, tokens: OpTokens | null): void {
    const candidate: SnapshotPrecedence = {
      snapshotAt: data.snapshotAt,
      createdAt: data.createdAt ?? data.snapshotAt,
      snapshotId: data.id,
    };

    // Scope validation: a payload only speaks for the accounts it was computed
    // over. A narrower or unrelated snapshot must not clear a requested
    // account by omission.
    const payloadScope = Array.isArray(data.scopeAccountIds) && data.scopeAccountIds.length > 0 ? new Set(data.scopeAccountIds) : null;
    const coveredAccountIds = payloadScope === null ? requestedAccountIds : requestedAccountIds.filter((accountId) => payloadScope.has(accountId));

    const grouped = splitSnapshotByAccount(data.positions, coveredAccountIds, data.snapshotAt, candidate);
    let changed = false;

    for (const accountId of coveredAccountIds) {
      if (tokens && !isAccountCurrent(tokens, accountId)) {
        continue;
      }

      const current = readAccountSnapshot(accountId);
      // Canonical-precedence policy: equal is an idempotent redelivery
      // (already applied), lower is discarded. Neither is an error.
      if (current.precedence !== null && comparePrecedence(candidate, current.precedence) <= 0) {
        continue;
      }

      const apiSnapshot = grouped.get(accountId) ?? { ...cloneEmptySnapshot(), lastRefreshedAt: Date.parse(data.snapshotAt), precedence: candidate };
      const nextSnapshot = mergeCachedQuotes(current, apiSnapshot);

      writeAccountSnapshot(accountId, nextSnapshot);
      persistAccountSnapshot(accountId, nextSnapshot);
      changed = true;
    }

    if (changed) {
      emitChange();
    }
  }

  function markScopeMissing(tokens: OpTokens): void {
    if (!isScopeCurrent(tokens)) {
      return;
    }
    if (!noExactSnapshotScopes.has(tokens.scopeKey)) {
      noExactSnapshotScopes.add(tokens.scopeKey);
      emitChange();
    }
  }

  function clearScopeMissing(tokens: OpTokens): void {
    if (!isScopeCurrent(tokens)) {
      return;
    }
    if (noExactSnapshotScopes.delete(tokens.scopeKey)) {
      emitChange();
    }
  }

  async function syncFromApi(accountIds: string[], tokens: OpTokens): Promise<void> {
    const payload = await fetchSnapshot(accountIds);
    if ("error" in payload) {
      throw new Error(payload.error.message);
    }

    if (!payload.data) {
      markScopeMissing(tokens);
      return;
    }

    // The passive lookup is COMPLETE-only server-side; PENDING/FAILED can only
    // arrive from stale servers and are ignored rather than followed.
    if (payload.data.status === "COMPLETE") {
      applySnapshot(accountIds, payload.data, tokens);
      clearScopeMissing(tokens);
    }
  }

  async function pollSnapshotById(accountIds: string[], snapshotId: string, tokens: OpTokens): Promise<void> {
    let attemptsRemaining = 60;
    while (attemptsRemaining > 0) {
      const payload = await fetchSnapshot(accountIds, snapshotId);
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
        applySnapshot(accountIds, payload.data, tokens);
        clearScopeMissing(tokens);
        clearLoading(accountIds, tokens, null);
        return;
      }

      attemptsRemaining -= 1;
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
    }

    throw new Error("Position snapshot did not complete in time.");
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
              ...cloneEmptySnapshot(),
              positions: persisted.positions,
              quotes: persisted.quotes,
              excursions: current.excursions,
              lastRefreshedAt: persisted.lastRefreshedAt,
              precedence: persisted.precedence,
              isLoading: current.isLoading,
              error: current.error,
            }
          : current === EMPTY_ACCOUNT_SNAPSHOT
            ? cloneEmptySnapshot()
            : current;

        // Restoring must never lower an account below in-memory precedence.
        if (persisted && current.precedence !== null && (nextSnapshot.precedence === null || comparePrecedence(nextSnapshot.precedence, current.precedence) < 0)) {
          continue;
        }

        if (nextSnapshot !== current) {
          writeAccountSnapshot(accountId, nextSnapshot);
          changed = true;
        }
      }

      if (changed) {
        emitChange();
      }

      if (scopedAccountIds.length > 0) {
        const tokens = beginOp(scopedAccountIds);
        void syncFromApi(scopedAccountIds, tokens).catch(() => {
          // Passive background sync: failures are silent, and the epoch check
          // inside every write path keeps an obsolete attempt inert.
        });
      }
    },

    async refresh(accountIds) {
      const scopedAccountIds = normalizeAccountIds(accountIds);
      if (scopedAccountIds.length === 0) {
        return;
      }

      const tokens = beginOp(scopedAccountIds);
      setLoading(scopedAccountIds, tokens);

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

        await pollSnapshotById(scopedAccountIds, computePayload.data.snapshotId, tokens);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to refresh open positions.";
        clearLoading(scopedAccountIds, tokens, message);
      }
    },

    async followSnapshot(accountIds, snapshotId) {
      const scopedAccountIds = normalizeAccountIds(accountIds);
      const normalizedSnapshotId = snapshotId.trim();
      if (scopedAccountIds.length === 0 || normalizedSnapshotId.length === 0) {
        return;
      }

      const tokens = beginOp(scopedAccountIds);
      setLoading(scopedAccountIds, tokens);

      try {
        await pollSnapshotById(scopedAccountIds, normalizedSnapshotId, tokens);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to refresh open positions.";
        clearLoading(scopedAccountIds, tokens, message);
      }
    },

    invalidateAccount(accountId) {
      const normalizedAccountId = accountId.trim();
      if (normalizedAccountId.length === 0) {
        return;
      }

      // Bumping the epoch makes any in-flight operation for this account
      // obsolete: post-invalidation state must come from a new request.
      accountEpochs.set(normalizedAccountId, (accountEpochs.get(normalizedAccountId) ?? 0) + 1);

      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(buildStorageKey(normalizedAccountId));
        } catch {
          // Ignore localStorage errors.
        }
      }

      const hadSnapshot = snapshotsByAccount.delete(normalizedAccountId);
      if (hadSnapshot) {
        emitChange();
      }
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
      const refreshedTimes = accountSnapshots
        .map((accountSnapshot) => accountSnapshot.lastRefreshedAt)
        .filter((value): value is number => value !== null);
      const freshness: ScopeFreshness = {
        oldestRefreshedAt: refreshedTimes.length > 0 ? Math.min(...refreshedTimes) : null,
        newestRefreshedAt: refreshedTimes.length > 0 ? Math.max(...refreshedTimes) : null,
        accountsWithoutData: scopedAccountIds.filter((accountId, index) => accountSnapshots[index].lastRefreshedAt === null),
      };
      const snapshot: AccountSnapshot = {
        positions: accountSnapshots.flatMap((accountSnapshot) => accountSnapshot.positions).sort(sortOpenPositions),
        quotes: Object.assign({}, ...accountSnapshots.map((accountSnapshot) => accountSnapshot.quotes)),
        excursions: Object.assign({}, ...accountSnapshots.map((accountSnapshot) => accountSnapshot.excursions)),
        // Composed views must not imply freshness a partially stale selection
        // does not have: expose the conservative bound plus the full span.
        lastRefreshedAt: freshness.oldestRefreshedAt,
        // A multi-account composition has no single precedence; a one-account
        // view is just that account and keeps its precedence visible.
        precedence: accountSnapshots.length === 1 ? accountSnapshots[0].precedence : null,
        isLoading: accountSnapshots.some((accountSnapshot) => accountSnapshot.isLoading),
        error: accountSnapshots.find((accountSnapshot) => accountSnapshot.error)?.error ?? null,
        freshness,
        noExactServerSnapshot: noExactSnapshotScopes.has(cacheKey),
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
