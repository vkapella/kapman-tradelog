"use client";

import { memo, useRef } from "react";
import { ColumnFilterPanel } from "@/components/data-table/ColumnFilterPanel";
import type { DataTableColumnDefinition, DataTableFilterOption, DataTableRangeState, SortDirection } from "@/components/data-table/types";


interface DataTableHeaderProps<Row> {
  as?: "th" | "div";
  className?: string;
  column: DataTableColumnDefinition<Row>;
  currentSortDirection: SortDirection | null;
  currentValues: string[];
  currentRange?: DataTableRangeState | null;
  isOpen: boolean;
  onApply: (values: string[], direction: SortDirection | null, range: DataTableRangeState | null) => void;
  onRequestClose: () => void;
  onToggle: () => void;
  options: DataTableFilterOption[];
}

function alignmentClassName<Row>(align: DataTableColumnDefinition<Row>["align"]): string {
  if (align === "right") {
    return "justify-end text-right";
  }

  if (align === "center") {
    return "justify-center text-center";
  }

  return "justify-between text-left";
}

function nextSortDirection<Row>(column: DataTableColumnDefinition<Row>, current: SortDirection | null): SortDirection | null {
  const first = column.defaultSortDirection ?? "desc";
  if (current === null) {
    return first;
  }
  if (current === first) {
    return first === "desc" ? "asc" : "desc";
  }
  return null;
}

function DataTableHeaderInner<Row>({
  as = "th",
  className,
  column,
  currentSortDirection,
  currentValues,
  currentRange = null,
  isOpen,
  onApply,
  onRequestClose,
  onToggle,
  options,
}: DataTableHeaderProps<Row>) {
  const rangeActive = Boolean(currentRange && (currentRange.from !== null || currentRange.to !== null));
  const filterCount = currentValues.length + (rangeActive ? 1 : 0);
  const isActive = filterCount > 0 || Boolean(currentSortDirection);
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);
  const Component = as;

  // Below md the per-column funnel is hidden (see the touch audit: six 44px
  // funnel targets measure past the 375px tier-1 budget) and the whole header
  // cell becomes a large sort-toggle target instead; filter initiation is a
  // >=md workflow, while active filters stay visible + clearable via chips.
  function handleHeaderTap() {
    if (!window.matchMedia("(max-width: 767px)").matches) {
      return;
    }
    onApply(currentValues, nextSortDirection(column, currentSortDirection), currentRange);
  }

  return (
    <Component
      className={["relative px-2 py-2", className].filter(Boolean).join(" ")}
      title={column.title}
      role={as === "div" ? "columnheader" : undefined}
      aria-sort={currentSortDirection === null ? undefined : currentSortDirection === "asc" ? "ascending" : "descending"}
      onClick={handleHeaderTap}
    >
      <div className={["flex items-center gap-2 max-md:gap-1", alignmentClassName<Row>(column.align)].join(" ")}>
        <span className="font-medium" data-header-label="">{column.label}</span>
        {currentSortDirection !== null ? (
          <span aria-hidden="true" className="text-[9px] text-accent">{currentSortDirection === "asc" ? "▲" : "▼"}</span>
        ) : null}
        <button
          ref={filterButtonRef}
          type="button"
          onClick={onToggle}
          className={(isActive ? "rounded border border-accent-border bg-accent-dim p-1 text-accent" : "rounded border border-transparent p-1 text-inherit hover:border-border hover:bg-surface-3") + " relative max-md:hidden"}
          aria-label={`Filter ${column.label}`}
          aria-expanded={isOpen}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
            <path d="M4 6h16l-6 7v5l-4 2v-7L4 6z" />
          </svg>
          {filterCount > 0 ? (
            <span
              aria-label={`${filterCount} active filter${filterCount === 1 ? "" : "s"}`}
              className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 font-mono text-[8px] font-bold"
              style={{ color: "var(--surface)" }}
            >
              {filterCount}
            </span>
          ) : null}
        </button>
      </div>
      {isOpen ? (
        <ColumnFilterPanel
          anchorRef={filterButtonRef}
          column={column}
          currentSortDirection={currentSortDirection}
          currentValues={currentValues}
          currentRange={currentRange}
          onApply={onApply}
          onClose={onRequestClose}
          options={options}
        />
      ) : null}
    </Component>
  );
}

export const DataTableHeader = memo(DataTableHeaderInner) as typeof DataTableHeaderInner;
