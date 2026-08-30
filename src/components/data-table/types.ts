export type SortDirection = "asc" | "desc";
export type DataTableSortMode = "string" | "number" | "date";
export type DataTableFilterMode = "discrete";
export type DataTableCellAlign = "left" | "right" | "center";

export interface DataTableSortState {
  columnId: string | null;
  direction: SortDirection | null;
}

export type DataTableFiltersState = Record<string, string[]>;

/** UI-2: numeric min/max predicate. Either bound may be open (null). */
export interface DataTableRangeState {
  from: number | null;
  to: number | null;
}

export type DataTableRangeFiltersState = Record<string, DataTableRangeState>;

/** UI-2: the typed persisted-view model. `schema` is absent on documents
 *  written before range filters and column order existed — those load as v1
 *  (set filters + sort only) and keep working unchanged. */
export interface DataTablePersistedState {
  schema?: 2;
  filters: DataTableFiltersState;
  /** v2 only. A column may carry BOTH a set filter and a range; they AND. */
  rangeFilters?: DataTableRangeFiltersState;
  /** v2 only. Visible-column order chosen by drag-reorder; ids not listed
   *  keep their config order. */
  columnOrder?: string[];
  sort: DataTableSortState;
  /** Column ids the user has hidden via the Columns chooser. Absent in payloads persisted before column visibility existed. */
  hiddenColumns?: string[];
}

export interface DataTableFilterOption {
  value: string;
  label: string;
}

export interface DataTableColumnDefinition<Row> {
  id: string;
  label: string;
  /** When true the column cannot be hidden via the Columns chooser. */
  alwaysVisible?: boolean;
  align?: DataTableCellAlign;
  title?: string;
  filterMode?: DataTableFilterMode;
  getFilterValues?: (row: Row) => string | number | null | undefined | Array<string | number | null | undefined>;
  getFilterOptionLabel?: (value: string) => string;
  sortMode?: DataTableSortMode;
  getSortValue?: (row: Row) => string | number | Date | null | undefined;
  defaultSortDirection?: SortDirection;
  panelWidthClassName?: string;
}
