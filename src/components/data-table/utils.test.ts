import { describe, expect, it } from "vitest";
import { applyDataTableFilters, applyDataTableSort, buildFilterOptions } from "@/components/data-table/utils";
import type { DataTableColumnDefinition } from "@/components/data-table/types";

interface TestRow {
  symbol: string;
  importIds: string[];
  realizedPnl: number;
  tradeDate: string;
}

const rows: TestRow[] = [
  { symbol: "SPY", importIds: ["A"], realizedPnl: 20, tradeDate: "2026-04-10T00:00:00.000Z" },
  { symbol: "QQQ", importIds: ["B", "C"], realizedPnl: -5, tradeDate: "2026-04-12T00:00:00.000Z" },
  { symbol: "IWM", importIds: ["C"], realizedPnl: 7, tradeDate: "2026-04-11T00:00:00.000Z" },
];

const columns: DataTableColumnDefinition<TestRow>[] = [
  {
    id: "symbol",
    label: "Symbol",
    filterMode: "discrete",
    getFilterValues: (row) => row.symbol,
    sortMode: "string",
    getSortValue: (row) => row.symbol,
  },
  {
    id: "importIds",
    label: "Import",
    filterMode: "discrete",
    getFilterValues: (row) => row.importIds,
  },
  {
    id: "realizedPnl",
    label: "Realized P&L",
    sortMode: "number",
    getSortValue: (row) => row.realizedPnl,
  },
  {
    id: "tradeDate",
    label: "Trade Date",
    sortMode: "date",
    getSortValue: (row) => row.tradeDate,
  },
];

describe("data table utils", () => {
  it("builds distinct options for discrete columns", () => {
    expect(buildFilterOptions(rows, columns[1])).toEqual([
      { value: "A", label: "A" },
      { value: "B", label: "B" },
      { value: "C", label: "C" },
    ]);
  });

  it("filters rows when a discrete filter matches any row value", () => {
    const filtered = applyDataTableFilters(rows, columns, { importIds: ["C"] });
    expect(filtered.map((row) => row.symbol)).toEqual(["QQQ", "IWM"]);
  });

  it("sorts rows by numeric and date columns", () => {
    const byPnl = applyDataTableSort(rows, columns, { columnId: "realizedPnl", direction: "asc" });
    expect(byPnl.map((row) => row.symbol)).toEqual(["QQQ", "IWM", "SPY"]);

    const byDate = applyDataTableSort(rows, columns, { columnId: "tradeDate", direction: "desc" });
    expect(byDate.map((row) => row.symbol)).toEqual(["QQQ", "IWM", "SPY"]);
  });
});
