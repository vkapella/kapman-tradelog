"use client";

import { useMemo, useState } from "react";
import { AccountLabel } from "@/components/accounts/AccountLabel";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";

export function AccountSelector() {
  const [open, setOpen] = useState(false);
  const { accountsError, accountsLoading, availableAccounts, reloadAccounts, selectedAccounts, setSelectedAccounts } = useAccountFilterContext();

  const allSelected = availableAccounts.length > 0 && selectedAccounts.length === availableAccounts.length;
  const label = useMemo(() => {
    if (accountsLoading && availableAccounts.length === 0) {
      return "Accounts: loading";
    }

    if (accountsError && availableAccounts.length === 0) {
      return "Accounts: unavailable";
    }

    if (availableAccounts.length === 0) {
      return "Accounts: none";
    }

    if (allSelected) {
      return `Accounts: all (${availableAccounts.length})`;
    }

    return `Accounts: ${selectedAccounts.length}/${availableAccounts.length}`;
  }, [accountsError, accountsLoading, allSelected, availableAccounts.length, selectedAccounts.length]);

  function toggleAccount(accountId: string) {
    if (selectedAccounts.includes(accountId)) {
      setSelectedAccounts(selectedAccounts.filter((value) => value !== accountId));
      return;
    }

    setSelectedAccounts([...selectedAccounts, accountId]);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text"
      >
        {label}
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-border bg-surface-2 p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-wide text-text-2">Account Filter</p>
            <button
              type="button"
              onClick={() => setSelectedAccounts(availableAccounts)}
              className="text-[11px] text-accent"
              disabled={availableAccounts.length === 0}
            >
              Select all
            </button>
          </div>

          <div className="max-h-56 space-y-2 overflow-auto pr-1">
            {accountsLoading && availableAccounts.length === 0 ? <p className="text-xs text-text-2">Loading accounts...</p> : null}
            {accountsError ? (
              <div className="space-y-2">
                <p className="text-xs text-amber-200">{accountsError}</p>
                <button type="button" onClick={reloadAccounts} className="text-[11px] text-accent underline">
                  Retry
                </button>
              </div>
            ) : null}
            {!accountsLoading && !accountsError && availableAccounts.length === 0 ? <p className="text-xs text-text-2">No accounts available</p> : null}
            {availableAccounts.map((accountId) => (
              <label key={accountId} className="flex cursor-pointer items-center gap-2 text-xs text-text">
                <input
                  type="checkbox"
                  checked={selectedAccounts.includes(accountId)}
                  onChange={() => toggleAccount(accountId)}
                  className="h-3 w-3 rounded border-border bg-surface"
                />
                <AccountLabel accountId={accountId} className="truncate" />
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
