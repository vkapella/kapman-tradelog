"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { AccountRecord, ApiListResponse } from "@/types/api";

interface ResolvedAccountLabel {
  text: string;
  title: string;
  useMonospace: boolean;
  isInternalFallback: boolean;
}

interface AccountFilterContextValue {
  availableAccounts: string[];
  selectedAccounts: string[];
  setSelectedAccounts: (ids: string[]) => void;
  isSelectedAccount: (accountId: string) => boolean;
  toExternalAccountId: (accountId: string) => string;
  getAccountDisplayText: (accountId: string) => string;
  resolveAccountLabel: (accountId: string) => ResolvedAccountLabel;
}

const AccountFilterContext = createContext<AccountFilterContextValue | null>(null);

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((left, right) => left.localeCompare(right));
}

export function AccountFilterContextProvider({ children }: { children: React.ReactNode }) {
  const [availableAccounts, setAvailableAccounts] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccountsState] = useState<string[]>([]);
  const [externalByInternal, setExternalByInternal] = useState<Record<string, string>>({});
  const [displayLabelByInternal, setDisplayLabelByInternal] = useState<Record<string, string>>({});
  const [internalByExternal, setInternalByExternal] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadAccounts() {
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
        const uniqueAccounts = Array.from(new Set(accountIds));

        setExternalByInternal(externalByInternalNext);
        setDisplayLabelByInternal(displayLabelByInternalNext);
        setInternalByExternal(internalByExternalNext);
        setAvailableAccounts(uniqueAccounts);
        setSelectedAccountsState((current) => {
          if (current.length === 0) {
            return uniqueAccounts;
          }

          const filtered = current.filter((accountId) => uniqueAccounts.includes(accountId));
          return filtered.length > 0 ? filtered : uniqueAccounts;
        });
      } catch {
        if (!cancelled) {
          setExternalByInternal({});
          setDisplayLabelByInternal({});
          setInternalByExternal({});
          setAvailableAccounts([]);
          setSelectedAccountsState([]);
        }
      }
    }

    void loadAccounts();

    return () => {
      cancelled = true;
    };
  }, []);

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

    return {
      availableAccounts,
      selectedAccounts,
      setSelectedAccounts: (ids: string[]) => {
        const unique = uniqueSorted(ids);
        const valid = unique.filter((accountId) => availableAccounts.includes(accountId));
        setSelectedAccountsState(valid.length === 0 ? availableAccounts : valid);
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
    };
  }, [availableAccounts, selectedAccounts, externalByInternal, displayLabelByInternal, internalByExternal]);

  return <AccountFilterContext.Provider value={value}>{children}</AccountFilterContext.Provider>;
}

export function useAccountFilterContext(): AccountFilterContextValue {
  const context = useContext(AccountFilterContext);
  if (!context) {
    throw new Error("useAccountFilterContext must be used inside AccountFilterContextProvider");
  }

  return context;
}
