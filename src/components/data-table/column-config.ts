import type { ReactNode } from "react";
import type { DataTableColumnDefinition, DataTableFiltersState, DataTableRangeFiltersState, DataTableSortState } from "@/components/data-table/types";

/**
 * Unified page-level column configuration (#340). Every rendered artifact —
 * DataTableColumnDefinition set, desktop/mobile grid templates, header cells,
 * row cells, and detail-sheet fields — derives from ONE config array, so they
 * cannot desynchronize. The Recommendations panel's COLUMN_CONFIGS was the
 * starting point; this is the finished shared invariant.
 */
export interface TableColumnConfig<Row> {
  definition: DataTableColumnDefinition<Row>;
  /** Desktop grid track (e.g. "120px", "minmax(320px, 1fr)"). */
  width: string;
  /** Tier-1 track below md; defaults to `width`. */
  mobileWidth?: string;
  /** Tier 1 renders on phones; tier 2 is CSS-hidden below md. Default 1. */
  tier?: 1 | 2;
  /** Renders only below md (e.g. the Details action). Excluded from the desktop template. */
  mobileOnly?: boolean;
  /** Pins the column to the left edge of the horizontal scroller so wide
   *  tables scroll underneath the row's identity (symbol/date). Works in
   *  plain-row rendering; virtualized rows (>1000) use transforms, where
   *  sticky may degrade to normal flow — acceptable, never broken. */
  stickyLeft?: boolean;
  /** Include in the row detail sheet. Default true; the Details action sets false. */
  includeInDetails?: boolean;
  /** Custom header content instead of the standard filterable DataTableHeader. */
  renderHeader?: () => ReactNode;
  renderCell: (row: Row) => ReactNode;
  /** Detail-sheet value; defaults to renderCell. */
  renderDetailValue?: (row: Row) => ReactNode;
}

export function configTier<Row>(config: TableColumnConfig<Row>): 1 | 2 {
  return config.tier ?? 1;
}

/** The complete definition set — useDataTableState always filters/sorts against this. */
export function deriveDefinitions<Row>(configs: TableColumnConfig<Row>[]): DataTableColumnDefinition<Row>[] {
  return configs.map((config) => config.definition);
}

/** Configs surviving the user's persisted column visibility, in config order. */
export function visibleConfigsFor<Row>(
  configs: TableColumnConfig<Row>[],
  visibleColumns: DataTableColumnDefinition<Row>[],
): TableColumnConfig<Row>[] {
  const visibleIds = new Set(visibleColumns.map((column) => column.id));
  return configs.filter((config) => visibleIds.has(config.definition.id));
}

/**
 * UI-2: apply the user's drag-reorder to the visible configs. Identity
 * columns (stickyLeft) stay pinned leading and the mobileOnly Details action
 * stays trailing — only the scrolling data columns reorder. Ids missing from
 * columnOrder (new columns) keep their config position after ordered ones.
 */
export function orderVisibleConfigs<Row>(
  visibleConfigs: TableColumnConfig<Row>[],
  columnOrder: string[],
): TableColumnConfig<Row>[] {
  if (columnOrder.length === 0) {
    return visibleConfigs;
  }

  const lead = visibleConfigs.filter((config) => config.stickyLeft);
  const trail = visibleConfigs.filter((config) => !config.stickyLeft && config.mobileOnly);
  const movable = visibleConfigs.filter((config) => !config.stickyLeft && !config.mobileOnly);

  const orderIndex = new Map(columnOrder.map((id, index) => [id, index]));
  const configIndex = new Map(movable.map((config, index) => [config.definition.id, index]));
  const ordered = [...movable].sort((left, right) => {
    const leftKey = orderIndex.get(left.definition.id) ?? columnOrder.length + (configIndex.get(left.definition.id) ?? 0);
    const rightKey = orderIndex.get(right.definition.id) ?? columnOrder.length + (configIndex.get(right.definition.id) ?? 0);
    return leftKey - rightKey;
  });

  return [...lead, ...ordered, ...trail];
}

/** The reorderable subset's ids, in their current effective order. */
export function movableColumnIds<Row>(orderedVisibleConfigs: TableColumnConfig<Row>[]): string[] {
  return orderedVisibleConfigs
    .filter((config) => !config.stickyLeft && !config.mobileOnly)
    .map((config) => config.definition.id);
}

/** Pure move: shift columnId by delta within the order; clamps at the ends. */
export function moveColumnInOrder(orderedIds: string[], columnId: string, delta: number): string[] {
  const from = orderedIds.indexOf(columnId);
  if (from === -1) {
    return orderedIds;
  }
  const to = Math.max(0, Math.min(orderedIds.length - 1, from + delta));
  if (to === from) {
    return orderedIds;
  }
  const next = [...orderedIds];
  next.splice(from, 1);
  next.splice(to, 0, columnId);
  return next;
}

/** Pure drop: place draggedId at targetId's position. */
export function dropColumnInOrder(orderedIds: string[], draggedId: string, targetId: string): string[] {
  const from = orderedIds.indexOf(draggedId);
  const to = orderedIds.indexOf(targetId);
  if (from === -1 || to === -1 || from === to) {
    return orderedIds;
  }
  const next = [...orderedIds];
  next.splice(from, 1);
  next.splice(to, 0, draggedId);
  return next;
}

/** Desktop template: every visible, non-mobileOnly config's track. */
export function desktopTemplate<Row>(visibleConfigs: TableColumnConfig<Row>[]): string {
  return visibleConfigs.filter((config) => !config.mobileOnly).map((config) => config.width).join(" ");
}

/** Mobile template: visible tier-1 + mobileOnly configs. */
export function mobileTemplate<Row>(visibleConfigs: TableColumnConfig<Row>[]): string {
  return visibleConfigs
    .filter((config) => config.mobileOnly || configTier(config) === 1)
    .map((config) => config.mobileWidth ?? config.width)
    .join(" ");
}

/** Column ids occupying desktop tracks, in order (ID-based alignment tests). */
export function desktopColumnIds<Row>(visibleConfigs: TableColumnConfig<Row>[]): string[] {
  return visibleConfigs.filter((config) => !config.mobileOnly).map((config) => config.definition.id);
}

/** Column ids occupying mobile tracks, in order (ID-based alignment tests). */
export function mobileColumnIds<Row>(visibleConfigs: TableColumnConfig<Row>[]): string[] {
  return visibleConfigs.filter((config) => config.mobileOnly || configTier(config) === 1).map((config) => config.definition.id);
}

/**
 * Per-cell responsive class: mobileOnly cells vanish at md+, tier-2 cells
 * vanish below md. display:none grid items create no tracks, so the remaining
 * cells flow into the breakpoint's template — alignment by construction.
 */
export function configCellClass<Row>(config: TableColumnConfig<Row>, context: "header" | "cell" = "cell"): string {
  const classes: string[] = [];
  if (config.mobileOnly) {
    classes.push("md:hidden");
  } else if (configTier(config) === 2) {
    classes.push("max-md:hidden");
  }
  if (config.stickyLeft) {
    // Header rows carry their own background class, so the pinned header cell
    // inherits it; body rows are transparent, so the pinned body cell paints
    // the section surface to occlude columns scrolling underneath.
    // design-lint-allow: intra-component sticky stacking (decision 53). This is
    // the shared helper the pinned cells come from, so it is the canonical site.
    // The --z-* scale arbitrates BETWEEN page-level components, which is why it
    // starts at 30; a pinned cell only has to sit above the columns scrolling
    // under it, inside the grid's own stacking context. The scale does not
    // extend downward to cover that.
    classes.push("sticky left-0 z-[1]", context === "header" ? "bg-inherit" : "bg-surface");
  }
  return classes.join(" ");
}

/**
 * Detail sheet derives from the COMPLETE config array — never the
 * persisted-visible or tier-1 subsets — so user-hidden columns stay reachable.
 * Only includeInDetails: false (the Details action itself) is excluded.
 */
export function detailConfigs<Row>(configs: TableColumnConfig<Row>[]): TableColumnConfig<Row>[] {
  return configs.filter((config) => config.includeInDetails !== false);
}

export interface HiddenActiveState {
  sortLabel: string | null;
  sortColumnId: string | null;
  filters: Array<{ columnId: string; label: string; count: number }>;
}

/**
 * Sort/filter state whose column is not visible below md (tier-2 or
 * user-hidden): surfaced as chips so hidden state is never silent.
 */
export function deriveHiddenActiveState<Row>(
  configs: TableColumnConfig<Row>[],
  visibleColumns: DataTableColumnDefinition<Row>[],
  sort: DataTableSortState,
  filters: DataTableFiltersState,
  rangeFilters: DataTableRangeFiltersState = {},
): HiddenActiveState {
  const visibleIds = new Set(visibleColumns.map((column) => column.id));
  const mobileVisibleIds = new Set(
    configs
      .filter((config) => visibleIds.has(config.definition.id) && (config.mobileOnly || configTier(config) === 1))
      .map((config) => config.definition.id),
  );
  const labelById = new Map(configs.map((config) => [config.definition.id, config.definition.label]));

  const sortHidden = sort.columnId !== null && !mobileVisibleIds.has(sort.columnId);
  const rangeCount = (columnId: string) => {
    const range = rangeFilters[columnId];
    return range && (range.from !== null || range.to !== null) ? 1 : 0;
  };
  const activeIds = new Set([
    ...Object.entries(filters).filter(([, values]) => values.length > 0).map(([columnId]) => columnId),
    ...Object.keys(rangeFilters).filter((columnId) => rangeCount(columnId) > 0),
  ]);
  const filterEntries = Array.from(activeIds)
    .filter((columnId) => !mobileVisibleIds.has(columnId))
    .map((columnId) => ({
      columnId,
      label: labelById.get(columnId) ?? columnId,
      count: (filters[columnId]?.length ?? 0) + rangeCount(columnId),
    }));

  return {
    sortLabel: sortHidden ? `${labelById.get(sort.columnId as string) ?? sort.columnId} ${sort.direction === "desc" ? "↓" : "↑"}` : null,
    sortColumnId: sortHidden ? sort.columnId : null,
    filters: filterEntries,
  };
}
