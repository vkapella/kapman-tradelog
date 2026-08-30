"use client";

import { deriveHiddenActiveState, type TableColumnConfig } from "@/components/data-table/column-config";
import type { DataTableColumnDefinition, DataTableFiltersState, DataTableSortState, SortDirection } from "@/components/data-table/types";

interface HiddenStateChipsProps<Row> {
  configs: TableColumnConfig<Row>[];
  visibleColumns: DataTableColumnDefinition<Row>[];
  sort: DataTableSortState;
  filters: DataTableFiltersState;
  setSort: (sort: { columnId: string | null; direction: SortDirection | null }) => void;
  setColumnFilter: (columnId: string, values: string[]) => void;
}

/**
 * Below md, active sort/filter state on columns that are not visible (tier-2
 * or user-hidden) is surfaced as clearable chips — hidden state is never
 * silent (#340). Table state itself is untouched by tiering.
 */
export function HiddenStateChips<Row>({ configs, visibleColumns, sort, filters, setSort, setColumnFilter }: HiddenStateChipsProps<Row>) {
  const hidden = deriveHiddenActiveState(configs, visibleColumns, sort, filters);
  if (hidden.sortLabel === null && hidden.filters.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 md:hidden" data-hidden-state-chips="">
      {hidden.sortLabel !== null ? (
        <span className="flex items-center gap-1 rounded-full border border-border bg-surface-3 px-2 py-1 text-[11px] text-text-2">
          Sorted: {hidden.sortLabel}
          <button
            type="button"
            aria-label={`Clear sort on ${hidden.sortLabel}`}
            onClick={() => setSort({ columnId: null, direction: null })}
            className="touch-target -m-1 p-1 text-text"
          >
            ✕
          </button>
        </span>
      ) : null}
      {hidden.filters.map((entry) => (
        <span key={entry.columnId} className="flex items-center gap-1 rounded-full border border-border bg-surface-3 px-2 py-1 text-[11px] text-text-2">
          Filter: {entry.label} ({entry.count})
          <button
            type="button"
            aria-label={`Clear filter on ${entry.label}`}
            onClick={() => setColumnFilter(entry.columnId, [])}
            className="touch-target -m-1 p-1 text-text"
          >
            ✕
          </button>
        </span>
      ))}
    </div>
  );
}
