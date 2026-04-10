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
  isSelectedAccount: (accountId: string) => boolean;
  toExternalAccountId: (accountId: string) => string;
}

const AccountFilterContext = createContext<AccountFilterContextValue | null>(null);

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((left, right) => left.localeCompare(right));
}

export function AccountFilterContextProvider({ children }: { children: React.ReactNode }) {
  const [availableAccounts, setAvailableAccounts] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccountsState] = useState<string[]>([]);
  const [externalByInternal, setExternalByInternal] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadAccounts() {
      try {
        const [executionResponse, importResponse] = await Promise.all([
          fetch("/api/executions?page=1&pageSize=1000", { cache: "no-store" }),
          fetch("/api/imports?page=1&pageSize=1000", { cache: "no-store" }),
        ]);
        let accountIds: string[] = [];
        let executionRows: ExecutionRecord[] = [];
        let importRows: ImportRecord[] = [];

        if (executionResponse.ok) {
          const payload = (await executionResponse.json()) as ExecutionListPayload;
          executionRows = payload.data;
          accountIds = executionRows.map((row) => row.accountId);
        }

        if (importResponse.ok) {
          const payload = (await importResponse.json()) as ImportListPayload;
          importRows = payload.data;
        }

        // Fallback to imports so the selector still hydrates before executions exist.
        if (accountIds.length === 0) {
          accountIds = importRows.map((row) => row.accountId);
        }

        if (cancelled) {
          return;
        }

        const externalByInternalNext: Record<string, string> = {};
        const importById = new Map(importRows.map((row) => [row.id, row.accountId]));
        for (const executionRow of executionRows) {
          const externalAccountId = importById.get(executionRow.importId);
          if (externalAccountId) {
            externalByInternalNext[executionRow.accountId] = externalAccountId;
          }
        }

        const uniqueAccounts = uniqueSorted(accountIds);
        setExternalByInternal(externalByInternalNext);
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

    return {
      availableAccounts,
      selectedAccounts,
      setSelectedAccounts: (ids: string[]) => {
        const unique = uniqueSorted(ids);
        const valid = unique.filter((accountId) => availableAccounts.includes(accountId));
        setSelectedAccountsState(valid.length === 0 ? availableAccounts : valid);
      },
      toExternalAccountId: (accountId: string) => externalByInternal[accountId] ?? accountId,
      isSelectedAccount: (accountId: string) => {
        if (selectedSet.has(accountId) || selectedExternalSet.has(accountId)) {
          return true;
        }

        const externalAccountId = externalByInternal[accountId];
        return externalAccountId ? selectedExternalSet.has(externalAccountId) : false;
      },
    };
  }, [availableAccounts, selectedAccounts, externalByInternal]);

  return <AccountFilterContext.Provider value={value}>{children}</AccountFilterContext.Provider>;
}

export function useAccountFilterContext(): AccountFilterContextValue {
  const context = useContext(AccountFilterContext);
  if (!context) {
    throw new Error("useAccountFilterContext must be used inside AccountFilterContextProvider");
  }

  return context;
}
