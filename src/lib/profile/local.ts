// Identity-keyed browser storage for profiles (#344): the fallback cache and
// the pending journal. Both are keyed by the normalized identity and verify
// the embedded identity on read, so a browser shared by two users can never
// cross-serve a cached view or replay one user's pending edits into the other.

import { profileSettingsSchema } from "@/lib/profile/schema";
import type { ProfileSettingsV1 } from "@/types/api";

const CACHE_KEY_PREFIX = "kapman-tradelog.profile-cache.v1.";
const JOURNAL_KEY_PREFIX = "kapman-tradelog.profile-pending.v1.";

/// Legacy per-setting keys — no longer read anywhere; deleted on first load
/// with a known identity (fixed decision 3: start fresh).
export const LEGACY_STORAGE_KEYS = [
  "kapman-tradelog.selected-accounts.v1",
  "kapman_range_filter",
  "kapman_dashboard_layout",
  "kapman_kpi_layout",
] as const;

export interface ProfileCacheEnvelopeV1 {
  cacheVersion: 1;
  identity: string;
  writable: boolean;
  revision: string;
  updatedAt: string | null;
  settings: ProfileSettingsV1;
  cachedAt: string;
}

export interface ProfileJournalEntryV1 {
  value: unknown;
  gen: number;
  mustConfirm: boolean;
  editedAt: string;
}

export interface ProfilePendingJournalV1 {
  journalVersion: 1;
  identity: string;
  entries: Record<string, ProfileJournalEntryV1>;
}

function cacheKey(identity: string): string {
  return `${CACHE_KEY_PREFIX}${identity}`;
}

function journalKey(identity: string): string {
  return `${JOURNAL_KEY_PREFIX}${identity}`;
}

export function clearLegacyStorageKeys(): void {
  try {
    for (const key of LEGACY_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable — nothing to clear.
  }
}

export function writeProfileCache(
  identity: string,
  envelope: Omit<ProfileCacheEnvelopeV1, "cacheVersion" | "identity" | "cachedAt">,
): void {
  try {
    const payload: ProfileCacheEnvelopeV1 = {
      cacheVersion: 1,
      identity,
      cachedAt: new Date().toISOString(),
      ...envelope,
    };
    window.localStorage.setItem(cacheKey(identity), JSON.stringify(payload));
  } catch {
    // Storage unavailable — the cache is a best-effort fallback only.
  }
}

/**
 * The cached profile for EXACTLY this identity, schema-validated; null when
 * absent, invalid, or belonging to anyone else.
 */
export function readProfileCache(identity: string): ProfileCacheEnvelopeV1 | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(identity));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProfileCacheEnvelopeV1>;
    if (parsed.cacheVersion !== 1 || parsed.identity !== identity || typeof parsed.writable !== "boolean") {
      return null;
    }
    const settings = profileSettingsSchema.safeParse(parsed.settings);
    if (!settings.success) return null;
    return {
      cacheVersion: 1,
      identity,
      writable: parsed.writable,
      revision: typeof parsed.revision === "string" ? parsed.revision : "0",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      settings: settings.data,
      cachedAt: typeof parsed.cachedAt === "string" ? parsed.cachedAt : "",
    };
  } catch {
    return null;
  }
}

/** Synchronous write — MUST complete before any pagehide keepalive dispatch. */
export function writeProfileJournal(identity: string, entries: Record<string, ProfileJournalEntryV1>): void {
  try {
    if (Object.keys(entries).length === 0) {
      window.localStorage.removeItem(journalKey(identity));
      return;
    }
    const payload: ProfilePendingJournalV1 = { journalVersion: 1, identity, entries };
    window.localStorage.setItem(journalKey(identity), JSON.stringify(payload));
  } catch {
    // Storage unavailable — pending edits just won't survive termination.
  }
}

export function readProfileJournal(identity: string): ProfilePendingJournalV1 | null {
  try {
    const raw = window.localStorage.getItem(journalKey(identity));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProfilePendingJournalV1>;
    if (parsed.journalVersion !== 1 || parsed.identity !== identity || typeof parsed.entries !== "object" || parsed.entries === null) {
      return null;
    }
    const entries: Record<string, ProfileJournalEntryV1> = {};
    for (const [key, entry] of Object.entries(parsed.entries)) {
      if (
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as ProfileJournalEntryV1).gen === "number" &&
        typeof (entry as ProfileJournalEntryV1).mustConfirm === "boolean"
      ) {
        entries[key] = {
          value: (entry as ProfileJournalEntryV1).value,
          gen: (entry as ProfileJournalEntryV1).gen,
          mustConfirm: (entry as ProfileJournalEntryV1).mustConfirm,
          editedAt: typeof (entry as ProfileJournalEntryV1).editedAt === "string" ? (entry as ProfileJournalEntryV1).editedAt : "",
        };
      }
    }
    return { journalVersion: 1, identity, entries };
  } catch {
    return null;
  }
}

export function deleteProfileJournal(identity: string): void {
  try {
    window.localStorage.removeItem(journalKey(identity));
  } catch {
    // Storage unavailable.
  }
}
