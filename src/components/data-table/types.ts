export type SortDirection = "asc" | "desc";
export type DataTableSortMode = "string" | "number" | "date";
export type DataTableFilterMode = "discrete";
export type DataTableCellAlign = "left" | "right" | "center";

export interface DataTableSortState {
  columnId: string | null;
  direction: SortDirection | null;
}

export type DataTableFiltersState = Record<string, string[]>;

export interface DataTablePersistedState {
  filters: DataTableFiltersState;
  sort: DataTableSortState;
}

export interface DataTableFilterOption {
  value: string;
  label: string;
}

export interface DataTableColumnDefinition<Row> {
  id: string;
  label: string;
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
