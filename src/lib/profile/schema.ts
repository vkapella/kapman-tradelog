// Profile settings document (#344): canonical v1 schema, strict patch schema,
// and the leaf-level merge. Shared by the API route (validation + merge), the
// client cache/journal (same schema validates cached data), and tests.
//
// Leaf conflict units — merge and last-write-wins operate independently on:
//   accounts | range | dashboard.widgets | dashboard.kpis |
//   tables.hiddenColumns[tableName] (one leaf PER table)

import { z } from "zod";
import type { ProfilePatchV1, ProfileSettingsV1 } from "@/types/api";

export const PROFILE_SETTINGS_VERSION = 1;
export const PROFILE_MAX_BYTES = 64 * 1024;

const ID_MAX = 128;
const boundedId = z.string().trim().min(1).max(ID_MAX);

const rangePresetSchema = z.enum(["kapman-start", "all", "ytd", "1yr", "3yr", "30d", "7d", "custom"]);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

// Canonical range: non-custom presets carry null dates (windows derive at
// query time); custom carries both, ordered.
const rangeSchema = z
  .object({
    preset: rangePresetSchema,
    startDate: isoDate.nullable(),
    endDate: isoDate.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.preset === "custom") {
      if (!value.startDate || !value.endDate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "custom range requires startDate and endDate" });
      } else if (value.startDate > value.endDate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "startDate must be <= endDate" });
      }
    } else if (value.startDate !== null || value.endDate !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "non-custom presets store null dates" });
    }
  });

function noDuplicates<T>(items: T[], key: (item: T) => string): boolean {
  return new Set(items.map(key)).size === items.length;
}

const widgetItemSchema = z
  .object({
    widgetId: boundedId,
    colSpan: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  })
  .strict();

const widgetsSchema = z
  .array(widgetItemSchema)
  .max(64)
  .refine((items) => noDuplicates(items, (item) => item.widgetId), "duplicate widgetId")
  .nullable();

const kpisSchema = z
  .array(boundedId)
  .max(64)
  .refine((items) => noDuplicates(items, (id) => id), "duplicate KPI id")
  .nullable();

const accountsSchema = z
  .object({
    selected: z
      .array(boundedId)
      .max(64)
      .refine((items) => noDuplicates(items, (id) => id), "duplicate account id"),
  })
  .strict();

const hiddenColumnsValueSchema = z
  .array(boundedId)
  .max(128)
  .refine((items) => noDuplicates(items, (id) => id), "duplicate column id");

function boundedTableRecord<V extends z.ZodTypeAny>(valueSchema: V) {
  return z
    .record(z.string().min(1).max(ID_MAX), valueSchema)
    .refine((record) => Object.keys(record).length <= 32, "too many table entries");
}

export const profileSettingsSchema = z
  .object({
    version: z.literal(PROFILE_SETTINGS_VERSION),
    accounts: accountsSchema,
    range: rangeSchema,
    dashboard: z
      .object({
        widgets: widgetsSchema,
        kpis: kpisSchema,
      })
      .strict(),
    tables: z
      .object({
        hiddenColumns: boundedTableRecord(hiddenColumnsValueSchema),
      })
      .strict(),
  })
  .strict();

export const profilePatchSchema = z
  .object({
    accounts: accountsSchema.optional(),
    range: rangeSchema.optional(),
    dashboard: z
      .object({
        widgets: widgetsSchema.optional(),
        kpis: kpisSchema.optional(),
      })
      .strict()
      .refine((value) => value.widgets !== undefined || value.kpis !== undefined, "empty dashboard patch")
      .optional(),
    tables: z
      .object({
        hiddenColumns: boundedTableRecord(hiddenColumnsValueSchema.nullable()).refine(
          (record) => Object.keys(record).length > 0,
          "empty hiddenColumns patch",
        ),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (patch) =>
      patch.accounts !== undefined ||
      patch.range !== undefined ||
      patch.dashboard !== undefined ||
      patch.tables !== undefined,
    "patch contains no leaves",
  );

export const DEFAULT_PROFILE: ProfileSettingsV1 = {
  version: 1,
  accounts: { selected: ["18528700SCHW"] },
  range: { preset: "kapman-start", startDate: null, endDate: null },
  dashboard: { widgets: null, kpis: null },
  tables: { hiddenColumns: {} },
};

export function cloneDefaultProfile(): ProfileSettingsV1 {
  return JSON.parse(JSON.stringify(DEFAULT_PROFILE)) as ProfileSettingsV1;
}

export function settingsByteLength(settings: ProfileSettingsV1): number {
  return new TextEncoder().encode(JSON.stringify(settings)).length;
}

/** How a stored `settings` JSON value classifies for GET/merge semantics. */
export type StoredSettingsState =
  | { kind: "valid"; settings: ProfileSettingsV1 }
  /// Fails the v1 schema without claiming a newer version — treated as absent.
  | { kind: "malformed" }
  /// version is a number > 1: written by a newer app; read-only, never merged.
  | { kind: "unsupported" };

export function classifyStoredSettings(stored: unknown): StoredSettingsState {
  const parsed = profileSettingsSchema.safeParse(stored);
  if (parsed.success) {
    return { kind: "valid", settings: parsed.data };
  }

  if (
    typeof stored === "object" &&
    stored !== null &&
    typeof (stored as { version?: unknown }).version === "number" &&
    (stored as { version: number }).version > PROFILE_SETTINGS_VERSION
  ) {
    return { kind: "unsupported" };
  }

  return { kind: "malformed" };
}

/**
 * Merge a validated patch into a base document at leaf granularity. Leaves
 * absent from the patch come from the base verbatim; each
 * tables.hiddenColumns[tableName] entry replaces (or deletes, for null/empty)
 * only that entry. Returns a new canonical document (never stores empty
 * hidden-column arrays; version is server-controlled).
 */
export function applyProfilePatch(base: ProfileSettingsV1, patch: ProfilePatchV1): ProfileSettingsV1 {
  const hiddenColumns: Record<string, string[]> = { ...base.tables.hiddenColumns };
  if (patch.tables) {
    for (const [tableName, columns] of Object.entries(patch.tables.hiddenColumns)) {
      if (columns === null || columns.length === 0) {
        delete hiddenColumns[tableName];
      } else {
        hiddenColumns[tableName] = [...columns];
      }
    }
  }

  return {
    version: PROFILE_SETTINGS_VERSION,
    accounts: patch.accounts ? { selected: [...patch.accounts.selected] } : { selected: [...base.accounts.selected] },
    range: patch.range ? { ...patch.range } : { ...base.range },
    dashboard: {
      widgets:
        patch.dashboard && patch.dashboard.widgets !== undefined
          ? patch.dashboard.widgets === null
            ? null
            : patch.dashboard.widgets.map((item) => ({ ...item }))
          : base.dashboard.widgets === null
            ? null
            : base.dashboard.widgets.map((item) => ({ ...item })),
      kpis:
        patch.dashboard && patch.dashboard.kpis !== undefined
          ? patch.dashboard.kpis === null
            ? null
            : [...patch.dashboard.kpis]
          : base.dashboard.kpis === null
            ? null
            : [...base.dashboard.kpis],
    },
    tables: { hiddenColumns },
  };
}
