"use client";

import { memo, useRef } from "react";
import { ColumnFilterPanel } from "@/components/data-table/ColumnFilterPanel";
import type { DataTableColumnDefinition, DataTableFilterOption, SortDirection } from "@/components/data-table/types";

interface DataTableHeaderProps<Row> {
  column: DataTableColumnDefinition<Row>;
  currentSortDirection: SortDirection | null;
  currentValues: string[];
  isOpen: boolean;
  onApply: (values: string[], direction: SortDirection | null) => void;
  onToggle: () => void;
  options: DataTableFilterOption[];
}

function alignmentClassName(align: DataTableColumnDefinition<unknown>["align"]): string {
  if (align === "right") {
    return "justify-end text-right";
  }

  if (align === "center") {
    return "justify-center text-center";
  }

  return "justify-between text-left";
}

function DataTableHeaderInner<Row>({
  column,
  currentSortDirection,
  currentValues,
  isOpen,
  onApply,
  onToggle,
  options,
}: DataTableHeaderProps<Row>) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const isActive = currentValues.length > 0 || Boolean(currentSortDirection);

  return (
    <th className="relative px-2 py-2" title={column.title}>
      <div className={["flex items-center gap-2", alignmentClassName(column.align)].join(" ")}>
        <span className="font-medium">{column.label}</span>
        <button
          ref={triggerRef}
          type="button"
          onClick={onToggle}
          className={isActive ? "rounded border border-blue-400/50 bg-blue-500/20 p-1 text-blue-100" : "rounded border border-transparent p-1 text-inherit hover:border-slate-600 hover:bg-slate-800/60"}
          aria-label={`Filter ${column.label}`}
          aria-expanded={isOpen}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
            <path d="M4 6h16l-6 7v5l-4 2v-7L4 6z" />
          </svg>
        </button>
      </div>
      {isOpen ? (
        <ColumnFilterPanel
          anchorRef={triggerRef}
          column={column}
          currentSortDirection={currentSortDirection}
          currentValues={currentValues}
          onApply={onApply}
          onClose={onToggle}
          options={options}
        />
      ) : null}
    </th>
  );
}

export const DataTableHeader = memo(DataTableHeaderInner) as typeof DataTableHeaderInner;
