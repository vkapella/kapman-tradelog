"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { openPositionsStore } from "@/store/openPositionsStore";
import type { AccountRecord, ApiListResponse } from "@/types/api";

interface ResolvedAccountLabel {
  text: string;
  title: string;
  useMonospace: boolean;
  isInternalFallback: boolean;
}

export interface AccountEntityMeta {
  entitySlug: string | null; // null = unclassified (quarantined)
  entityName: string | null;
  paperMoney: boolean;
}

interface AccountFilterContextValue {
  accountsError: string | null;
  accountsLoading: boolean;
  availableAccounts: string[];
  selectedAccounts: string[];
  reloadAccounts: () => void;
  setSelectedAccounts: (ids: string[]) => void;
  isSelectedAccount: (accountId: string) => boolean;
  toExternalAccountId: (accountId: string) => string;
  getAccountDisplayText: (accountId: string) => string;
  resolveAccountLabel: (accountId: string) => ResolvedAccountLabel;
  getAccountMeta: (accountId: string) => AccountEntityMeta | null;
  /** Human-readable reasons the current selection would be refused by the KB export (mixed entity/environment, unclassified). */
  selectionWarnings: string[];
}

const AccountFilterContext = createContext<AccountFilterContextValue | null>(null);

// Persisted account-filter selection. Without persistence the filter silently
// re-defaults to all accounts on every load — the path by which a newly
// imported (still unclassified) account would join an export scope unnoticed.
const SELECTED_ACCOUNTS_STORAGE_KEY = "kapman-tradelog.selected-accounts.v1";

function readPersistedSelection(): string[] {
  try {
    const raw = window.localStorage.getItem(SELECTED_ACCOUNTS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function writePersistedSelection(ids: string[]): void {
  try {
    window.localStorage.setItem(SELECTED_ACCOUNTS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage unavailable (private mode, quota) — selection just won't persist.
  }
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((left, right) => left.localeCompare(right));
}

export function AccountFilterContextProvider({ children }: { children: React.ReactNode }) {
  const [availableAccounts, setAvailableAccounts] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccountsState] = useState<string[]>([]);
  const [externalByInternal, setExternalByInternal] = useState<Record<string, string>>({});
  const [displayLabelByInternal, setDisplayLabelByInternal] = useState<Record<string, string>>({});
  const [internalByExternal, setInternalByExternal] = useState<Record<string, string>>({});
  const [metaByInternal, setMetaByInternal] = useState<Record<string, AccountEntityMeta>>({});
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadAccounts() {
      if (!cancelled) {
        setAccountsLoading(true);
        setAccountsError(null);
      }

      try {
        const response = await fetch("/api/accounts", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Unable to load accounts.");
        }

        const payload = (await response.json()) as ApiListResponse<AccountRecord>;
        const rows = payload.data;

        if (cancelled) {
          return;
        }

        const accountIds = [...rows]
          .sort((left, right) => (left.displayLabel ?? left.accountId).localeCompare(right.displayLabel ?? right.accountId))
          .map((row) => row.id);
        const externalByInternalNext = Object.fromEntries(rows.map((row) => [row.id, row.accountId]));
        const displayLabelByInternalNext = Object.fromEntries(
          rows.filter((row) => row.displayLabel).map((row) => [row.id, row.displayLabel ?? row.accountId]),
        );
        const internalByExternalNext = Object.fromEntries(rows.map((row) => [row.accountId, row.id]));
        const metaByInternalNext = Object.fromEntries(
          rows.map((row) => [
            row.id,
            {
              entitySlug: row.legalEntity?.slug ?? null,
              entityName: row.legalEntity?.legalName ?? null,
              paperMoney: row.paperMoney,
            },
          ]),
        );
        const uniqueAccounts = Array.from(new Set(accountIds));

        setMetaByInternal(metaByInternalNext);
        setExternalByInternal(externalByInternalNext);
        setDisplayLabelByInternal(displayLabelByInternalNext);
        setInternalByExternal(internalByExternalNext);
        setAvailableAccounts(uniqueAccounts);
        setSelectedAccountsState((current) => {
          if (current.length === 0) {
            // First load: restore the persisted selection (dropping stale ids);
            // fall back to all accounts when nothing valid was persisted.
            const persisted = readPersistedSelection().filter((accountId) => uniqueAccounts.includes(accountId));
            return persisted.length > 0 ? persisted : uniqueAccounts;
          }

          const filtered = current.filter((accountId) => uniqueAccounts.includes(accountId));
          return filtered.length > 0 ? filtered : uniqueAccounts;
        });
        setAccountsError(null);
      } catch {
        if (!cancelled) {
          setAccountsError("Unable to refresh accounts.");
        }
      } finally {
        if (!cancelled) {
          setAccountsLoading(false);
        }
      }
    }

    void loadAccounts();

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    if (availableAccounts.length === 0) {
      return;
    }

    openPositionsStore.hydrate(availableAccounts);
  }, [availableAccounts]);

  const value = useMemo<AccountFilterContextValue>(() => {
    const selectedSet = new Set(selectedAccounts);
    const selectedExternalSet = new Set(selectedAccounts.map((accountId) => externalByInternal[accountId] ?? accountId));
    const resolveAccountLabel = (accountId: string): ResolvedAccountLabel => {
      const internalAccountId = internalByExternal[accountId] ?? accountId;
      const externalAccountId = externalByInternal[internalAccountId] ?? (internalByExternal[accountId] ? accountId : null);
      const displayLabel = displayLabelByInternal[internalAccountId];

      if (displayLabel) {
        return {
          text: displayLabel,
          title: externalAccountId ?? internalAccountId,
          useMonospace: false,
          isInternalFallback: false,
        };
      }

      if (externalAccountId) {
        return {
          text: externalAccountId,
          title: externalAccountId,
          useMonospace: true,
          isInternalFallback: false,
        };
      }

      return {
        text: internalAccountId,
        title: internalAccountId,
        useMonospace: true,
        isInternalFallback: true,
      };
    };

    const selectedMeta = selectedAccounts.map((accountId) => metaByInternal[accountId]).filter(Boolean);
    const selectionWarnings: string[] = [];
    if (selectedMeta.some((meta) => meta.entitySlug === null)) {
      selectionWarnings.push("Selection includes unclassified account(s) — quarantined from KB exports.");
    }
    const selectedEntities = Array.from(new Set(selectedMeta.map((meta) => meta.entitySlug).filter((slug): slug is string => slug !== null)));
    if (selectedEntities.length > 1) {
      selectionWarnings.push(`Selection spans legal entities (${selectedEntities.join(", ")}) — KB export will refuse it.`);
    }
    if (new Set(selectedMeta.map((meta) => meta.paperMoney)).size > 1) {
      selectionWarnings.push("Selection mixes paper and live accounts — KB export will refuse it.");
    }

    return {
      accountsError,
      accountsLoading,
      availableAccounts,
      selectedAccounts,
      reloadAccounts: () => setReloadToken((current) => current + 1),
      setSelectedAccounts: (ids: string[]) => {
        const unique = uniqueSorted(ids);
        const valid = unique.filter((accountId) => availableAccounts.includes(accountId));
        const next = valid.length === 0 ? availableAccounts : valid;
        writePersistedSelection(next);
        setSelectedAccountsState(next);
      },
      toExternalAccountId: (accountId: string) => externalByInternal[accountId] ?? accountId,
      getAccountDisplayText: (accountId: string) => resolveAccountLabel(accountId).text,
      resolveAccountLabel,
      isSelectedAccount: (accountId: string) => {
        if (selectedSet.has(accountId) || selectedExternalSet.has(accountId)) {
          return true;
        }

        const externalAccountId = externalByInternal[accountId];
        return externalAccountId ? selectedExternalSet.has(externalAccountId) : false;
      },
      getAccountMeta: (accountId: string) => metaByInternal[internalByExternal[accountId] ?? accountId] ?? null,
      selectionWarnings,
    };
  }, [accountsError, accountsLoading, availableAccounts, selectedAccounts, externalByInternal, displayLabelByInternal, internalByExternal, metaByInternal]);

  return <AccountFilterContext.Provider value={value}>{children}</AccountFilterContext.Provider>;
}

export function useAccountFilterContext(): AccountFilterContextValue {
  const context = useContext(AccountFilterContext);
  if (!context) {
    throw new Error("useAccountFilterContext must be used inside AccountFilterContextProvider");
  }

  return context;
}
