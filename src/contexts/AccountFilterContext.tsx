"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useProfileContext } from "@/contexts/ProfileContext";
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
  /** Stage 2 of the hydration barrier (#344): true only after a SUCCESSFUL
   *  /api/accounts response has been reconciled against the profile's desired
   *  external selection. Scope-sensitive consumers mount only after this. */
  accountScopeHydrated: boolean;
  availableAccounts: string[];
  selectedAccounts: string[];
  reloadAccounts: () => void;
  setSelectedAccounts: (ids: string[]) => void;
  isSelectedAccount: (accountId: string) => boolean;
  toExternalAccountId: (accountId: string) => string;
  /** Supported external->internal reconciliation path (#344); null if unknown. */
  toInternalAccountId: (externalAccountId: string) => string | null;
  getAccountDisplayText: (accountId: string) => string;
  resolveAccountLabel: (accountId: string) => ResolvedAccountLabel;
  getAccountMeta: (accountId: string) => AccountEntityMeta | null;
  /** Human-readable reasons the current selection would be refused by the KB export (mixed entity/environment, unclassified). */
  selectionWarnings: string[];
}

const AccountFilterContext = createContext<AccountFilterContextValue | null>(null);

// Selection persistence moved to the per-user profile (#344): the desired
// selection lives in ProfileProvider as EXTERNAL account ids (they survive DB
// reseeds where internal cuids change), and this provider reconciles them to
// the APPLIED internal selection after each successful accounts load. The
// legacy localStorage key is gone — deleted on first load by ProfileProvider.

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((left, right) => left.localeCompare(right));
}

export function AccountFilterContextProvider({ children }: { children: React.ReactNode }) {
  const profile = useProfileContext();
  const [availableAccounts, setAvailableAccounts] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccountsState] = useState<string[]>([]);
  const [externalByInternal, setExternalByInternal] = useState<Record<string, string>>({});
  const [displayLabelByInternal, setDisplayLabelByInternal] = useState<Record<string, string>>({});
  const [internalByExternal, setInternalByExternal] = useState<Record<string, string>>({});
  const [metaByInternal, setMetaByInternal] = useState<Record<string, AccountEntityMeta>>({});
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [accountScopeHydrated, setAccountScopeHydrated] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
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

        setMetaByInternal(metaByInternalNext);
        setExternalByInternal(externalByInternalNext);
        setDisplayLabelByInternal(displayLabelByInternalNext);
        setInternalByExternal(internalByExternalNext);
        setAvailableAccounts(Array.from(new Set(accountIds)));
        setAccountsError(null);
        setLoadedOnce(true);
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

  const desiredExternalKey = JSON.stringify(profile.accountsSelected);

  // applyResolvedAccountScope (#344): reconcile the profile's retained desired
  // EXTERNAL ids to the applied INTERNAL selection after every successful
  // load. Stale ids drop from the APPLIED selection only; none resolving (or
  // zero accounts) falls back to all available accounts at runtime. This is
  // NOT a user edit — it never reports upward, never dirties the profile, and
  // never overwrites the retained desired selection.
  useEffect(() => {
    if (!loadedOnce || accountsLoading || accountsError) {
      return;
    }

    const desiredExternal = JSON.parse(desiredExternalKey) as string[];
    const resolved = desiredExternal
      .map((externalId) => internalByExternal[externalId])
      .filter((internalId): internalId is string => Boolean(internalId) && availableAccounts.includes(internalId));
    const applied = resolved.length > 0 ? resolved : availableAccounts;

    setSelectedAccountsState(applied);
    setAccountScopeHydrated(true);
  }, [loadedOnce, accountsLoading, accountsError, desiredExternalKey, internalByExternal, availableAccounts]);

  useEffect(() => {
    // Hydrate at the SELECTED scope, and only once the account scope has been
    // reconciled against the profile selection. Hydrating at all-accounts
    // scope made the store sync against the all-accounts snapshot key, whose
    // stale row then overwrote fresher per-account state (#338).
    if (!accountScopeHydrated || selectedAccounts.length === 0) {
      return;
    }

    openPositionsStore.hydrate(selectedAccounts);
  }, [accountScopeHydrated, selectedAccounts]);

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
      accountScopeHydrated,
      availableAccounts,
      selectedAccounts,
      reloadAccounts: () => setReloadToken((current) => current + 1),
      setSelectedAccounts: (ids: string[]) => {
        const unique = uniqueSorted(ids);
        const valid = unique.filter((accountId) => availableAccounts.includes(accountId));
        const next = valid.length === 0 ? availableAccounts : valid;
        setSelectedAccountsState(next);
        // User-originated edit: report the applied selection upward as
        // EXTERNAL ids — the profile's desired selection IS what the user did.
        profile.reportAccounts(next.map((accountId) => externalByInternal[accountId] ?? accountId));
      },
      toExternalAccountId: (accountId: string) => externalByInternal[accountId] ?? accountId,
      toInternalAccountId: (externalAccountId: string) => internalByExternal[externalAccountId] ?? null,
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
  }, [accountsError, accountsLoading, accountScopeHydrated, availableAccounts, selectedAccounts, externalByInternal, displayLabelByInternal, internalByExternal, metaByInternal, profile]);

  // Stage 2 barrier (#344): scope-sensitive descendants mount only after a
  // SUCCESSFUL accounts response has been reconciled. An accounts-fetch error
  // must NOT open the barrier — with no account list the applied selection
  // would be empty, and an empty account filter means "all accounts" to the
  // data APIs, a scope the user never chose.
  if (!accountScopeHydrated) {
    if (!accountsLoading && accountsError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6">
          <p className="text-sm text-red-200">{accountsError}</p>
          <button
            type="button"
            onClick={() => setReloadToken((current) => current + 1)}
            className="rounded border border-border bg-surface-2 px-3 py-1 text-xs text-text touch-target"
          >
            Retry
          </button>
        </div>
      );
    }

    return (
      <div className="p-6">
        <LoadingSkeleton lines={4} />
      </div>
    );
  }

  return <AccountFilterContext.Provider value={value}>{children}</AccountFilterContext.Provider>;
}

export function useAccountFilterContext(): AccountFilterContextValue {
  const context = useContext(AccountFilterContext);
  if (!context) {
    throw new Error("useAccountFilterContext must be used inside AccountFilterContextProvider");
  }

  return context;
}
