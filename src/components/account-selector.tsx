"use client";

import { useMemo, useState } from "react";
import { AccountLabel } from "@/components/accounts/AccountLabel";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";

export function AccountSelector() {
  const [open, setOpen] = useState(false);
  const { accountsError, accountsLoading, availableAccounts, getAccountMeta, reloadAccounts, selectedAccounts, selectionWarnings, setSelectedAccounts } =
    useAccountFilterContext();

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
  const hasWarnings = selectionWarnings.length > 0;

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
        className={`rounded-lg border px-3 py-2 text-xs font-medium text-text ${hasWarnings ? "border-amber-400/60 bg-amber-400/10" : "border-border bg-surface"}`}
      >
        {hasWarnings ? "⚠ " : ""}
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
            {availableAccounts.map((accountId) => {
              const meta = getAccountMeta(accountId);
              return (
                <label key={accountId} className="flex cursor-pointer items-center gap-2 text-xs text-text">
                  <input
                    type="checkbox"
                    checked={selectedAccounts.includes(accountId)}
                    onChange={() => toggleAccount(accountId)}
                    className="h-3 w-3 rounded border-border bg-surface"
                  />
                  <AccountLabel accountId={accountId} className="truncate" />
                  {meta?.paperMoney ? (
                    <span className="rounded border border-amber-400/60 bg-amber-400/10 px-1 py-px text-[9px] uppercase tracking-wide text-amber-200">Paper</span>
                  ) : null}
                  {meta ? (
                    meta.entityName ? (
                      <span className="ml-auto truncate text-[10px] text-text-2" title={meta.entityName}>
                        {meta.entityName}
                      </span>
                    ) : (
                      <span className="ml-auto rounded border border-red-400/60 bg-red-400/10 px-1 py-px text-[9px] uppercase tracking-wide text-red-200">
                        Unclassified
                      </span>
                    )
                  ) : null}
                </label>
              );
            })}
          </div>

          {selectionWarnings.length > 0 ? (
            <div className="mt-2 space-y-1 border-t border-border pt-2">
              {selectionWarnings.map((warning) => (
                <p key={warning} className="text-[11px] text-amber-200">
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
