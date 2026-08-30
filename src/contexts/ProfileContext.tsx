"use client";

// ProfileProvider (#344): the canonical in-browser profile store. Sits above
// the filter contexts in RootShell; children consume profile state passed down
// and report user-originated changes upward. Stage 1 of the hydration barrier
// lives here: nothing beneath mounts until profile resolution (server →
// identity-verified cache → defaults) completes. Stage 2 (account scope) lives
// in AccountFilterContextProvider.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { PROFILE_EXPECTED_IDENTITY_HEADER, normalizeIdentity } from "@/lib/auth/identity";
import { ProfileAutosave, type AutosaveSendResult } from "@/lib/profile/autosave";
import {
  HIDDEN_COLUMNS_LEAF_PREFIX,
  LEAF_ACCOUNTS,
  LEAF_KPIS,
  LEAF_RANGE,
  LEAF_WIDGETS,
  hiddenColumnsLeaf,
  isValidLeafValue,
  leafEqual,
  leafValueFromSettings,
} from "@/lib/profile/leaves";
import {
  clearLegacyStorageKeys,
  deleteProfileJournal,
  readProfileCache,
  readProfileJournal,
  writeProfileCache,
  writeProfileJournal,
} from "@/lib/profile/local";
import { cloneDefaultProfile } from "@/lib/profile/schema";
import type {
  ApiDetailResponse,
  ProfileGetResponse,
  ProfilePutResponse,
  ProfileRange,
  ProfileSettingsV1,
  ProfileWidgetItem,
} from "@/types/api";

interface ProfileView {
  accountsSelected: string[]; // EXTERNAL account ids (the retained desired selection)
  range: ProfileRange;
  widgets: ProfileWidgetItem[] | null;
  kpis: string[] | null;
  hiddenColumns: Record<string, string[]>;
}

export interface ProfileContextValue extends ProfileView {
  identity: string | null;
  writable: boolean;
  /** True while the latest autosave attempt was permanently rejected by the
   *  server (400/413); cleared by the next successful save. Drives the quiet
   *  inline note near Customize. */
  saveRejected: boolean;
  /** Bumps on initial hydration and on reset — consumers re-seed local state. */
  hydrationGeneration: number;
  reportAccounts(externalIds: string[]): void;
  reportRange(range: ProfileRange): void;
  reportWidgets(widgets: ProfileWidgetItem[] | null): void;
  reportKpis(kpis: string[] | null): void;
  reportHiddenColumns(tableName: string, columnIds: string[]): void;
  resetToDefaults(): void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

function viewFromSettings(settings: ProfileSettingsV1): ProfileView {
  return {
    accountsSelected: [...settings.accounts.selected],
    range: { ...settings.range },
    widgets: settings.dashboard.widgets === null ? null : settings.dashboard.widgets.map((item) => ({ ...item })),
    kpis: settings.dashboard.kpis === null ? null : [...settings.dashboard.kpis],
    hiddenColumns: Object.fromEntries(
      Object.entries(settings.tables.hiddenColumns).map(([table, ids]) => [table, [...ids]]),
    ),
  };
}

function applyLeafToView(view: ProfileView, key: string, value: unknown): ProfileView {
  if (key === LEAF_ACCOUNTS) return { ...view, accountsSelected: value as string[] };
  if (key === LEAF_RANGE) return { ...view, range: value as ProfileRange };
  if (key === LEAF_WIDGETS) return { ...view, widgets: value as ProfileWidgetItem[] | null };
  if (key === LEAF_KPIS) return { ...view, kpis: value as string[] | null };
  if (key.startsWith(HIDDEN_COLUMNS_LEAF_PREFIX)) {
    const tableName = key.slice(HIDDEN_COLUMNS_LEAF_PREFIX.length);
    const hiddenColumns = { ...view.hiddenColumns };
    const ids = value as string[] | null;
    if (ids && ids.length > 0) {
      hiddenColumns[tableName] = ids;
    } else {
      delete hiddenColumns[tableName];
    }
    return { ...view, hiddenColumns };
  }
  return view;
}

export function ProfileProvider({ identity, children }: { identity?: string | null; children: React.ReactNode }) {
  const normalizedIdentity = useMemo(() => normalizeIdentity(identity ?? null), [identity]);
  const identityRef = useRef(normalizedIdentity);
  identityRef.current = normalizedIdentity;

  const [ready, setReady] = useState(false);
  const [writable, setWritable] = useState(true);
  const [saveRejected, setSaveRejected] = useState(false);
  const [hydrationGeneration, setHydrationGeneration] = useState(0);
  const [view, setView] = useState<ProfileView>(() => viewFromSettings(cloneDefaultProfile()));

  const machineRef = useRef<ProfileAutosave | null>(null);
  if (machineRef.current === null) {
    machineRef.current = new ProfileAutosave({
      async send(patch, { keepalive }): Promise<AutosaveSendResult> {
        const currentIdentity = identityRef.current;
        if (!currentIdentity) return { kind: "retryable" };
        let response: Response;
        try {
          response = await fetch("/api/profile", {
            method: "PUT",
            keepalive,
            headers: {
              "content-type": "application/json",
              [PROFILE_EXPECTED_IDENTITY_HEADER]: currentIdentity,
            },
            body: JSON.stringify({ patch }),
          });
        } catch {
          return { kind: "retryable" };
        }
        if (response.ok) {
          try {
            const body = (await response.json()) as ApiDetailResponse<ProfilePutResponse>;
            return { kind: "ok", response: body.data };
          } catch {
            return { kind: "retryable" };
          }
        }
        let code = "";
        try {
          code = ((await response.json()) as { error?: { code?: string } }).error?.code ?? "";
        } catch {
          // Non-JSON error body — treat by status alone.
        }
        if (response.status === 409 && code === "IDENTITY_CHANGED") return { kind: "identity_changed" };
        if (response.status === 409 && code === "UNSUPPORTED_PROFILE_VERSION") return { kind: "unsupported_version" };
        // Session/auth failure: journal under the current identity, halt, and
        // reload so Cloudflare Access re-establishes who is signed in.
        if (response.status === 401 || response.status === 403) return { kind: "auth_failed" };
        // Transient outcomes worth automatic backoff: 5xx, 409 CONFLICT
        // (CAS retries exhausted), and 429 rate limiting.
        if (response.status >= 500 || response.status === 409 || response.status === 429) {
          return { kind: "retryable" };
        }
        // Every other 4xx (400 VALIDATION_ERROR, 413 PAYLOAD_TOO_LARGE, …) is
        // permanent: resending the identical payload can never succeed, so
        // retrying forever would only churn. A later user edit re-attempts.
        return { kind: "rejected" };
      },
      onSuccess(response) {
        setSaveRejected(false);
        const currentIdentity = identityRef.current;
        if (!currentIdentity) return;
        // The full server-returned canonical document goes to the cache (it may
        // carry newer changes to OTHER leaves from another device); the running
        // UI is never live-hydrated from it (decision 6).
        writeProfileCache(currentIdentity, {
          writable: true,
          revision: response.revision,
          updatedAt: response.updatedAt,
          settings: response.settings,
        });
      },
      onIdentityChanged() {
        // Dirty values are already journaled under the ORIGINAL identity; the
        // reload re-bootstraps with the new one, which never inherits them.
        // Auth failures (401/403) take this same path: the session cannot
        // save, so reload and let Cloudflare Access re-establish identity.
        window.location.reload();
      },
      onPermanentRejection() {
        setSaveRejected(true);
      },
      writeJournal(entries) {
        const currentIdentity = identityRef.current;
        if (!currentIdentity) return;
        // Synchronous — must land before any pagehide keepalive dispatch.
        writeProfileJournal(currentIdentity, entries);
      },
    });
  }

  // --- Stage 1: profile resolution ---------------------------------------
  useEffect(() => {
    let cancelled = false;
    const machine = machineRef.current;
    if (!machine) return;

    async function resolveProfile() {
      const currentIdentity = identityRef.current;

      // Defensive: no identity -> profile system disabled for the session.
      // Defaults, no cache/journal access, no autosave, no legacy cleanup.
      if (!currentIdentity) {
        if (!cancelled) {
          setView(viewFromSettings(cloneDefaultProfile()));
          setWritable(true);
          setHydrationGeneration((current) => current + 1);
          setReady(true);
        }
        return;
      }

      clearLegacyStorageKeys();

      let settings: ProfileSettingsV1 | null = null;
      let resolvedWritable = true;
      let fromServer = false;

      try {
        const response = await fetch("/api/profile", {
          cache: "no-store",
          headers: { [PROFILE_EXPECTED_IDENTITY_HEADER]: currentIdentity },
        });
        if (response.ok) {
          const body = (await response.json()) as ApiDetailResponse<ProfileGetResponse>;
          settings = body.data.settings;
          resolvedWritable = body.data.writable;
          fromServer = true;
          writeProfileCache(currentIdentity, {
            writable: body.data.writable,
            revision: body.data.revision,
            updatedAt: body.data.updatedAt,
            settings: body.data.settings,
          });
        } else if (response.status === 409) {
          let code = "";
          try {
            code = ((await response.json()) as { error?: { code?: string } }).error?.code ?? "";
          } catch {
            // fall through
          }
          if (code === "IDENTITY_CHANGED") {
            // The Access session switched users between SSR and this fetch.
            // Reload re-renders with the new identity; this cannot loop.
            window.location.reload();
            return;
          }
        }
      } catch {
        // Network/endpoint failure — fall through to the cache.
      }

      if (!settings) {
        const cached = readProfileCache(currentIdentity);
        if (cached) {
          settings = cached.settings;
          resolvedWritable = cached.writable; // read-only state survives fallback
        }
      }
      if (!settings) {
        settings = cloneDefaultProfile();
        resolvedWritable = true;
      }

      if (cancelled || !machine) return;

      // Hydrate the machine baseline from the canonical resolved document.
      machine.hydrate(LEAF_ACCOUNTS, settings.accounts.selected);
      machine.hydrate(LEAF_RANGE, settings.range);
      machine.hydrate(LEAF_WIDGETS, settings.dashboard.widgets);
      machine.hydrate(LEAF_KPIS, settings.dashboard.kpis);
      for (const [tableName, ids] of Object.entries(settings.tables.hiddenColumns)) {
        machine.hydrate(hiddenColumnsLeaf(tableName), ids);
      }

      // Pending journal: this browser's last unacknowledged edits.
      let nextView = viewFromSettings(settings);
      const journal = readProfileJournal(currentIdentity);
      if (journal) {
        if (!resolvedWritable) {
          // Read-only newer-version document: v1 pending edits have no meaning
          // against it and must never be transmitted. Discard.
          deleteProfileJournal(currentIdentity);
        } else {
          let restoredAny = false;
          for (const [key, entry] of Object.entries(journal.entries)) {
            if (!isValidLeafValue(key, entry.value)) continue;
            if (fromServer && leafEqual(key, leafValueFromSettings(settings, key), entry.value)) {
              continue; // The server provably already holds it — no redundant PUT.
            }
            // Without a fresh GET the equality shortcut is unavailable — the
            // restored entry stays uncertain until confirmed.
            machine.restoreJournalEntry(key, entry.value, fromServer ? entry.mustConfirm : true);
            nextView = applyLeafToView(nextView, key, entry.value);
            restoredAny = true;
          }
          if (restoredAny) {
            machine.writeJournalNow();
          } else {
            deleteProfileJournal(currentIdentity);
          }
        }
      }

      setView(nextView);
      setWritable(resolvedWritable);
      setHydrationGeneration((current) => current + 1);
      setReady(true);
      if (resolvedWritable) {
        machine.setEnabled(true);
      }
    }

    void resolveProfile();
    return () => {
      cancelled = true;
    };
    // The identity is fixed for the life of the rendered page (a change means
    // a reload); bootstrap runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Backgrounding: journal synchronously, then best-effort flush -------
  useEffect(() => {
    const machine = machineRef.current;
    if (!machine) return;
    const handleHide = () => machine.handlePageHide();
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") machine.handlePageHide();
    };
    window.addEventListener("pagehide", handleHide);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pagehide", handleHide);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  // Report actions must be referentially STABLE: consumers wire them into
  // effects keyed on their own local state, and an identity change per view
  // update would re-fire those effects in a render loop.
  const viewRef = useRef(view);
  viewRef.current = view;

  const report = useCallback((key: string, value: unknown) => {
    machineRef.current?.edit(key, value);
    setView((current) => applyLeafToView(current, key, value));
  }, []);

  const reportAccounts = useCallback((externalIds: string[]) => report(LEAF_ACCOUNTS, externalIds), [report]);
  const reportRange = useCallback((range: ProfileRange) => report(LEAF_RANGE, range), [report]);
  const reportWidgets = useCallback(
    (widgets: ProfileWidgetItem[] | null) => report(LEAF_WIDGETS, widgets),
    [report],
  );
  const reportKpis = useCallback((kpis: string[] | null) => report(LEAF_KPIS, kpis), [report]);
  const reportHiddenColumns = useCallback(
    (tableName: string, columnIds: string[]) => report(hiddenColumnsLeaf(tableName), columnIds),
    [report],
  );
  const resetToDefaults = useCallback(() => {
    const machine = machineRef.current;
    const defaults = cloneDefaultProfile();
    machine?.edit(LEAF_ACCOUNTS, defaults.accounts.selected);
    machine?.edit(LEAF_RANGE, defaults.range);
    machine?.edit(LEAF_WIDGETS, null);
    machine?.edit(LEAF_KPIS, null);
    // Delete EVERY table-visibility leaf the provider knows about — the
    // union of the current view and anything the machine ever tracked —
    // including tables that are not currently mounted.
    const tableLeaves = new Set<string>([
      ...Object.keys(viewRef.current.hiddenColumns).map(hiddenColumnsLeaf),
      ...(machine?.knownKeys() ?? []).filter((key) => key.startsWith(HIDDEN_COLUMNS_LEAF_PREFIX)),
    ]);
    tableLeaves.forEach((leaf) => {
      machine?.edit(leaf, null);
    });
    setView(viewFromSettings(defaults));
    setHydrationGeneration((current) => current + 1);
  }, [report]);

  const value = useMemo<ProfileContextValue>(
    () => ({
      ...view,
      identity: normalizedIdentity,
      writable,
      saveRejected,
      hydrationGeneration,
      reportAccounts,
      reportRange,
      reportWidgets,
      reportKpis,
      reportHiddenColumns,
      resetToDefaults,
    }),
    [
      view,
      normalizedIdentity,
      writable,
      saveRejected,
      hydrationGeneration,
      reportAccounts,
      reportRange,
      reportWidgets,
      reportKpis,
      reportHiddenColumns,
      resetToDefaults,
    ],
  );

  // Stage 1 barrier: no data-fetching descendant mounts before resolution.
  if (!ready) {
    return (
      <div className="p-6">
        <LoadingSkeleton lines={4} />
      </div>
    );
  }

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfileContext(): ProfileContextValue {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error("useProfileContext must be used inside ProfileProvider");
  }
  return context;
}

/** Null outside a ProfileProvider — for hooks that must work standalone. */
export function useProfileContextOptional(): ProfileContextValue | null {
  return useContext(ProfileContext);
}
