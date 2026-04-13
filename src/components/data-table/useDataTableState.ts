import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyDataTableFilters,
  applyDataTableSort,
  buildFilterOptions,
  countActiveFilters,
  normalizePersistedFilters,
  normalizePersistedSort,
  normalizeSelectedFilterValues,
} from "@/components/data-table/utils";
import type {
  DataTableColumnDefinition,
  DataTableFilterOption,
  DataTableFiltersState,
  DataTablePersistedState,
  DataTableSortState,
} from "@/components/data-table/types";

interface UseDataTableStateArgs<Row> {
  tableName: string;
  rows: Row[];
  columns: DataTableColumnDefinition<Row>[];
  initialSort?: DataTableSortState;
}

function arraysEqual(left: string[] | undefined, right: string[]): boolean {
  if (!left) {
    return right.length === 0;
  }

  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export function useDataTableState<Row>({
  tableName,
  rows,
  columns,
  initialSort = { columnId: null, direction: null },
}: UseDataTableStateArgs<Row>) {
  const storageKey = `kapman_table_filters_${tableName}`;
  const [filters, setFilters] = useState<DataTableFiltersState>({});
  const [sort, setSort] = useState<DataTableSortState>(initialSort);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<DataTablePersistedState>;
        setFilters(normalizePersistedFilters(parsed.filters));
        setSort(normalizePersistedSort(parsed.sort));
      }
    } catch {
      setFilters({});
      setSort(initialSort);
    } finally {
      setIsHydrated(true);
    }
  }, [initialSort, storageKey]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    try {
      const payload: DataTablePersistedState = { filters, sort };
      window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // Ignore sessionStorage errors.
    }
  }, [filters, isHydrated, sort, storageKey]);

  const filterOptions = useMemo(() => {
    const entries = columns
      .filter((column) => column.filterMode === "discrete" && column.getFilterValues)
      .map((column) => [column.id, buildFilterOptions(rows, column)] as const);

    return Object.fromEntries(entries) as Record<string, DataTableFilterOption[]>;
  }, [columns, rows]);

  const filteredRows = useMemo(() => applyDataTableFilters(rows, columns, filters), [columns, filters, rows]);
  const sortedRows = useMemo(() => applyDataTableSort(filteredRows, columns, sort), [columns, filteredRows, sort]);
  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);

  const setColumnFilter = useCallback((columnId: string, values: string[]) => {
    setFilters((current) => {
      const normalizedValues = normalizeSelectedFilterValues(values);
      const existingValues = current[columnId];

      if (normalizedValues.length === 0) {
        if (!existingValues || existingValues.length === 0) {
          return current;
        }

        const next = { ...current };
        delete next[columnId];
        return next;
      }

      if (arraysEqual(existingValues, normalizedValues)) {
        return current;
      }

      return {
        ...current,
        [columnId]: normalizedValues,
      };
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({});
    setSort(initialSort);
  }, [initialSort]);

  return {
    activeFilterCount,
    clearAllFilters,
    filterOptions,
    filters,
    isHydrated,
    setColumnFilter,
    setFilters,
    setSort,
    sort,
    sortedRows,
  };
}
