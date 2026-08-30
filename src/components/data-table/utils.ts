import type {
  DataTableColumnDefinition,
  DataTableFilterOption,
  DataTableFiltersState,
  DataTableRangeFiltersState,
  DataTableRangeState,
  DataTableSortMode,
  DataTableSortState,
  SortDirection,
} from "@/components/data-table/types";

const EMPTY_FILTER_VALUE = "__EMPTY__";

function normalizeFilterValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return EMPTY_FILTER_VALUE;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : EMPTY_FILTER_VALUE;
}

function denormalizeFilterValue(value: string): string {
  return value === EMPTY_FILTER_VALUE ? "\u2014" : value;
}

function normalizeRowFilterValues<Row>(column: DataTableColumnDefinition<Row>, row: Row): string[] {
  if (!column.getFilterValues) {
    return [];
  }

  const rawValue = column.getFilterValues(row);
  const rawValues = Array.isArray(rawValue) ? rawValue : [rawValue];
  const values = Array.from(new Set(rawValues.map((value) => normalizeFilterValue(value))));
  return values.length > 0 ? values : [EMPTY_FILTER_VALUE];
}

function compareStringValues(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function compareNumberValues(left: number, right: number): number {
  return left - right;
}

function compareDateValues(left: Date, right: Date): number {
  return left.getTime() - right.getTime();
}

function resolveSortValue<Row>(column: DataTableColumnDefinition<Row>, row: Row): string | number | Date | null {
  if (column.getSortValue) {
    const value = column.getSortValue(row);
    return value ?? null;
  }

  if (!column.getFilterValues) {
    return null;
  }

  const [firstValue] = normalizeRowFilterValues(column, row);
  return denormalizeFilterValue(firstValue);
}

function compareSortValues(mode: DataTableSortMode, left: string | number | Date | null, right: string | number | Date | null): number {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  if (mode === "number") {
    return compareNumberValues(Number(left), Number(right));
  }

  if (mode === "date") {
    return compareDateValues(new Date(left), new Date(right));
  }

  return compareStringValues(String(left), String(right));
}

export function buildFilterOptions<Row>(rows: Row[], column: DataTableColumnDefinition<Row>): DataTableFilterOption[] {
  const optionMap = new Map<string, string>();

  for (const row of rows) {
    for (const value of normalizeRowFilterValues(column, row)) {
      if (optionMap.has(value)) {
        continue;
      }

      const label = column.getFilterOptionLabel ? column.getFilterOptionLabel(denormalizeFilterValue(value)) : denormalizeFilterValue(value);
      optionMap.set(value, label);
    }
  }

  return Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => compareStringValues(left.label, right.label));
}

/** UI-2: a column offers the numeric min/max range when it sorts numerically —
 *  no per-column flag, so every numeric column gets the affordance. */
export function columnSupportsRange<Row>(column: DataTableColumnDefinition<Row>): boolean {
  return column.sortMode === "number" && Boolean(column.getSortValue ?? column.getFilterValues);
}

function resolveRangeValue<Row>(column: DataTableColumnDefinition<Row>, row: Row): number | null {
  const value = resolveSortValue(column, row);
  if (value === null) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function rangeIsActive(range: DataTableRangeState | undefined): range is DataTableRangeState {
  return Boolean(range && (range.from !== null || range.to !== null));
}

export function applyDataTableFilters<Row>(
  rows: Row[],
  columns: DataTableColumnDefinition<Row>[],
  filters: DataTableFiltersState,
  rangeFilters: DataTableRangeFiltersState = {},
): Row[] {
  const setColumns = columns.filter((column) => column.filterMode === "discrete" && column.getFilterValues);
  const rangeColumns = columns.filter((column) => columnSupportsRange(column) && rangeIsActive(rangeFilters[column.id]));
  if (setColumns.length === 0 && rangeColumns.length === 0) {
    return rows;
  }

  return rows.filter((row) => {
    const setPass = setColumns.every((column) => {
      const selectedValues = filters[column.id] ?? [];
      if (selectedValues.length === 0) {
        return true;
      }

      const rowValues = normalizeRowFilterValues(column, row);
      return rowValues.some((value) => selectedValues.includes(value));
    });
    if (!setPass) {
      return false;
    }

    // Set and range AND together on the same column (UI-2 acceptance).
    return rangeColumns.every((column) => {
      const range = rangeFilters[column.id];
      const value = resolveRangeValue(column, row);
      if (value === null) {
        return false; // an active numeric bound excludes rows with no number
      }
      if (range.from !== null && value < range.from) {
        return false;
      }
      return !(range.to !== null && value > range.to);
    });
  });
}

export function applyDataTableSort<Row>(rows: Row[], columns: DataTableColumnDefinition<Row>[], sort: DataTableSortState): Row[] {
  if (!sort.columnId || !sort.direction) {
    return rows;
  }

  const column = columns.find((entry) => entry.id === sort.columnId);
  if (!column?.sortMode) {
    return rows;
  }

  const sorted = [...rows].sort((left, right) => {
    const result = compareSortValues(column.sortMode!, resolveSortValue(column, left), resolveSortValue(column, right));
    return sort.direction === "asc" ? result : result * -1;
  });

  return sorted;
}

export function countActiveFilters(filters: DataTableFiltersState, rangeFilters: DataTableRangeFiltersState = {}): number {
  const setActive = Object.values(filters).filter((values) => values.length > 0).length;
  const rangeActive = Object.values(rangeFilters).filter((range) => rangeIsActive(range)).length;
  return setActive + rangeActive;
}

export function getNextSortDirection(currentSort: DataTableSortState, columnId: string, defaultDirection: SortDirection = "asc"): SortDirection {
  if (currentSort.columnId !== columnId || !currentSort.direction) {
    return defaultDirection;
  }

  return currentSort.direction === "asc" ? "desc" : "asc";
}

export function normalizePersistedFilters(filters: unknown): DataTableFiltersState {
  if (!filters || typeof filters !== "object") {
    return {};
  }

  const entries = Object.entries(filters as Record<string, unknown>)
    .map(([key, value]) => [key, Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []] as const)
    .filter(([, value]) => value.length > 0);

  return Object.fromEntries(entries);
}

export function normalizePersistedSort(sort: unknown): DataTableSortState {
  if (!sort || typeof sort !== "object") {
    return { columnId: null, direction: null };
  }

  const candidate = sort as { columnId?: unknown; direction?: unknown };
  return {
    columnId: typeof candidate.columnId === "string" ? candidate.columnId : null,
    direction: candidate.direction === "asc" || candidate.direction === "desc" ? candidate.direction : null,
  };
}

export function normalizePersistedRangeFilters(value: unknown): DataTableRangeFiltersState {
  if (!value || typeof value !== "object") {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, candidate]) => {
      if (!candidate || typeof candidate !== "object") {
        return null;
      }
      const record = candidate as { from?: unknown; to?: unknown };
      const from = typeof record.from === "number" && Number.isFinite(record.from) ? record.from : null;
      const to = typeof record.to === "number" && Number.isFinite(record.to) ? record.to : null;
      if (from === null && to === null) {
        return null;
      }
      return [key, { from, to }] as const;
    })
    .filter((entry): entry is readonly [string, DataTableRangeState] => entry !== null);

  return Object.fromEntries(entries);
}

export function normalizePersistedColumnOrder(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)));
}

export function normalizeSelectedFilterValues(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => normalizeFilterValue(value as string))));
}

export function normalizePersistedHiddenColumns(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)));
}

export function toggleHiddenColumn(hiddenColumns: string[], columnId: string, visible: boolean): string[] {
  const isHidden = hiddenColumns.includes(columnId);

  if (visible) {
    return isHidden ? hiddenColumns.filter((entry) => entry !== columnId) : hiddenColumns;
  }

  return isHidden ? hiddenColumns : [...hiddenColumns, columnId];
}

export function getVisibleColumns<Row>(
  columns: DataTableColumnDefinition<Row>[],
  hiddenColumns: string[],
): DataTableColumnDefinition<Row>[] {
  if (hiddenColumns.length === 0) {
    return columns;
  }

  return columns.filter((column) => column.alwaysVisible || !hiddenColumns.includes(column.id));
}
