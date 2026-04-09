"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ExecutionRecord, ImportRecord } from "@/types/api";

interface ExecutionListPayload {
  data: ExecutionRecord[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
  };
}

interface ImportListPayload {
  data: ImportRecord[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
  };
}

interface AccountFilterContextValue {
  availableAccounts: string[];
  selectedAccounts: string[];
  setSelectedAccounts: (ids: string[]) => void;
}

const AccountFilterContext = createContext<AccountFilterContextValue | null>(null);

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((left, right) => left.localeCompare(right));
}

export function AccountFilterContextProvider({ children }: { children: React.ReactNode }) {
  const [availableAccounts, setAvailableAccounts] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccountsState] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadAccounts() {
      try {
        const executionResponse = await fetch("/api/executions?page=1&pageSize=1000", { cache: "no-store" });
        let accountIds: string[] = [];

        if (executionResponse.ok) {
          const payload = (await executionResponse.json()) as ExecutionListPayload;
          accountIds = payload.data.map((row) => row.accountId);
        }

        // Fallback to imports so the selector still hydrates before executions exist.
        if (accountIds.length === 0) {
          const importResponse = await fetch("/api/imports?page=1&pageSize=1000", { cache: "no-store" });
          if (importResponse.ok) {
            const payload = (await importResponse.json()) as ImportListPayload;
            accountIds = payload.data.map((row) => row.accountId);
          }
        }

        if (cancelled) {
          return;
        }

        const uniqueAccounts = uniqueSorted(accountIds);
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
    return {
      availableAccounts,
      selectedAccounts,
      setSelectedAccounts: (ids: string[]) => {
        const unique = uniqueSorted(ids);
        const valid = unique.filter((accountId) => availableAccounts.includes(accountId));
        setSelectedAccountsState(valid.length === 0 ? availableAccounts : valid);
      },
    };
  }, [availableAccounts, selectedAccounts]);

  return <AccountFilterContext.Provider value={value}>{children}</AccountFilterContext.Provider>;
}

export function useAccountFilterContext(): AccountFilterContextValue {
  const context = useContext(AccountFilterContext);
  if (!context) {
    throw new Error("useAccountFilterContext must be used inside AccountFilterContextProvider");
  }

  return context;
}
