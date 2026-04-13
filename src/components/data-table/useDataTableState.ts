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

function filtersEqual(left: DataTableFiltersState, right: DataTableFiltersState): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();

  if (!arraysEqual(leftKeys, rightKeys)) {
    return false;
  }

  return leftKeys.every((key) => arraysEqual(left[key], right[key] ?? []));
}

function sortsEqual(left: DataTableSortState, right: DataTableSortState): boolean {
  return left.columnId === right.columnId && left.direction === right.direction;
}

export function useDataTableState<Row>({
  tableName,
  rows,
  columns,
  initialSort = { columnId: null, direction: null },
}: UseDataTableStateArgs<Row>) {
  const storageKey = `kapman_table_filters_${tableName}`;
  const defaultSort = useMemo(
    () =>
      normalizePersistedSort({
        columnId: initialSort.columnId ?? null,
        direction: initialSort.direction ?? null,
      }),
    [initialSort.columnId, initialSort.direction],
  );
  const [filters, setFilters] = useState<DataTableFiltersState>({});
  const [sort, setSort] = useState<DataTableSortState>(() => defaultSort);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let nextFilters: DataTableFiltersState = {};
    let nextSort = defaultSort;

    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<DataTablePersistedState>;
        nextFilters = normalizePersistedFilters(parsed.filters);
        nextSort = normalizePersistedSort(parsed.sort);
      }
    } catch {
      nextFilters = {};
      nextSort = defaultSort;
    }

    setFilters((current) => (filtersEqual(current, nextFilters) ? current : nextFilters));
    setSort((current) => (sortsEqual(current, nextSort) ? current : nextSort));
    setIsHydrated(true);
  }, [defaultSort, storageKey]);

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
    setSort(defaultSort);
  }, [defaultSort]);

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
