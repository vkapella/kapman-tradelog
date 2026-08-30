import { describe, expect, it } from "vitest";
import type { DataTableColumnDefinition } from "@/components/data-table/types";
import {
  applyDataTableFilters,
  columnSupportsRange,
  countActiveFilters,
  normalizePersistedColumnOrder,
  normalizePersistedRangeFilters,
} from "@/components/data-table/utils";

interface Row {
  symbol: string;
  qty: number | null;
}

const columns: DataTableColumnDefinition<Row>[] = [
  { id: "symbol", label: "Symbol", filterMode: "discrete", getFilterValues: (row) => row.symbol, sortMode: "string", getSortValue: (row) => row.symbol },
  { id: "qty", label: "Qty", sortMode: "number", getSortValue: (row) => row.qty },
];

const rows: Row[] = [
  { symbol: "SPY", qty: 1 },
  { symbol: "SPY", qty: 100 },
  { symbol: "QQQM", qty: 50 },
  { symbol: "NUKZ", qty: null },
];

describe("UI-2 typed filter model (schema 2)", () => {
  it("a v1 payload (no schema key) loads unchanged: no range filters, no order", () => {
    // v1 persisted documents carry only { filters, sort } — the normalizers
    // must produce empty v2 fields rather than throwing or inventing state.
    expect(normalizePersistedRangeFilters(undefined)).toEqual({});
    expect(normalizePersistedColumnOrder(undefined)).toEqual([]);
  });

  it("rejects malformed range payloads and keeps finite bounds", () => {
    expect(
      normalizePersistedRangeFilters({
        qty: { from: 10, to: null },
        bad: { from: "x", to: Infinity },
        alsoBad: "nope",
        empty: { from: null, to: null },
      }),
    ).toEqual({ qty: { from: 10, to: null } });
  });

  it("numeric columns offer the range affordance; string columns do not", () => {
    expect(columnSupportsRange(columns[1])).toBe(true);
    expect(columnSupportsRange(columns[0])).toBe(false);
  });

  it("set and range filters combine (AND) on the data set", () => {
    const filtered = applyDataTableFilters(rows, columns, { symbol: ["SPY"] }, { qty: { from: 50, to: null } });
    expect(filtered).toEqual([{ symbol: "SPY", qty: 100 }]);
  });

  it("an active bound excludes rows whose value is missing", () => {
    const filtered = applyDataTableFilters(rows, columns, {}, { qty: { from: 0, to: null } });
    expect(filtered.map((row) => row.symbol)).toEqual(["SPY", "SPY", "QQQM"]);
  });

  it("range-only bounds work in both directions", () => {
    expect(applyDataTableFilters(rows, columns, {}, { qty: { from: null, to: 50 } }).map((r) => r.qty)).toEqual([1, 50]);
  });

  it("counts set and range filters together", () => {
    expect(countActiveFilters({ symbol: ["SPY"] }, { qty: { from: 1, to: 2 } })).toBe(2);
    expect(countActiveFilters({}, {})).toBe(0);
  });
});
