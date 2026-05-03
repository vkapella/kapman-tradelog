"use client";

import type { ReactNode } from "react";

interface DataTableToolbarProps {
  activeFilterCount: number;
  children?: ReactNode;
  onClearAllFilters: () => void;
  onToggleShowAll: () => void;
  showAll: boolean;
  totalRows: number;
}

export function DataTableToolbar({
  activeFilterCount,
  children,
  onClearAllFilters,
  onToggleShowAll,
  showAll,
  totalRows,
}: DataTableToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {activeFilterCount > 0 ? (
          <>
            <span className="rounded-full bg-[color:var(--accent-dim)] px-2 py-1 text-xs text-accent">{activeFilterCount} active filter{activeFilterCount === 1 ? "" : "s"}</span>
            <button type="button" onClick={onClearAllFilters} className="rounded border border-border bg-surface px-3 py-1.5 text-xs text-text">
              Clear all filters
            </button>
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {children}
        <button type="button" onClick={onToggleShowAll} className="rounded border border-border bg-surface px-3 py-1.5 text-xs text-text">
          {showAll ? "Show pages" : `Show all ${totalRows}`}
        </button>
      </div>
    </div>
  );
}
