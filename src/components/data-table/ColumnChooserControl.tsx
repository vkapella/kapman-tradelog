"use client";

import { useEffect, useRef, useState } from "react";
import type { DataTableColumnDefinition } from "@/components/data-table/types";

interface ColumnChooserControlProps<Row> {
  columns: DataTableColumnDefinition<Row>[];
  hiddenColumns: string[];
  onSetColumnVisibility: (columnId: string, visible: boolean) => void;
  onResetColumnVisibility: () => void;
}

/**
 * Toolbar dropdown for showing/hiding table columns. Pairs with
 * useDataTableState, which persists the hidden set alongside filters and
 * sort, so any panel using the hook can adopt it as-is.
 */
export function ColumnChooserControl<Row>({
  columns,
  hiddenColumns,
  onSetColumnVisibility,
  onResetColumnVisibility,
}: ColumnChooserControlProps<Row>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const hideableColumns = columns.filter((column) => !column.alwaysVisible);
  const hiddenCount = hideableColumns.filter((column) => hiddenColumns.includes(column.id)).length;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        className={
          hiddenCount > 0
            ? "rounded border border-[color:var(--accent-border)] bg-[color:var(--accent-dim)] px-3 py-1.5 text-xs text-accent"
            : "rounded border border-border bg-surface px-3 py-1.5 text-xs text-text"
        }
      >
        Columns{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ""}
      </button>
      {isOpen ? (
        <div className="absolute right-0 top-full z-[var(--z-modal)] mt-2 w-60 rounded-lg border border-border bg-bg p-3 text-xs text-text shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
            <p className="font-semibold text-text">Visible columns</p>
            <button type="button" onClick={onResetColumnVisibility} className="text-accent underline">
              Show all
            </button>
          </div>
          <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">
            {hideableColumns.map((column) => (
              <label key={column.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-surface-2">
                <input
                  type="checkbox"
                  checked={!hiddenColumns.includes(column.id)}
                  onChange={(event) => onSetColumnVisibility(column.id, event.target.checked)}
                />
                <span>{column.label}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
