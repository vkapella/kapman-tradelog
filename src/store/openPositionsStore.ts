"use client";

import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { computeOpenPositions } from "@/lib/positions/compute-open-positions";
import type {
  AdjustmentsListApiResponse,
  ApiListResponse,
  ExecutionRecord,
  ManualAdjustmentRecord,
  MatchedLotRecord,
  OpenPosition,
  OptionQuoteContractRequest,
  OptionQuoteResponse,
  OptionQuotesApiResponse,
  OptionQuotesMap,
  OptionQuotesRequest,
  QuotesResponse,
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
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((left, right) => left.localeCompare(right));
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

function isQuotesUnavailable(payload: QuotesResponse): payload is { error: "unavailable" } {
  return typeof payload === "object" && payload !== null && "error" in payload && payload.error === "unavailable";
}

function isOptionQuoteUnavailable(payload: OptionQuoteResponse): payload is { error: "unavailable" } {
  return typeof payload === "object" && payload !== null && "error" in payload && payload.error === "unavailable";
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

function groupPositionsByAccount(positions: OpenPosition[], accountIds: string[]): Map<string, OpenPosition[]> {
  const grouped = new Map<string, OpenPosition[]>();
  for (const accountId of accountIds) {
    grouped.set(accountId, []);
  }

  for (const position of positions) {
    const existing = grouped.get(position.accountId) ?? [];
    existing.push(position);
    grouped.set(position.accountId, existing);
  }

  for (const [accountId, accountPositions] of Array.from(grouped.entries())) {
    grouped.set(accountId, [...accountPositions].sort(sortOpenPositions));
  }

  return grouped;
}

async function fetchOpenPositionInputs(accountIds: string[]): Promise<{
  executions: ExecutionRecord[];
  matchedLots: MatchedLotRecord[];
  adjustments: ManualAdjustmentRecord[];
}> {
  const executionQuery = new URLSearchParams({ page: "1", pageSize: "1000" });
  const matchedLotsQuery = new URLSearchParams({ page: "1", pageSize: "1000" });
  const adjustmentsQuery = new URLSearchParams({ page: "1", pageSize: "1000", status: "ACTIVE" });
  applyAccountIdsToSearchParams(executionQuery, accountIds);
  applyAccountIdsToSearchParams(matchedLotsQuery, accountIds);
  applyAccountIdsToSearchParams(adjustmentsQuery, accountIds);

  const [executionResponse, matchedLotsResponse, adjustmentsResponse] = await Promise.all([
    fetch(`/api/executions?${executionQuery.toString()}`, { cache: "no-store" }),
    fetch(`/api/matched-lots?${matchedLotsQuery.toString()}`, { cache: "no-store" }),
    fetch(`/api/adjustments?${adjustmentsQuery.toString()}`, { cache: "no-store" }).catch(() => null),
  ]);

  if (!executionResponse.ok || !matchedLotsResponse.ok) {
    throw new Error("Unable to load open position inputs.");
  }

  const [executionsPayload, matchedLotsPayload] = (await Promise.all([
    executionResponse.json(),
    matchedLotsResponse.json(),
  ])) as [ApiListResponse<ExecutionRecord>, ApiListResponse<MatchedLotRecord>];

  let adjustments: ManualAdjustmentRecord[] = [];
  if (adjustmentsResponse?.ok) {
    const adjustmentsPayload = (await adjustmentsResponse.json()) as AdjustmentsListApiResponse;
    if ("data" in adjustmentsPayload && Array.isArray(adjustmentsPayload.data)) {
      adjustments = adjustmentsPayload.data;
    }
  }

  return {
    executions: executionsPayload.data,
    matchedLots: matchedLotsPayload.data,
    adjustments,
  };
}

async function fetchQuoteMarks(positions: OpenPosition[]): Promise<Record<string, number>> {
  const marks: Record<string, number> = {};
  const equityPositions = positions.filter((position) => position.assetClass === "EQUITY");
  const optionContracts: OptionQuoteContractRequest[] = [];
  const seenOptionKeys = new Set<string>();

  for (const position of positions) {
    if (position.assetClass !== "OPTION") {
      continue;
    }

    const expDate = position.expirationDate?.slice(0, 10);
    if (!position.optionType || !position.strike || !expDate || seenOptionKeys.has(position.instrumentKey)) {
      continue;
    }

    seenOptionKeys.add(position.instrumentKey);
    optionContracts.push({
      instrumentKey: position.instrumentKey,
      symbol: position.underlyingSymbol,
      strike: position.strike,
      expDate,
      contractType: position.optionType,
    });
  }

  const equityPromise = async () => {
    if (equityPositions.length === 0) {
      return;
    }

    const symbols = Array.from(new Set(equityPositions.map((position) => position.symbol))).join(",");
    const response = await fetch(`/api/quotes?${new URLSearchParams({ symbols, refresh: "1" }).toString()}`, { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as QuotesResponse;
    if (isQuotesUnavailable(payload)) {
      return;
    }

    for (const position of equityPositions) {
      const quote = payload[position.symbol];
      if (quote) {
        marks[position.instrumentKey] = quote.mark;
      }
    }
  };

  const optionPromise = async () => {
    if (optionContracts.length === 0) {
      return;
    }

    const requestBody: OptionQuotesRequest = { contracts: optionContracts };
    const response = await fetch("/api/option-quotes?refresh=1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    });
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as OptionQuotesApiResponse;
    if (!("data" in payload)) {
      return;
    }

    const optionQuotes = payload.data as OptionQuotesMap;
    for (const contract of optionContracts) {
      const quote = optionQuotes[contract.instrumentKey];
      if (quote && !isOptionQuoteUnavailable(quote)) {
        marks[contract.instrumentKey] = quote.mark;
      }
    }
  };

  await Promise.all([equityPromise(), optionPromise()]);
  return marks;
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
        const inputs = await fetchOpenPositionInputs(scopedAccountIds);
        const positions = computeOpenPositions(inputs.executions, inputs.matchedLots, inputs.adjustments);
        const groupedPositions = groupPositionsByAccount(positions, scopedAccountIds);
        const quoteMarks = await fetchQuoteMarks(positions);
        const refreshedAt = Date.now();

        for (const accountId of scopedAccountIds) {
          const accountPositions = groupedPositions.get(accountId) ?? [];
          const accountQuotes = Object.fromEntries(
            accountPositions.flatMap((position) => {
              const mark = quoteMarks[position.instrumentKey];
              return typeof mark === "number" && Number.isFinite(mark) ? [[position.instrumentKey, mark] as const] : [];
            }),
          );

          const nextSnapshot: AccountSnapshot = {
            positions: accountPositions,
            quotes: accountQuotes,
            lastRefreshedAt: refreshedAt,
            isLoading: false,
            error: null,
          };

          writeAccountSnapshot(accountId, nextSnapshot);
          persistAccountSnapshot(accountId, nextSnapshot);
        }

        emitChange();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to compute open positions.";
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
