import type {
  DataTableColumnDefinition,
  DataTableFilterOption,
  DataTableFiltersState,
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

export function applyDataTableFilters<Row>(rows: Row[], columns: DataTableColumnDefinition<Row>[], filters: DataTableFiltersState): Row[] {
  const filterableColumns = columns.filter((column) => column.filterMode === "discrete" && column.getFilterValues);
  if (filterableColumns.length === 0) {
    return rows;
  }

  return rows.filter((row) => {
    return filterableColumns.every((column) => {
      const selectedValues = filters[column.id] ?? [];
      if (selectedValues.length === 0) {
        return true;
      }

      const rowValues = normalizeRowFilterValues(column, row);
      return rowValues.some((value) => selectedValues.includes(value));
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

export function countActiveFilters(filters: DataTableFiltersState): number {
  return Object.values(filters).filter((values) => values.length > 0).length;
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

export function normalizeSelectedFilterValues(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => normalizeFilterValue(value as string))));
}
