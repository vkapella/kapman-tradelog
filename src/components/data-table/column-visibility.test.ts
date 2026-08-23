import { describe, expect, it } from "vitest";
import { getVisibleColumns, normalizePersistedHiddenColumns, toggleHiddenColumn } from "@/components/data-table/utils";
import type { DataTableColumnDefinition, DataTablePersistedState } from "@/components/data-table/types";

interface TestRow {
  ticker: string;
}

const columns: DataTableColumnDefinition<TestRow>[] = [
  { id: "ticker", label: "Ticker", alwaysVisible: true },
  { id: "reason", label: "Reason" },
  { id: "sizingBand", label: "Sizing band" },
];

describe("normalizePersistedHiddenColumns", () => {
  it("keeps only unique non-empty strings", () => {
    expect(normalizePersistedHiddenColumns(["reason", "reason", "", 3, null, "sizingBand"])).toEqual([
      "reason",
      "sizingBand",
    ]);
  });

  it("returns an empty set for payloads persisted before column visibility existed", () => {
    expect(normalizePersistedHiddenColumns(undefined)).toEqual([]);
    expect(normalizePersistedHiddenColumns("reason")).toEqual([]);
    expect(normalizePersistedHiddenColumns({ reason: true })).toEqual([]);
  });

  it("round-trips through the persisted payload shape", () => {
    const payload = JSON.stringify({
      filters: {},
      sort: { columnId: null, direction: null },
      hiddenColumns: ["reason"],
    } satisfies DataTablePersistedState);
    const parsed = JSON.parse(payload) as Partial<DataTablePersistedState>;

    expect(normalizePersistedHiddenColumns(parsed.hiddenColumns)).toEqual(["reason"]);
  });
});

describe("toggleHiddenColumn", () => {
  it("hides and re-shows a column", () => {
    const hidden = toggleHiddenColumn([], "reason", false);
    expect(hidden).toEqual(["reason"]);
    expect(toggleHiddenColumn(hidden, "reason", true)).toEqual([]);
  });

  it("returns the same array when nothing changes, so state updates can bail out", () => {
    const hidden = ["reason"];
    expect(toggleHiddenColumn(hidden, "reason", false)).toBe(hidden);
    expect(toggleHiddenColumn(hidden, "sizingBand", true)).toBe(hidden);
  });
});

describe("getVisibleColumns", () => {
  it("filters hidden columns but never an alwaysVisible column", () => {
    const visible = getVisibleColumns(columns, ["reason", "ticker"]);
    expect(visible.map((column) => column.id)).toEqual(["ticker", "sizingBand"]);
  });

  it("ignores hidden ids that no longer match a column", () => {
    const visible = getVisibleColumns(columns, ["removedColumn"]);
    expect(visible.map((column) => column.id)).toEqual(["ticker", "reason", "sizingBand"]);
  });

  it("returns the original array untouched when nothing is hidden", () => {
    expect(getVisibleColumns(columns, [])).toBe(columns);
  });
});
