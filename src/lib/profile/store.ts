// Atomic profile writes (#344): read → leaf-merge → optimistic compare-and-swap
// on the revision column (the #339 dataRevision idiom), bounded retry. The
// store interface is injectable so the interleaving of concurrent writers can
// be driven deterministically in tests; the route wires it to Prisma.

import {
  PROFILE_MAX_BYTES,
  applyProfilePatch,
  classifyStoredSettings,
  cloneDefaultProfile,
  settingsByteLength,
} from "@/lib/profile/schema";
import type { ProfilePatchV1, ProfileSettingsV1 } from "@/types/api";

export interface ProfileRow {
  email: string;
  settings: unknown;
  revision: bigint;
  updatedAt: Date;
}

export interface ProfileStore {
  find(email: string): Promise<ProfileRow | null>;
  /** Must throw an error with `code === "P2002"` on a concurrent-create race. */
  create(email: string, settings: ProfileSettingsV1): Promise<ProfileRow>;
  /** CAS: update settings + increment revision where email AND revision match; returns matched count. */
  casUpdate(email: string, expectedRevision: bigint, settings: ProfileSettingsV1): Promise<number>;
}

const CAS_ATTEMPTS = 3;

export type PutProfileResult =
  | { kind: "ok"; settings: ProfileSettingsV1; revision: bigint; updatedAt: Date }
  | { kind: "unsupported_version" }
  | { kind: "conflict" }
  | { kind: "too_large" };

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

export async function putProfile(
  store: ProfileStore,
  email: string,
  patch: ProfilePatchV1,
): Promise<PutProfileResult> {
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt += 1) {
    const row = await store.find(email);

    // Merge base: valid v1 doc, else defaults (missing/malformed). A newer
    // version is never merged into and never overwritten.
    let base: ProfileSettingsV1;
    if (row) {
      const stored = classifyStoredSettings(row.settings);
      if (stored.kind === "unsupported") {
        return { kind: "unsupported_version" };
      }
      base = stored.kind === "valid" ? stored.settings : cloneDefaultProfile();
    } else {
      base = cloneDefaultProfile();
    }

    const merged = applyProfilePatch(base, patch);
    if (settingsByteLength(merged) > PROFILE_MAX_BYTES) {
      return { kind: "too_large" };
    }

    if (!row) {
      try {
        const created = await store.create(email, merged);
        return { kind: "ok", settings: merged, revision: created.revision, updatedAt: created.updatedAt };
      } catch (error) {
        if (isUniqueViolation(error)) {
          continue; // Concurrent lazy create won the race — retry against it.
        }
        throw error;
      }
    }

    const count = await store.casUpdate(email, row.revision, merged);
    if (count === 1) {
      // Re-read for the exact post-increment revision/updatedAt. A concurrent
      // writer may have advanced it again; the response body is informational
      // (the client acknowledges its own sent values by generation).
      const fresh = await store.find(email);
      return {
        kind: "ok",
        settings: merged,
        revision: fresh?.revision ?? row.revision + BigInt(1),
        updatedAt: fresh?.updatedAt ?? row.updatedAt,
      };
    }
    // Someone else won the CAS — retry with a fresh read.
  }

  return { kind: "conflict" };
}
