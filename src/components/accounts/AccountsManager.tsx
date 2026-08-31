"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AccountRecord, ApiListResponse, ApiDetailResponse, LegalEntityRecord } from "@/types/api";

interface DraftAccountRow {
  displayLabel: string;
  brokerName: string;
  startingCapital: string;
  /** Legal-entity slug; "" = unclassified (quarantined). */
  legalEntitySlug: string;
}

function formatCreatedAt(value: string): string {
  return new Date(value).toLocaleDateString();
}

function formatMoneyInput(value: string | null): string {
  return value ?? "";
}

function buildDraft(record: AccountRecord): DraftAccountRow {
  return {
    displayLabel: record.displayLabel ?? "",
    brokerName: record.brokerName ?? "",
    startingCapital: formatMoneyInput(record.startingCapital),
    legalEntitySlug: record.legalEntity?.slug ?? "",
  };
}

export function AccountsManager() {
  const [rows, setRows] = useState<AccountRecord[]>([]);
  const [entities, setEntities] = useState<LegalEntityRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftAccountRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAccounts() {
      setLoading(true);
      setError(null);

      try {
        const [response, entitiesResponse] = await Promise.all([
          fetch("/api/accounts", { cache: "no-store" }),
          fetch("/api/legal-entities", { cache: "no-store" }),
        ]);
        if (!response.ok || !entitiesResponse.ok) {
          throw new Error("Unable to load accounts.");
        }

        const payload = (await response.json()) as ApiListResponse<AccountRecord>;
        const entitiesPayload = (await entitiesResponse.json()) as ApiListResponse<LegalEntityRecord>;
        if (cancelled) {
          return;
        }

        setRows(payload.data);
        setEntities(entitiesPayload.data);
        setDrafts(Object.fromEntries(payload.data.map((row) => [row.id, buildDraft(row)])));
      } catch (loadError) {
        if (!cancelled) {
          setRows([]);
          setDrafts({});
          setError(loadError instanceof Error ? loadError.message : "Unable to load accounts.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAccounts();

    return () => {
      cancelled = true;
    };
  }, []);

  const hasRows = rows.length > 0;

  const dirtyIds = useMemo(() => {
    return new Set(
      rows
        .filter((row) => {
          const draft = drafts[row.id];
          if (!draft) {
            return false;
          }

          return (
            draft.displayLabel !== (row.displayLabel ?? "") ||
            draft.brokerName !== (row.brokerName ?? "") ||
            draft.startingCapital !== formatMoneyInput(row.startingCapital) ||
            draft.legalEntitySlug !== (row.legalEntity?.slug ?? "")
          );
        })
        .map((row) => row.id),
    );
  }, [drafts, rows]);

  function updateDraft(id: string, key: keyof DraftAccountRow, value: string) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? { displayLabel: "", brokerName: "", startingCapital: "", legalEntitySlug: "" }),
        [key]: value,
      },
    }));
    setSavedId((current) => (current === id ? null : current));
  }

  async function saveRow(row: AccountRecord) {
    const draft = drafts[row.id];
    if (!draft || !dirtyIds.has(row.id)) {
      return;
    }

    setSavingId(row.id);
    setError(null);
    setSavedId(null);

    try {
      const response = await fetch(`/api/accounts/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayLabel: draft.displayLabel,
          brokerName: draft.brokerName,
          startingCapital: draft.startingCapital,
          legalEntitySlug: draft.legalEntitySlug === "" ? null : draft.legalEntitySlug,
        }),
      });

      const payload = (await response.json()) as ApiDetailResponse<AccountRecord> | { error?: { message?: string } };
      if (!response.ok || !("data" in payload)) {
        throw new Error(payload && "error" in payload ? payload.error?.message ?? "Unable to save account." : "Unable to save account.");
      }

      setRows((current) => current.map((entry) => (entry.id === row.id ? payload.data : entry)));
      setDrafts((current) => ({ ...current, [row.id]: buildDraft(payload.data) }));
      setSavedId(row.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save account.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-text">Accounts</p>
        <p className="mt-1 text-xs text-text-2">
          Manage display labels, broker names, per-account starting capital, and legal-entity classification. Unclassified accounts are
          quarantined: excluded from entity-scoped exports until classified.
        </p>
      </header>

      {loading ? <p className="text-xs text-text-2">Loading accounts...</p> : null}
      {error ? <p className="rounded border border-red-400/60 bg-neg-dim px-3 py-2 text-xs text-neg">{error}</p> : null}

      {!loading && !hasRows ? (
        <div className="rounded-xl border border-border bg-surface p-5 text-sm text-text">
          <p>No accounts are available yet.</p>
          <p className="mt-2 text-xs text-text-2">Next action: import a broker statement to seed account records.</p>
          <Link href="/imports" className="mt-3 inline-block text-xs text-accent underline">
            Go to Imports
          </Link>
        </div>
      ) : null}

      {!loading && hasRows ? (
        <div className="overflow-auto rounded-xl border border-border bg-surface">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.08em] text-text-2">
              <tr>
                <th className="px-3 py-3">Display Label</th>
                <th className="px-3 py-3">Broker Account</th>
                <th className="px-3 py-3">Broker Name</th>
                <th className="px-3 py-3">Legal Entity</th>
                <th className="px-3 py-3">Starting Capital</th>
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const draft = drafts[row.id] ?? buildDraft(row);
                const promptForStartingCapital = (row.brokerName ?? draft.brokerName).toLowerCase().includes("fidelity") && Number(draft.startingCapital || "0") === 0;
                const isDirty = dirtyIds.has(row.id);
                const isSaving = savingId === row.id;
                const wasSaved = savedId === row.id;

                return (
                  <tr key={row.id} className="border-t border-border text-text">
                    <td className="px-3 py-3 align-top">
                      <input
                        type="text"
                        value={draft.displayLabel}
                        onChange={(event) => updateDraft(row.id, "displayLabel", event.target.value)}
                        className="w-full rounded border border-border bg-surface-3 px-2 py-1 text-sm text-text"
                      />
                    </td>
                    <td className="px-3 py-3 align-top font-mono text-xs">
                      {row.accountId}
                      {row.paperMoney ? (
                        <span className="ml-2 rounded border border-amber-400/60 bg-warn-dim px-1.5 py-0.5 text-[10px] font-sans uppercase tracking-wide text-warn">
                          Paper
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <input
                        type="text"
                        value={draft.brokerName}
                        onChange={(event) => updateDraft(row.id, "brokerName", event.target.value)}
                        className="w-full rounded border border-border bg-surface-3 px-2 py-1 text-sm text-text"
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <select
                        value={draft.legalEntitySlug}
                        onChange={(event) => updateDraft(row.id, "legalEntitySlug", event.target.value)}
                        className="w-full rounded border border-border bg-surface-3 px-2 py-1 text-sm text-text"
                      >
                        <option value="">Unclassified</option>
                        {entities.map((entity) => (
                          <option key={entity.slug} value={entity.slug}>
                            {entity.legalName}
                          </option>
                        ))}
                      </select>
                      {draft.legalEntitySlug === "" ? (
                        <p className="mt-1 text-[11px] text-warn">Quarantined: excluded from entity-scoped exports until classified.</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.startingCapital}
                        onChange={(event) => updateDraft(row.id, "startingCapital", event.target.value)}
                        className="w-full rounded border border-border bg-surface-3 px-2 py-1 text-sm text-text"
                      />
                      {promptForStartingCapital ? (
                        <p className="mt-1 text-[11px] text-warn">Prompt: set a Fidelity starting capital before relying on total-return views.</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-top text-xs text-text-2">{formatCreatedAt(row.createdAt)}</td>
                    <td className="px-3 py-3 align-top text-right">
                      <button
                        type="button"
                        onClick={() => saveRow(row)}
                        disabled={!isDirty || isSaving}
                        className="rounded border border-border bg-surface-3 px-3 py-1 text-xs text-text disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSaving ? "Saving..." : "Save"}
                      </button>
                      {wasSaved ? <p className="mt-1 text-[11px] text-pos">Saved</p> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
