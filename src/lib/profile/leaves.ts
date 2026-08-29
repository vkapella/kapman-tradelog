// Leaf-key utilities (#344). The autosave machine, pending journal, and PUT
// patch builder all address the profile document by logical leaf:
//   "accounts" | "range" | "dashboard.widgets" | "dashboard.kpis" |
//   "tables.hiddenColumns.<tableName>"
// A hidden-columns leaf value of null (or []) means "delete that table's
// entry" — the canonical document never stores empty arrays.

import { z } from "zod";
import type { ProfilePatchV1, ProfileRange, ProfileSettingsV1, ProfileWidgetItem } from "@/types/api";

export const LEAF_ACCOUNTS = "accounts";
export const LEAF_RANGE = "range";
export const LEAF_WIDGETS = "dashboard.widgets";
export const LEAF_KPIS = "dashboard.kpis";
export const HIDDEN_COLUMNS_LEAF_PREFIX = "tables.hiddenColumns.";

export function hiddenColumnsLeaf(tableName: string): string {
  return `${HIDDEN_COLUMNS_LEAF_PREFIX}${tableName}`;
}

const boundedId = z.string().trim().min(1).max(128);

const leafValueSchemas: Record<string, z.ZodTypeAny> = {
  [LEAF_ACCOUNTS]: z.array(boundedId).max(64),
  [LEAF_RANGE]: z
    .object({
      preset: z.enum(["kapman-start", "all", "ytd", "1yr", "3yr", "30d", "7d", "custom"]),
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
    })
    .strict(),
  [LEAF_WIDGETS]: z
    .array(z.object({ widgetId: boundedId, colSpan: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).strict())
    .max(64)
    .nullable(),
  [LEAF_KPIS]: z.array(boundedId).max(64).nullable(),
};

export function isValidLeafValue(key: string, value: unknown): boolean {
  if (key.startsWith(HIDDEN_COLUMNS_LEAF_PREFIX)) {
    return z.array(boundedId).max(128).nullable().safeParse(value).success;
  }
  const schema = leafValueSchemas[key];
  return schema ? schema.safeParse(value).success : false;
}

/** The canonical document's value for a leaf; hidden-columns absence -> null. */
export function leafValueFromSettings(settings: ProfileSettingsV1, key: string): unknown {
  if (key === LEAF_ACCOUNTS) return settings.accounts.selected;
  if (key === LEAF_RANGE) return settings.range;
  if (key === LEAF_WIDGETS) return settings.dashboard.widgets;
  if (key === LEAF_KPIS) return settings.dashboard.kpis;
  if (key.startsWith(HIDDEN_COLUMNS_LEAF_PREFIX)) {
    const tableName = key.slice(HIDDEN_COLUMNS_LEAF_PREFIX.length);
    return settings.tables.hiddenColumns[tableName] ?? null;
  }
  return undefined;
}

/** Build one PUT patch covering exactly the given leaves. */
export function buildPatchFromLeaves(leaves: ReadonlyMap<string, unknown>): ProfilePatchV1 {
  const patch: ProfilePatchV1 = {};
  leaves.forEach((value, key) => {
    if (key === LEAF_ACCOUNTS) {
      patch.accounts = { selected: value as string[] };
    } else if (key === LEAF_RANGE) {
      patch.range = value as ProfileRange;
    } else if (key === LEAF_WIDGETS) {
      patch.dashboard = { ...patch.dashboard, widgets: value as ProfileWidgetItem[] | null };
    } else if (key === LEAF_KPIS) {
      patch.dashboard = { ...patch.dashboard, kpis: value as string[] | null };
    } else if (key.startsWith(HIDDEN_COLUMNS_LEAF_PREFIX)) {
      const tableName = key.slice(HIDDEN_COLUMNS_LEAF_PREFIX.length);
      const columns = value as string[] | null;
      patch.tables = {
        hiddenColumns: {
          ...(patch.tables?.hiddenColumns ?? {}),
          [tableName]: columns && columns.length > 0 ? columns : null,
        },
      };
    }
  });
  return patch;
}

/**
 * Deep structural equality for leaf values. Only for hidden-columns leaves is
 * [] canonically aliased to null (a deleted entry) — for widgets/KPIs, [] is
 * "intentionally empty" and distinct from null ("built-in layout").
 */
export function leafEqual(key: string, left: unknown, right: unknown): boolean {
  if (key.startsWith(HIDDEN_COLUMNS_LEAF_PREFIX)) {
    const l = Array.isArray(left) && left.length === 0 ? null : left;
    const r = Array.isArray(right) && right.length === 0 ? null : right;
    return deepEqual(l, r);
  }
  return deepEqual(left, right);
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => deepEqual(item, right[index]));
  }
  if (typeof left === "object" && typeof right === "object" && left !== null && right !== null) {
    const leftKeys = Object.keys(left as Record<string, unknown>).sort();
    const rightKeys = Object.keys(right as Record<string, unknown>).sort();
    if (!deepEqual(leftKeys, rightKeys)) return false;
    return leftKeys.every((key) =>
      deepEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
    );
  }
  return false;
}
