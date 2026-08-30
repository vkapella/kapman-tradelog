import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyDataTableFilters,
  applyDataTableSort,
  buildFilterOptions,
  countActiveFilters,
  getVisibleColumns,
  normalizePersistedColumnOrder,
  normalizePersistedFilters,
  normalizePersistedRangeFilters,
  normalizePersistedSort,
  normalizeSelectedFilterValues,
  toggleHiddenColumn,
} from "@/components/data-table/utils";
import { useProfileContextOptional } from "@/contexts/ProfileContext";
import type {
  DataTableColumnDefinition,
  DataTableFilterOption,
  DataTableFiltersState,
  DataTablePersistedState,
  DataTableRangeFiltersState,
  DataTableRangeState,
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
  // Hidden columns have ONE authority (#344): the per-user profile. In
  // profile mode they seed from the hydrated profile (sanitized against this
  // table's columns for display; the persisted value is untouched) and every
  // visibility edit reports only this table's leaf upward. sessionStorage
  // keeps persisting filters + sort ONLY — a stale hiddenColumns field left in
  // an old session payload is ignored. Without a ProfileProvider (tests,
  // isolated mounts) visibility is in-memory only.
  const profile = useProfileContextOptional();
  const columnIds = useMemo(() => new Set(columns.map((column) => column.id)), [columns]);
  const profileHiddenColumns = profile?.hiddenColumns[tableName];
  const initialHiddenColumns = useCallback(
    () => (profileHiddenColumns ?? []).filter((columnId) => columnIds.has(columnId)),
    [profileHiddenColumns, columnIds],
  );

  const [filters, setFilters] = useState<DataTableFiltersState>({});
  const [rangeFilters, setRangeFilters] = useState<DataTableRangeFiltersState>({});
  const [columnOrder, setColumnOrderState] = useState<string[]>([]);
  const [sort, setSort] = useState<DataTableSortState>(() => defaultSort);
  const [hiddenColumns, setHiddenColumnsState] = useState<string[]>(initialHiddenColumns);
  const [isHydrated, setIsHydrated] = useState(false);
  const lastPersistedPayloadRef = useRef<string | null>(null);
  const appliedProfileGenerationRef = useRef<number | null>(null);

  const hydrationGeneration = profile?.hydrationGeneration ?? null;
  const reportHiddenColumns = profile?.reportHiddenColumns;

  // Apply the profile's hidden columns exactly once per (identity, hydration
  // generation) — a reset/re-hydration re-seeds; a same-generation re-render
  // never overwrites a user edit.
  useEffect(() => {
    if (hydrationGeneration === null || appliedProfileGenerationRef.current === hydrationGeneration) {
      return;
    }
    appliedProfileGenerationRef.current = hydrationGeneration;
    const next = initialHiddenColumns();
    setHiddenColumnsState((current) => (arraysEqual(current, next) ? current : next));
  }, [hydrationGeneration, initialHiddenColumns]);

  useEffect(() => {
    let nextFilters: DataTableFiltersState = {};
    let nextRangeFilters: DataTableRangeFiltersState = {};
    let nextColumnOrder: string[] = [];
    let nextSort = defaultSort;

    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<DataTablePersistedState>;
        nextFilters = normalizePersistedFilters(parsed.filters);
        nextSort = normalizePersistedSort(parsed.sort);
        // v2-only fields (UI-2). A v1 payload has no schema key and no such
        // fields — it keeps loading exactly as before.
        nextRangeFilters = normalizePersistedRangeFilters(parsed.rangeFilters);
        nextColumnOrder = normalizePersistedColumnOrder(parsed.columnOrder);
      }
    } catch {
      nextFilters = {};
      nextRangeFilters = {};
      nextColumnOrder = [];
      nextSort = defaultSort;
    }

    setFilters((current) => (filtersEqual(current, nextFilters) ? current : nextFilters));
    setRangeFilters(nextRangeFilters);
    setColumnOrderState((current) => (arraysEqual(current, nextColumnOrder) ? current : nextColumnOrder));
    setSort((current) => (sortsEqual(current, nextSort) ? current : nextSort));
    setIsHydrated(true);
  }, [defaultSort, storageKey]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    // Filters, ranges, column order, and sort — hiddenColumns is deliberately
    // NOT persisted here (its authority is the per-user profile, #344).
    const payload = JSON.stringify({ schema: 2, filters, rangeFilters, columnOrder, sort } satisfies DataTablePersistedState);
    if (payload === lastPersistedPayloadRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(storageKey, payload);
        lastPersistedPayloadRef.current = payload;
      } catch {
        // Ignore sessionStorage errors.
      }
    }, 150);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [columnOrder, filters, isHydrated, rangeFilters, sort, storageKey]);

  // User visibility edits report upward AFTER commit (an effect), never from
  // inside the state updater — profile-seeded changes bypass this wrapper and
  // therefore never report.
  const pendingVisibilityReportRef = useRef<string[] | null>(null);
  const setHiddenColumns = useCallback((updater: (current: string[]) => string[]) => {
    setHiddenColumnsState((current) => {
      const next = updater(current);
      if (!arraysEqual(current, next)) {
        pendingVisibilityReportRef.current = next;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (pendingVisibilityReportRef.current === null) {
      return;
    }
    const next = pendingVisibilityReportRef.current;
    pendingVisibilityReportRef.current = null;
    reportHiddenColumns?.(tableName, next);
  }, [hiddenColumns, reportHiddenColumns, tableName]);

  const filterOptions = useMemo(() => {
    const entries = columns
      .filter((column) => column.filterMode === "discrete" && column.getFilterValues)
      .map((column) => [column.id, buildFilterOptions(rows, column)] as const);

    return Object.fromEntries(entries) as Record<string, DataTableFilterOption[]>;
  }, [columns, rows]);

  const filteredRows = useMemo(() => applyDataTableFilters(rows, columns, filters, rangeFilters), [columns, filters, rangeFilters, rows]);
  const sortedRows = useMemo(() => applyDataTableSort(filteredRows, columns, sort), [columns, filteredRows, sort]);
  const activeFilterCount = useMemo(() => countActiveFilters(filters, rangeFilters), [filters, rangeFilters]);

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

  const setColumnRange = useCallback((columnId: string, range: DataTableRangeState | null) => {
    setRangeFilters((current) => {
      const active = range !== null && (range.from !== null || range.to !== null);
      const existing = current[columnId];
      if (!active) {
        if (!existing) {
          return current;
        }
        const next = { ...current };
        delete next[columnId];
        return next;
      }
      if (existing && existing.from === range.from && existing.to === range.to) {
        return current;
      }
      return { ...current, [columnId]: { from: range.from, to: range.to } };
    });
  }, []);

  const setColumnOrder = useCallback((order: string[]) => {
    setColumnOrderState((current) => (arraysEqual(current, order) ? current : [...order]));
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({});
    setRangeFilters({});
    setSort(defaultSort);
  }, [defaultSort]);

  const setColumnVisibility = useCallback(
    (columnId: string, visible: boolean) => {
      setHiddenColumns((current) => toggleHiddenColumn(current, columnId, visible));
    },
    [setHiddenColumns],
  );

  const resetColumnVisibility = useCallback(() => {
    setHiddenColumns((current) => (current.length === 0 ? current : []));
  }, [setHiddenColumns]);

  const visibleColumns = useMemo(() => getVisibleColumns(columns, hiddenColumns), [columns, hiddenColumns]);

  return {
    activeFilterCount,
    clearAllFilters,
    columnOrder,
    filterOptions,
    filters,
    hiddenColumns,
    isHydrated,
    rangeFilters,
    resetColumnVisibility,
    setColumnFilter,
    setColumnOrder,
    setColumnRange,
    setColumnVisibility,
    setFilters,
    setSort,
    sort,
    sortedRows,
    visibleColumns,
  };
}

export type DataTableState<Row> = ReturnType<typeof useDataTableState<Row>>;
