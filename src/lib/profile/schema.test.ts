// #344: canonical settings schema, strict patch schema, and leaf-level merge.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROFILE,
  applyProfilePatch,
  classifyStoredSettings,
  cloneDefaultProfile,
  profilePatchSchema,
  profileSettingsSchema,
} from "@/lib/profile/schema";
import type { ProfileSettingsV1 } from "@/types/api";

function validSettings(overrides: Partial<ProfileSettingsV1> = {}): ProfileSettingsV1 {
  return { ...cloneDefaultProfile(), ...overrides };
}

describe("profileSettingsSchema", () => {
  it("accepts the default profile", () => {
    expect(profileSettingsSchema.safeParse(DEFAULT_PROFILE).success).toBe(true);
  });

  it("rejects unknown keys anywhere", () => {
    const doc = { ...validSettings(), rogue: true };
    expect(profileSettingsSchema.safeParse(doc).success).toBe(false);
  });

  it("enforces the canonical range invariant", () => {
    const nonCustomWithDates = validSettings({ range: { preset: "ytd", startDate: "2026-01-01", endDate: "2026-02-01" } });
    expect(profileSettingsSchema.safeParse(nonCustomWithDates).success).toBe(false);

    const customMissingDates = validSettings({ range: { preset: "custom", startDate: "2026-01-01", endDate: null } });
    expect(profileSettingsSchema.safeParse(customMissingDates).success).toBe(false);

    const customReversed = validSettings({ range: { preset: "custom", startDate: "2026-03-01", endDate: "2026-01-01" } });
    expect(profileSettingsSchema.safeParse(customReversed).success).toBe(false);

    const customValid = validSettings({ range: { preset: "custom", startDate: "2026-01-01", endDate: "2026-03-01" } });
    expect(profileSettingsSchema.safeParse(customValid).success).toBe(true);
  });

  it("round-trips [] widget/KPI layouts as intentionally empty", () => {
    const doc = validSettings({ dashboard: { widgets: [], kpis: [] } });
    const parsed = profileSettingsSchema.parse(doc);
    expect(parsed.dashboard.widgets).toEqual([]);
    expect(parsed.dashboard.kpis).toEqual([]);
  });

  it("rejects duplicate widget/KPI/account ids", () => {
    expect(
      profileSettingsSchema.safeParse(validSettings({ accounts: { selected: ["A", "A"] } })).success,
    ).toBe(false);
    expect(
      profileSettingsSchema.safeParse(
        validSettings({
          dashboard: { widgets: [{ widgetId: "w", colSpan: 1 }, { widgetId: "w", colSpan: 2 }], kpis: null },
        }),
      ).success,
    ).toBe(false);
    expect(
      profileSettingsSchema.safeParse(validSettings({ dashboard: { widgets: null, kpis: ["k", "k"] } })).success,
    ).toBe(false);
  });
});

describe("profilePatchSchema", () => {
  it("rejects an empty patch and empty sub-patches", () => {
    expect(profilePatchSchema.safeParse({}).success).toBe(false);
    expect(profilePatchSchema.safeParse({ dashboard: {} }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ tables: { hiddenColumns: {} } }).success).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(profilePatchSchema.safeParse({ accounts: { selected: ["A"] }, rogue: 1 }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ accounts: { selected: ["A"], rogue: 1 } }).success).toBe(false);
  });

  it("accepts single-leaf patches, including deletions", () => {
    expect(profilePatchSchema.safeParse({ dashboard: { widgets: [] } }).success).toBe(true);
    expect(profilePatchSchema.safeParse({ dashboard: { kpis: null } }).success).toBe(true);
    expect(profilePatchSchema.safeParse({ tables: { hiddenColumns: { executions: null } } }).success).toBe(true);
  });
});

describe("classifyStoredSettings", () => {
  it("classifies valid, malformed, and unsupported documents", () => {
    expect(classifyStoredSettings(DEFAULT_PROFILE).kind).toBe("valid");
    expect(classifyStoredSettings({ garbage: true }).kind).toBe("malformed");
    expect(classifyStoredSettings(null).kind).toBe("malformed");
    expect(classifyStoredSettings({ version: 2, future: {} }).kind).toBe("unsupported");
    expect(classifyStoredSettings({ version: "2" }).kind).toBe("malformed");
  });
});

describe("applyProfilePatch", () => {
  it("replaces only the patched leaves, verbatim base elsewhere", () => {
    const base = validSettings({
      dashboard: { widgets: [{ widgetId: "equity-curve", colSpan: 2 }], kpis: ["realized-pnl"] },
      tables: { hiddenColumns: { executions: ["fees"], positions: ["mark"] } },
    });

    const merged = applyProfilePatch(base, { dashboard: { widgets: [] } });
    expect(merged.dashboard.widgets).toEqual([]);
    expect(merged.dashboard.kpis).toEqual(["realized-pnl"]); // untouched sibling leaf
    expect(merged.accounts).toEqual(base.accounts);
    expect(merged.range).toEqual(base.range);
    expect(merged.tables.hiddenColumns).toEqual(base.tables.hiddenColumns);
  });

  it("merges hidden columns per table: replace one, delete another, keep the rest", () => {
    const base = validSettings({
      tables: { hiddenColumns: { executions: ["fees"], positions: ["mark"], setups: ["tag"] } },
    });

    const merged = applyProfilePatch(base, {
      tables: { hiddenColumns: { executions: ["fees", "qty"], positions: null } },
    });
    expect(merged.tables.hiddenColumns).toEqual({ executions: ["fees", "qty"], setups: ["tag"] });
  });

  it("normalizes an empty hidden-columns array to a deleted entry", () => {
    const base = validSettings({ tables: { hiddenColumns: { executions: ["fees"] } } });
    const merged = applyProfilePatch(base, { tables: { hiddenColumns: { executions: [] } } });
    expect(merged.tables.hiddenColumns).toEqual({});
  });
});
